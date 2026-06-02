import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, CitationChunk } from "../types";
import { CitationDrawer } from "./CitationDrawer";

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  onClear: () => void;
}

export function ChatWindow({ messages, isStreaming, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [drawerChunks, setDrawerChunks] = useState<CitationChunk[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-scroll to bottom as tokens stream in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function openCitations(chunks: CitationChunk[]) {
    setDrawerChunks(chunks);
    setDrawerOpen(true);
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 px-4">
        <div className="text-center space-y-2">
          <div className="text-4xl sm:text-5xl">🔍</div>
          <p className="text-xs sm:text-sm">Ask a question about your documents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onViewCitations={openCitations}
          />
        ))}

        {/* Streaming cursor */}
        {isStreaming && (
          <div className="flex items-center gap-1 text-gray-500 text-sm pl-1">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse delay-75">●</span>
            <span className="animate-pulse delay-150">●</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Clear button */}
      {messages.length > 0 && !isStreaming && (
        <button
          onClick={onClear}
          className="
            absolute top-2 right-2 text-xs text-gray-600
            hover:text-gray-400 transition-colors
            bg-gray-900/80 backdrop-blur-sm px-2 py-1 rounded-md
          "
        >
          Clear chat
        </button>
      )}

      {/* Citation drawer — slides in from the right */}
      {drawerOpen && (
        <>
          {/* Backdrop on mobile */}
          <div
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40 z-[9] sm:hidden"
          />
          <div
            className="
              absolute right-0 top-0 h-full
              w-full sm:w-80
              bg-gray-900 border-l border-gray-700
              shadow-xl z-10 flex flex-col
              animate-slide-in-right
            "
          >
            <CitationDrawer
              chunks={drawerChunks}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────────

interface BubbleProps {
  message: ChatMessage;
  onViewCitations: (chunks: CitationChunk[]) => void;
}

function MessageBubble({ message, onViewCitations }: BubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[92%] sm:max-w-[80%] lg:max-w-[70%]
          rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 space-y-2
          ${isUser ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-200"}
        `}
      >
        {/* Role label */}
        <p
          className={`text-xs font-medium ${isUser ? "text-indigo-200" : "text-gray-500"}`}
        >
          {isUser ? "You" : "Assistant"}
        </p>

        {/* Content — render markdown for assistant messages */}
        {isUser ? (
          <p className="text-sm break-words">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm prose-invert max-w-none break-words">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {/* Citations button */}
        {!isUser &&
          message.citations &&
          message.citations.chunks.length > 0 && (
            <button
              onClick={() => onViewCitations(message.citations!.chunks)}
              className="
              text-xs text-indigo-400 hover:text-indigo-300
              flex items-center gap-1 transition-colors
            "
            >
              📎 {message.citations.chunks.length} source
              {message.citations.chunks.length > 1 ? "s" : ""}
            </button>
          )}

        {/* Meta — cache hit badge + latency */}
        {!isUser && message.meta && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span>{message.meta.latency_ms}ms</span>
            {message.meta.cache_hit !== "none" && (
              <span
                className="
                bg-green-900/40 text-green-400
                px-1.5 py-0.5 rounded text-xs
              "
              >
                ⚡ cached
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
