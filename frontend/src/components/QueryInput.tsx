import { useRef, useState } from "react";
import { CollectionFilter } from "./CollectionFilter";
import type { CollectionSummary } from "../types";

interface Props {
  collections: CollectionSummary[];
  isLoadingCollections: boolean;
  onSend: (query: string, collectionId?: number) => void;
  onStop: () => void;
  isStreaming: boolean;
}

const MAX_TEXTAREA_HEIGHT = 160;

export function QueryInput({
  collections,
  isLoadingCollections,
  onSend,
  onStop,
  isStreaming,
}: Props) {
  const [query, setQuery] = useState("");
  const [collectionId, setCollectionId] = useState<number | undefined>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const trimmed = query.trim();
    if (!trimmed || isStreaming) return;

    onSend(trimmed, collectionId);
    setQuery("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function onInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuery(event.target.value);

    const element = event.target;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  return (
    <div className="border-t border-gray-800 px-3 sm:px-4 py-2.5 sm:py-3 space-y-2">
      <CollectionFilter
        collections={collections}
        isLoading={isLoadingCollections}
        selectedId={collectionId}
        onChange={setCollectionId}
      />

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={query}
          onChange={onInput}
          onKeyDown={onKeyDown}
          disabled={isStreaming}
          aria-label="Ask a question about your documents"
          placeholder="Ask a question…"
          className="
            flex-1 resize-none bg-gray-800 border border-gray-700
            rounded-xl px-3 sm:px-4 py-2.5 text-sm text-gray-100
            placeholder-gray-500 focus:outline-none focus:ring-2
            focus:ring-indigo-400 disabled:opacity-50
            max-h-40 overflow-y-auto
          "
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="
              bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-xl
              px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-indigo-400 shrink-0
            "
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!query.trim()}
            className="
              bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
              disabled:cursor-not-allowed text-white rounded-xl
              px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-indigo-400
              flex items-center gap-1.5 shrink-0
            "
          >
            <span className="hidden sm:inline">Send</span>
            <span aria-hidden="true">↑</span>
          </button>
        )}
      </div>

      <p className="text-[10px] text-gray-600 sm:hidden text-center">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
