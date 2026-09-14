import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CitationDrawer } from "./CitationDrawer";
import { SAMPLE_QUESTIONS } from "../lib/sampleQuestions";
import type { ChatMessage, CitationChunk } from "../types";

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  onClear: () => void;
  onAskSample: (question: string) => void;
}

/** How close to the bottom still counts as "following along", in pixels. */
const AUTOSCROLL_THRESHOLD = 120;

export function ChatWindow({ messages, isStreaming, onClear, onAskSample }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const citationTriggerRef = useRef<HTMLElement | null>(null);
  const justClearedRef = useRef(false);
  const [drawerChunks, setDrawerChunks] = useState<CitationChunk[] | null>(null);

  // Whether the reader is following the stream, measured from the scroll
  // position *before* new content lands. Measuring after the fact misreads a
  // single large flush as "they scrolled away" and silently stops following.
  const isFollowingRef = useRef(true);
  const isEmpty = messages.length === 0;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      isFollowingRef.current = distanceFromBottom <= AUTOSCROLL_THRESHOLD;
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [isEmpty]);

  // Layout effect, not effect: correcting the scroll after paint shows the old
  // position for a frame, on every flush.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    // Yanking the viewport down while they are reading earlier text is the
    // single most irritating thing a chat UI can do.
    if (container && isFollowingRef.current) container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Clearing unmounts the button that was clicked, so hand focus to the empty
  // state rather than dropping it on <body>.
  useEffect(() => {
    if (isEmpty && justClearedRef.current) {
      justClearedRef.current = false;
      emptyStateRef.current?.focus();
    }
  }, [isEmpty]);

  const handleClear = useCallback(() => {
    justClearedRef.current = true;
    onClear();
  }, [onClear]);

  const openDrawer = useCallback((chunks: CitationChunk[]) => {
    citationTriggerRef.current = document.activeElement as HTMLElement | null;
    setDrawerChunks(chunks);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerChunks(null);
    // The trigger stays mounted behind the drawer, so returning focus to it
    // puts the reader back where they were.
    citationTriggerRef.current?.focus();
    citationTriggerRef.current = null;
  }, []);

  // Screen readers are told the answer once, when it is complete. A region that
  // mutates every animation frame produces overlapping speech and no usable
  // answer, so this holds a status line until the stream finishes and only then
  // changes to the full text.
  const lastMessage = messages[messages.length - 1];
  const announcement = isStreaming
    ? "Assistant is answering…"
    : lastMessage?.role === "assistant"
      ? lastMessage.content
      : "";

  const liveRegion = (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </p>
  );

  if (isEmpty) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
        {liveRegion}
        <div
          ref={emptyStateRef}
          tabIndex={-1}
          className="text-center space-y-5 max-w-md focus:outline-none"
        >
          <div className="space-y-2">
            <div className="text-4xl sm:text-5xl" aria-hidden="true">
              🔍
            </div>
            <h2 className="text-base font-semibold text-gray-200">
              Ask a question about your documents
            </h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Answers are generated only from the uploaded sources, and every
              claim links back to the passage it came from.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Try one of these
            </p>
            <ul className="space-y-1.5">
              {SAMPLE_QUESTIONS.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => onAskSample(question)}
                    className="
                      w-full text-left text-xs sm:text-sm text-indigo-300
                      bg-gray-900 hover:bg-gray-800 border border-gray-800
                      hover:border-gray-700 rounded-lg px-3 py-2 transition-colors
                      focus:outline-none focus:ring-2 focus:ring-indigo-400
                    "
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 relative">
      {liveRegion}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4"
      >
        {/* aria-live is off here on purpose: the text mutates on every
            animation frame while streaming. The sr-only region above announces
            the finished answer once instead. */}
        <div
          role="log"
          aria-live="off"
          aria-busy={isStreaming}
          className="space-y-3 sm:space-y-4"
        >
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onViewCitations={openDrawer}
            />
          ))}
        </div>
      </div>

      {!isStreaming && (
        <button
          type="button"
          onClick={handleClear}
          className="
            absolute top-2 right-2 text-xs text-gray-400 hover:text-gray-100
            transition-colors bg-gray-900/90 backdrop-blur-sm px-2 py-1 rounded-md
            focus:outline-none focus:ring-2 focus:ring-indigo-400
          "
        >
          Clear chat
        </button>
      )}

      {drawerChunks && (
        <>
          <div
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/40 z-10 sm:hidden"
          />
          <div
            className="
              absolute right-0 top-0 h-full w-full sm:w-80
              bg-gray-900 border-l border-gray-700 shadow-xl z-20 flex flex-col
            "
          >
            <CitationDrawer
              chunks={drawerChunks}
              onClose={closeDrawer}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface BubbleProps {
  message: ChatMessage;
  onViewCitations: (chunks: CitationChunk[]) => void;
}

/**
 * Memoised because a streaming answer re-renders the transcript up to sixty
 * times a second, and without this every finished bubble re-parses its
 * Markdown on each of those renders.
 */
const MessageBubble = memo(function MessageBubble({ message, onViewCitations }: BubbleProps) {
  const isUser = message.role === "user";
  const citationCount = message.citations?.chunks.length ?? 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[92%] sm:max-w-[80%] lg:max-w-[70%]
          rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 space-y-2
          ${
            isUser
              ? "bg-indigo-600 text-white"
              : message.isError
                ? "bg-red-950/60 border border-red-900 text-red-100"
                : "bg-gray-800 text-gray-100"
          }
        `}
      >
        <p
          className={`text-xs font-medium ${
            isUser ? "text-indigo-100" : "text-gray-400"
          }`}
        >
          {isUser ? "You" : "Assistant"}
        </p>

        {isUser ? (
          <p className="text-sm wrap-break-word">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm prose-invert max-w-none wrap-break-word">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.isStreaming && (
              <span
                className="inline-block w-1.5 h-4 bg-gray-300 animate-pulse ml-0.5 align-middle"
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {!isUser && citationCount > 0 && (
          <button
            type="button"
            onClick={() => onViewCitations(message.citations!.chunks)}
            className="
              text-xs text-indigo-300 hover:text-indigo-200 rounded
              flex items-center gap-1 transition-colors
              focus:outline-none focus:ring-2 focus:ring-indigo-400
            "
          >
            <span aria-hidden="true">📎</span>
            View {citationCount} source{citationCount > 1 ? "s" : ""}
          </button>
        )}

        {!isUser && message.meta && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>{message.meta.latency_ms} ms</span>
            {message.meta.cache_hit !== "none" && (
              <span className="bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded">
                cached
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
