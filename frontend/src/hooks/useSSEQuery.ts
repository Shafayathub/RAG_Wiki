import { useCallback, useRef, useState } from "react";
import { queryStreamUrl, toApiError } from "../api/client";
import { createSSEParser } from "../lib/sse";
import type {
  ChatMessage,
  CitationPayload,
  QueryMeta,
  StreamState,
} from "../types";

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

/**
 * Reads the answer stream for one question.
 *
 * fetch + ReadableStream rather than EventSource: EventSource is GET-only, and
 * the question, collection filter and top-k belong in a request body.
 */
export function useSSEQuery() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamState, setStreamState] = useState<StreamState>({
    status: "idle",
    errorMessage: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const patchMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((message) => (message.id === id ? { ...message, ...patch } : message)),
      );
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendQuery = useCallback(
    async (query: string, collectionId?: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = makeId();

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "user",
          content: query,
          citations: null,
          meta: null,
          isStreaming: false,
        },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          citations: null,
          meta: null,
          isStreaming: true,
        },
      ]);

      setStreamState({ status: "streaming", errorMessage: null });

      try {
        const response = await fetch(queryStreamUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, collection_id: collectionId }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          // An error before the stream opens is JSON, not SSE.
          const body: unknown = await response.json().catch(() => null);
          const message =
            body && typeof body === "object" && "error" in body
              ? String((body as { error: unknown }).error)
              : `Request failed with status ${response.status}`;
          throw new Error(message);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parse = createSSEParser();

        // Tokens arrive far faster than React should re-render. Buffer them
        // and flush on animation frames so a long answer stays at 60fps.
        let pending = "";
        let flushHandle: number | null = null;

        const flush = () => {
          flushHandle = null;
          if (!pending) return;
          const text = pending;
          pending = "";
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + text }
                : message,
            ),
          );
        };

        const scheduleFlush = () => {
          flushHandle ??= requestAnimationFrame(flush);
        };

        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;

            for (const message of parse(decoder.decode(value, { stream: true }))) {
              switch (message.event) {
                case "token":
                  pending += JSON.parse(message.data) as string;
                  scheduleFlush();
                  break;

                case "citation":
                  flush();
                  patchMessage(assistantId, {
                    citations: JSON.parse(message.data) as CitationPayload,
                  });
                  break;

                case "meta":
                  flush();
                  patchMessage(assistantId, { meta: JSON.parse(message.data) as QueryMeta });
                  break;

                case "error":
                  throw new Error(
                    (JSON.parse(message.data) as { message: string }).message,
                  );

                default:
                  break;
              }
            }
          }
        } finally {
          if (flushHandle !== null) cancelAnimationFrame(flushHandle);
          flush();
        }

        patchMessage(assistantId, { isStreaming: false });
        setStreamState({ status: "done", errorMessage: null });
      } catch (error) {
        if (controller.signal.aborted) {
          patchMessage(assistantId, { isStreaming: false });
          setStreamState({ status: "idle", errorMessage: null });
          return;
        }

        const message = toApiError(error).message;
        patchMessage(assistantId, { content: message, isStreaming: false, isError: true });
        setStreamState({ status: "error", errorMessage: message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [patchMessage],
  );

  const clearMessages = useCallback(() => {
    stop();
    setMessages([]);
    setStreamState({ status: "idle", errorMessage: null });
  }, [stop]);

  return { messages, streamState, sendQuery, clearMessages, stop };
}
