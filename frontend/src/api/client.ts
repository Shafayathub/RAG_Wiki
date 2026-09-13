import axios, { AxiosError } from "axios";
import type { CollectionSummary, IngestResponse } from "../types";

/**
 * Relative by default: the SPA and the API are served from the same origin in
 * production, and the Vite dev server proxies the same path to the local
 * backend. Only a split deployment needs VITE_API_BASE_URL.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api/v1";

const http = axios.create({ baseURL: API_BASE_URL });

interface ApiErrorBody {
  error?: string;
  code?: string;
  request_id?: string;
  details?: Array<{ field: string; message: string }>;
}

/** A transport-agnostic error the UI can render without knowing about axios. */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    message: string,
    status: number | null,
    code: string | null,
    requestId: string | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined;

    if (body?.details?.length) {
      const detail = body.details
        .map((item) => `${item.field}: ${item.message}`)
        .join(", ");
      return new ApiError(detail, error.response?.status ?? null, body.code ?? null, body.request_id ?? null);
    }

    if (body?.error) {
      return new ApiError(body.error, error.response?.status ?? null, body.code ?? null, body.request_id ?? null);
    }

    if (error.code === "ERR_NETWORK") {
      return new ApiError("Cannot reach the server. Check your connection and try again.", null, "NETWORK", null);
    }

    return new ApiError(error.message, error.response?.status ?? null, null, null);
  }

  return new ApiError(error instanceof Error ? error.message : "Something went wrong", null, null, null);
}

export async function fetchCollections(): Promise<CollectionSummary[]> {
  try {
    const res = await http.get<{ data: CollectionSummary[] }>("/collections");
    return res.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function uploadDocument(
  file: File,
  collectionName: string,
  onProgress?: (percent: number) => void,
): Promise<IngestResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("collection_name", collectionName);

  try {
    const res = await http.post<{ data: IngestResponse }>("/ingest", form, {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
    return res.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export function queryStreamUrl(): string {
  return `${API_BASE_URL}/query`;
}
