import { useId, useRef, useState } from "react";
import { toApiError, uploadDocument } from "../api/client";

interface Props {
  onUploadSuccess: (collectionName: string) => void;
}

type UploadStatus = "idle" | "uploading" | "success" | "error";

const ACCEPTED_EXTENSIONS = [".pdf", ".md", ".markdown"];

export function UploadPanel({ onUploadSuccess }: Props) {
  const [collectionName, setCollectionName] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const nameInputId = useId();
  const statusId = useId();

  async function handleFile(file: File) {
    const name = collectionName.trim();

    if (!name) {
      setStatus("error");
      setMessage("Enter a collection name first.");
      return;
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setStatus("error");
      setMessage("Only PDF and Markdown files can be ingested.");
      return;
    }

    setStatus("uploading");
    setProgress(0);
    setMessage("");

    try {
      const result = await uploadDocument(file, name, setProgress);
      setStatus("success");
      setMessage(
        `"${result.filename}" ingested — ${result.total_chunks} chunks added to "${name}".`,
      );
      onUploadSuccess(name);
    } catch (error) {
      setStatus("error");
      setMessage(toApiError(error).message);
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so selecting the same file again still fires a change event.
    event.target.value = "";
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  const isUploading = status === "uploading";

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <h2 className="text-base sm:text-lg font-semibold text-gray-100">
        Upload a document
      </h2>

      <div className="space-y-1.5">
        <label htmlFor={nameInputId} className="block text-xs text-gray-400">
          Collection
        </label>
        <input
          id={nameInputId}
          type="text"
          placeholder="e.g. Q4 Reports"
          value={collectionName}
          onChange={(event) => setCollectionName(event.target.value)}
          disabled={isUploading}
          className="
            bg-gray-800 border border-gray-700 rounded-lg px-3 sm:px-4 py-2
            text-gray-100 placeholder-gray-500 text-sm w-full
            focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50
          "
        />
      </div>

      {/* A real button rather than a click-handled div: it is reachable by Tab
          and activates on Enter and Space for free. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        disabled={isUploading}
        className={`
          border-2 border-dashed rounded-xl p-4 sm:p-6 text-center w-full
          transition-colors duration-150 disabled:opacity-50
          focus:outline-none focus:ring-2 focus:ring-indigo-400
          ${
            isDragging
              ? "border-indigo-400 bg-indigo-950/30"
              : "border-gray-700 hover:border-gray-500"
          }
        `}
      >
        <div className="text-2xl sm:text-3xl mb-2" aria-hidden="true">
          📄
        </div>
        <p className="text-gray-300 text-xs sm:text-sm">
          Drop a PDF or Markdown file here
        </p>
        <p className="text-gray-500 text-xs mt-1">or select a file to browse</p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onInputChange}
      />

      {isUploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Uploading and ingesting…</span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
            className="w-full bg-gray-800 rounded-full h-1.5"
          >
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {message && (
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className={`text-xs sm:text-sm break-words ${
            status === "error" ? "text-red-300" : "text-green-300"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
