import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    try {
      setCollections(await fetchCollections());
      setError(null);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // The guard drops a response that lands after unmount, and stops a slow
    // first load from overwriting a refresh that has already succeeded.
    let active = true;

    fetchCollections()
      .then((data) => {
        if (!active) return;
        setCollections(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (active) setError(toApiError(err).message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { collections, isLoading, error, refresh };
}
