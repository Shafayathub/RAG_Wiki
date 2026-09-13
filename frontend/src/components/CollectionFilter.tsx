import { useId } from "react";
import type { CollectionSummary } from "../types";

interface Props {
  collections: CollectionSummary[];
  isLoading: boolean;
  selectedId: number | undefined;
  onChange: (id: number | undefined) => void;
}

export function CollectionFilter({
  collections,
  isLoading,
  selectedId,
  onChange,
}: Props) {
  const selectId = useId();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label
        htmlFor={selectId}
        className="text-xs sm:text-sm font-medium text-gray-400 whitespace-nowrap"
      >
        Scope to
      </label>
      <select
        id={selectId}
        disabled={isLoading}
        value={selectedId ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : undefined)
        }
        className="
          bg-gray-800 border border-gray-700 text-gray-200 text-xs sm:text-sm
          rounded-lg px-2 sm:px-3 py-1.5 focus:outline-none focus:ring-2
          focus:ring-indigo-400 disabled:opacity-50
          min-w-0 max-w-full flex-1 sm:flex-none
        "
      >
        <option value="">
          {isLoading ? "Loading collections…" : "All collections"}
        </option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name} ({collection.document_count} doc
            {collection.document_count === 1 ? "" : "s"})
          </option>
        ))}
      </select>
    </div>
  );
}
