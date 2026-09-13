import { useEffect, useRef } from "react";
import type { CitationChunk } from "../types";

interface Props {
  chunks: CitationChunk[];
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function CitationDrawer({ chunks, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the panel on open, close it on Escape, and keep Tab inside
  // it. The trap is what makes aria-modal honest: above the `sm` breakpoint
  // there is no backdrop, so without it Tab reaches the "View sources" buttons
  // sitting visually underneath the panel.
  useEffect(() => {
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Sources, ${chunks.length} cited`}
      className="flex flex-col h-full"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-100">
          Sources ({chunks.length})
        </h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close sources panel"
          className="
            text-gray-400 hover:text-gray-100 text-lg leading-none px-1 rounded
            focus:outline-none focus:ring-2 focus:ring-indigo-400
          "
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <ol className="flex-1 overflow-y-auto p-4 space-y-3">
        {chunks.map((chunk, index) => (
          <li
            key={chunk.chunk_id}
            className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-1.5"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs font-mono bg-indigo-900/60 text-indigo-200 px-1.5 py-0.5 rounded">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate" title={chunk.filename}>
                  {chunk.filename}
                </p>
                <p className="text-xs text-gray-400">
                  {chunk.page_number !== null
                    ? `Page ${chunk.page_number}`
                    : `Chunk ${chunk.chunk_index + 1}`}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              {chunk.content_preview}
              {chunk.content_preview.length >= 200 ? "…" : ""}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
