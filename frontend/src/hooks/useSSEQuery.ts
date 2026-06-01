import { useState, useRef, useCallback } from "react";
import type {
  ChatMessage,
  CitationPayload,
  QueryMeta,
  StreamState,
} from "../types";

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useSSEQuery() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamState, setStreamState] = useState<StreamState>({
    status: "idle",
    errorMessage: null,
  });

  // Ref to the current assistant message id — updated during streaming
  const assistantIdRef = useRef<string | null>(null);

  const sendQuery = useCallback(
    async (query: string, collectionId?: number) => {
      // ── 1. Append user message ──────────────────────────────────────────
      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: query,
        citations: null,
        meta: null,
        isStreaming: false,
      };

      setMessages((prev) => [...prev, userMsg]);

      // ── 2. Append empty assistant message — will be filled by tokens ───
      const assistantId = makeId();
      assistantIdRef.current = assistantId;

      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        citations: null,
        meta: null,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setStreamState({ status: "streaming", errorMessage: null });

      // ── 3. Open SSE connection via fetch (EventSource doesn't support POST)
      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            collection_id: collectionId,
            top_k: 5,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep last incomplete line in buffer
          buffer = lines.pop() ?? "";

          let currentEvent = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              const raw = line.replace("data:", "").trim();

              // ── token ────────────────────────────────────────────────────
              if (currentEvent === "token") {
                const token = JSON.parse(raw) as string;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + token }
                      : m,
                  ),
                );
              }

              // ── citation ─────────────────────────────────────────────────
              else if (currentEvent === "citation") {
                const citations = JSON.parse(raw) as CitationPayload;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, citations } : m,
                  ),
                );
              }

              // ── meta ──────────────────────────────────────────────────────
              else if (currentEvent === "meta") {
                const meta = JSON.parse(raw) as QueryMeta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, meta, isStreaming: false }
                      : m,
                  ),
                );
              }

              // ── done ──────────────────────────────────────────────────────
              else if (currentEvent === "done") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, isStreaming: false } : m,
                  ),
                );
                setStreamState({ status: "done", errorMessage: null });
              }

              // ── error ─────────────────────────────────────────────────────
              else if (currentEvent === "error") {
                const { message } = JSON.parse(raw) as { message: string };
                throw new Error(message);
              }

              currentEvent = "";
            }
          }
        }

        setStreamState({ status: "done", errorMessage: null });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong";

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || message, isStreaming: false }
              : m,
          ),
        );
        setStreamState({ status: "error", errorMessage: message });
      }
    },
    [],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamState({ status: "idle", errorMessage: null });
  }, []);

  return { messages, streamState, sendQuery, clearMessages };
}
