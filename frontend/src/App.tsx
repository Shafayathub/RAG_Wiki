import { useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { ChatWindow } from "./components/ChatWindow";
import { QueryInput } from "./components/QueryInput";
import { useSSEQuery } from "./hooks/useSSEQuery";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { messages, streamState, sendQuery, clearMessages } = useSSEQuery();

  const isStreaming = streamState.status === "streaming";

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Sidebar — upload panel ─────────────────────────────────────── */}
      <aside
        className={`
          flex flex-col shrink-0 border-r border-gray-800
          transition-all duration-200
          ${sidebarOpen ? "w-80" : "w-0 overflow-hidden"}
        `}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <h1 className="font-bold text-base text-gray-100">🗂 RAG Wiki</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-gray-600 hover:text-gray-400 text-sm"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <UploadPanel
            onUploadSuccess={(name) => {
              console.log("Uploaded to collection:", name);
            }}
          />
        </div>
      </aside>

      {/* ── Main — chat area ──────────────────────────────────────────────── */}
      <main className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-300 text-sm"
            >
              ☰
            </button>
          )}
          <h2 className="text-sm font-medium text-gray-400">
            Research Assistant
          </h2>

          {/* Error banner */}
          {streamState.status === "error" && (
            <span className="ml-auto text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded">
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
