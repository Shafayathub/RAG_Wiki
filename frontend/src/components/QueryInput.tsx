import { useState, useRef } from "react";
import { CollectionFilter } from "./CollectionFilter";

interface Props {
  onSend: (query: string, collectionId?: number) => void;
  isStreaming: boolean;
}

export function QueryInput({ onSend, isStreaming }: Props) {
  const [query, setQuery] = useState("");
  const [collectionId, setCollectionId] = useState<number | undefined>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const trimmed = query.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed, collectionId);
    setQuery("");
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Submit on Enter, new line on Shift+Enter
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuery(e.target.value);
    // Auto-grow textarea up to 160px
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <div className="border-t border-gray-700 px-3 sm:px-4 py-2.5 sm:py-3 space-y-2">
      <CollectionFilter selectedId={collectionId} onChange={setCollectionId} />

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={query}
          onChange={onInput}
          onKeyDown={onKeyDown}
          disabled={isStreaming}
          placeholder="Ask a question…"
          className="
            flex-1 resize-none bg-gray-800 border border-gray-700
            rounded-xl px-3 sm:px-4 py-2.5 text-sm text-gray-200
            placeholder-gray-600 focus:outline-none focus:ring-2
            focus:ring-indigo-500 disabled:opacity-50
            max-h-40 overflow-y-auto
          "
        />

        <button
          onClick={handleSubmit}
          disabled={!query.trim() || isStreaming}
          className="
            bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
            disabled:cursor-not-allowed text-white rounded-xl
            px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors
            flex items-center gap-1.5 shrink-0
          "
        >
          {isStreaming ? (
            <>
              <span className="animate-spin text-base">⏳</span>
              <span className="hidden sm:inline">Thinking</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">Send</span> ↑
            </>
          )}
        </button>
      </div>

      {/* Mobile hint — only visible on small screens */}
      <p className="text-[10px] text-gray-700 sm:hidden text-center">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
