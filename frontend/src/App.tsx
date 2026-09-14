import { useCallback, useEffect, useRef, useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { ChatWindow } from "./components/ChatWindow";
import { QueryInput } from "./components/QueryInput";
import { useSSEQuery } from "./hooks/useSSEQuery";
import { useCollections } from "./hooks/useCollections";

const DESKTOP_QUERY = "(min-width: 1024px)";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches,
  );

  const { messages, streamState, sendQuery, clearMessages, stop } = useSSEQuery();
  const { collections, isLoading: isLoadingCollections, refresh } = useCollections();

  const isStreaming = streamState.status === "streaming";

  // Each toggle unmounts the button that was clicked, so focus would otherwise
  // fall back to <body> and the next Tab would restart from the skip link.
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<"open" | "close" | null>(null);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;

    pendingFocusRef.current = null;
    if (target === "open") closeButtonRef.current?.focus();
    else openButtonRef.current?.focus();
  }, [sidebarOpen]);

  const openSidebar = useCallback(() => {
    pendingFocusRef.current = "open";
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    pendingFocusRef.current = "close";
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSidebarOpen(event.matches);

    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const handleUploadSuccess = useCallback(() => {
    // Make the new collection selectable immediately rather than on reload.
    void refresh();
    if (!window.matchMedia(DESKTOP_QUERY).matches) setSidebarOpen(false);
  }, [refresh]);

  return (
    <div className="flex h-dvh bg-gray-950 text-gray-100 overflow-hidden">
      <a
        href="#chat"
        className="
          sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2
          focus:bg-indigo-600 focus:text-white focus:px-3 focus:py-2 focus:rounded-lg
        "
      >
        Skip to conversation
      </a>

      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Below lg the sidebar is an overlay that slides in; at lg and above it
          is in-flow and collapses by width. */}
      <aside
        aria-label="Document library"
        className={`
          flex flex-col shrink-0 border-r border-gray-800 bg-gray-950
          transition-transform duration-300 ease-in-out
          fixed inset-y-0 left-0 z-40 w-[85vw] max-w-80 shadow-2xl
          lg:relative lg:inset-auto lg:z-auto lg:shadow-none lg:max-w-none
          lg:transition-[width] lg:duration-300
          ${
            sidebarOpen
              ? "translate-x-0 lg:w-80"
              : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden"
          }
        `}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800 shrink-0">
          <h1 className="font-bold text-base text-gray-100 truncate">RAG Wiki</h1>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeSidebar}
            aria-label="Close document library"
            className="
              text-gray-400 hover:text-gray-100 text-sm p-1 rounded
              focus:outline-none focus:ring-2 focus:ring-indigo-400
            "
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-6">
          <UploadPanel onUploadSuccess={handleUploadSuccess} />

          <section aria-labelledby="collections-heading" className="space-y-2">
            <h2 id="collections-heading" className="text-xs uppercase tracking-wide text-gray-400">
              Collections
            </h2>
            {isLoadingCollections ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : collections.length === 0 ? (
              <p className="text-xs text-gray-400">
                Nothing ingested yet. Upload a document to get started.
              </p>
            ) : (
              <ul className="space-y-1">
                {collections.map((collection) => (
                  <li
                    key={collection.id}
                    className="flex items-baseline justify-between gap-2 text-xs text-gray-300"
                  >
                    <span className="truncate" title={collection.name}>
                      {collection.name}
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {collection.chunk_count} chunks
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>

      <main id="chat" className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-3 border-b border-gray-800 shrink-0">
          {!sidebarOpen && (
            <button
              ref={openButtonRef}
              type="button"
              onClick={openSidebar}
              aria-label="Open document library"
              className="
                text-gray-400 hover:text-gray-100 text-lg p-1 -ml-1 rounded
                focus:outline-none focus:ring-2 focus:ring-indigo-400
              "
            >
              <span aria-hidden="true">☰</span>
            </button>
          )}

          <h2 className="text-xs sm:text-sm font-medium text-gray-300 truncate">
            Research Assistant
          </h2>

          {streamState.status === "error" && (
            <span
              role="alert"
              className="ml-auto text-xs text-red-300 bg-red-950/60 px-2 py-1 rounded max-w-[50%] truncate"
              title={streamState.errorMessage ?? undefined}
            >
              {streamState.errorMessage}
            </span>
          )}
        </header>

        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          onClear={clearMessages}
          onAskSample={(question) => void sendQuery(question)}
        />

        <QueryInput
          collections={collections}
          isLoadingCollections={isLoadingCollections}
          onSend={(query, collectionId) => void sendQuery(query, collectionId)}
          onStop={stop}
          isStreaming={isStreaming}
        />
      </main>
    </div>
  );
}
