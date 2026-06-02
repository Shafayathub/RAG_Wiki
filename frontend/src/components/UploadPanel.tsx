/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { uploadDocument } from "../api/client";

interface Props {
  onUploadSuccess: (collectionName: string) => void;
}

export function UploadPanel({ onUploadSuccess }: Props) {
  const [collectionName, setCollectionName] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!collectionName.trim()) {
      setMessage("Enter a collection name first.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    setProgress(0);
    setMessage("");

    try {
      console.log('Uploading file:', file, 'collectionName:', collectionName.trim());
      const result = await uploadDocument(
        file,
        collectionName.trim(),
        setProgress,
      );
      setMessage(
        `✅ "${result.filename}" ingested — ${result.total_chunks} chunks added to "${collectionName}"`,
      );
      setStatus("success");
      onUploadSuccess(collectionName.trim());
    } catch (error: any) {
      console.error('Upload error:', error);
      // Show more specific error message
      if (error.response) {
        // Server responded with error status
        setMessage(`Upload failed: ${error.response.data?.message || error.response.statusText}`);
      } else if (error.request) {
        // Request was made but no response received
        setMessage('Upload failed: No response from server. Is the backend running?');
      } else {
        // Something else happened
        setMessage(`Upload failed: ${error.message}`);
      }
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-uploaded
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <h2 className="text-base sm:text-lg font-semibold text-gray-100">Upload Document</h2>

      {/* Collection name input */}
      <input
        type="text"
        placeholder="Collection name (e.g. Q4 Reports)"
        value={collectionName}
        onChange={(e) => setCollectionName(e.target.value)}
        className="
          bg-gray-800 border border-gray-700 rounded-lg px-3 sm:px-4 py-2
          text-gray-200 placeholder-gray-500 text-sm w-full
          focus:outline-none focus:ring-2 focus:ring-indigo-500
        "
      />

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`
          border-2 border-dashed rounded-xl p-4 sm:p-6 text-center cursor-pointer
          transition-colors duration-150
          ${isDragging
            ? "border-indigo-400 bg-indigo-950/30"
            : "border-gray-700 hover:border-gray-500"
          }
        `}
      >
        <div className="text-2xl sm:text-3xl mb-2">📄</div>
        <p className="text-gray-400 text-xs sm:text-sm">
          Drop a PDF or Markdown file here
        </p>
        <p className="text-gray-600 text-xs mt-1">or tap to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Upload progress */}
      {status === "uploading" && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Uploading & ingesting…</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Status message */}
      {message && (
        <p
          className={`text-xs sm:text-sm break-words ${
            status === "error" ? "text-red-400" : "text-green-400"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}