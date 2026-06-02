import { useState, useEffect } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { ChatWindow } from "./components/ChatWindow";
import { QueryInput } from "./components/QueryInput";
import { useSSEQuery } from "./hooks/useSSEQuery";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.innerWidth >= 1024
  );
  const { messages, streamState, sendQuery, clearMessages } = useSSEQuery();
  const isStreaming = streamState.status === "streaming";

  // Auto-toggle sidebar when crossing the lg breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Backdrop — mobile/tablet only ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ── Sidebar ──
           < lg  → fixed overlay, slides via translate-x
           ≥ lg  → relative in-flow, collapses via width
      */}
      <aside
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
          <h1 className="font-bold text-base text-gray-100 truncate">
            🗂 RAG Wiki
          </h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-gray-500 hover:text-gray-300 text-sm p-1"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <UploadPanel
            onUploadSuccess={(name) => {
              console.log("Uploaded to collection:", name);
              // Auto-close sidebar on small screens after upload
              if (window.innerWidth < 1024) setSidebarOpen(false);
            }}
          />
        </div>
      </aside>

      {/* ── Main — chat area ── */}
      <main className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-3 border-b border-gray-800 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-300 text-lg p-1 -ml-1"
              aria-label="Open sidebar"
            >
              ☰
            </button>
          )}

          <h2 className="text-xs sm:text-sm font-medium text-gray-400 truncate">
            Research Assistant
          </h2>

          {/* Error banner */}
          {streamState.status === "error" && (
            <span className="ml-auto text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded max-w-[50%] truncate">
              {streamState.errorMessage}
            </span>
          )}
        </header>

        {/* Chat messages */}
        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          onClear={clearMessages}
        />

        {/* Query input */}
        <QueryInput onSend={sendQuery} isStreaming={isStreaming} />
      </main>
    </div>
  );
}