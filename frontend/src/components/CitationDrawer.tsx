import type { CitationChunk } from "../types";

interface Props {
  chunks: CitationChunk[];
  onClose: () => void;
}

export function CitationDrawer({ chunks, onClose }: Props) {
  if (chunks.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-100">
          Sources ({chunks.length})
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* Chunk list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chunks.map((chunk, i) => (
          <div
            key={chunk.chunk_id}
            className="
              bg-gray-800 border border-gray-700 rounded-lg p-3
              space-y-1.5
            "
          >
            {/* Source header */}
            <div className="flex items-start justify-between gap-2">
              <span
                className="
                text-xs font-mono bg-indigo-900/60 text-indigo-300
                px-1.5 py-0.5 rounded
              "
              >
                [{i + 1}]
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-300 truncate">
                  {chunk.filename}
                </p>
                <p className="text-xs text-gray-500">
                  {chunk.page_number
                    ? `Page ${chunk.page_number}`
                    : `Chunk ${chunk.chunk_index + 1}`}
                </p>
              </div>
            </div>

            {/* Content preview */}
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-4">
              {chunk.content_preview}
              {chunk.content_preview.length === 200 ? "…" : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
