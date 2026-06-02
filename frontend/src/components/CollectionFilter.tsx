import { useEffect, useState } from "react";
import { fetchCollections } from "../api/client";
import type { Collection } from "../types";

interface Props {
  selectedId: number | undefined;
  onChange: (id: number | undefined) => void;
}

export function CollectionFilter({ selectedId, onChange }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollections()
      .then(setCollections)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs sm:text-sm font-medium text-gray-400 whitespace-nowrap">
        Scope to
      </label>
      <select
        disabled={loading}
        value={selectedId ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)
        }
        className="
          bg-gray-800 border border-gray-700 text-gray-200 text-xs sm:text-sm
          rounded-lg px-2 sm:px-3 py-1.5 focus:outline-none focus:ring-2
          focus:ring-indigo-500 disabled:opacity-50
          min-w-0 max-w-full flex-1 sm:flex-none
        "
      >
        <option value="">All collections</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
