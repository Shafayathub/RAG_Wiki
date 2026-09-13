import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCollections, toApiError } from "../api/client";
import type { CollectionSummary } from "../types";

export interface UseCollectionsResult {
  collections: CollectionSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Owns the collection list for the whole app so an upload and the query filter
 * cannot disagree about what exists: the filter updates the moment an ingest
 * completes.
 */
export function useCollections(): UseCollectionsResult {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Identifies the newest request rather than merely "still mounted". An
  // upload's refresh routinely resolves before the slower first load, and a
  // mounted-only guard would let that stale response overwrite it.
  const latestRequest = useRef(0);

  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    const isCurrent = () => requestId === latestRequest.current;

    return fetchCollections()
      .then((data) => {
        if (!isCurrent()) return;
        setCollections(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (isCurrent()) setError(toApiError(err).message);
      })
      .finally(() => {
        if (isCurrent()) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    void load();

    return () => {
      // Nothing in flight belongs to a newer request than this one, so bumping
      // the counter discards every pending response on unmount.
      latestRequest.current += 1;
    };
  }, [load]);

  return { collections, isLoading, error, refresh: load };
}
