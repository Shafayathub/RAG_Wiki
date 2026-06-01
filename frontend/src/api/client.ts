import axios from "axios";
import type { Collection, IngestResponse } from "../types";

const http = axios.create({ baseURL: "http://localhost:5000" });

export async function fetchCollections(): Promise<Collection[]> {
  const res = await http.get<{ data: Collection[] }>("/collections");
  return res?.data?.data;
}

export async function createCollection(name: string): Promise<Collection> {
  const res = await http.post<{ data: Collection }>("/collections", { name });
  return res?.data?.data;
}

export async function uploadDocument(
  file: File,
  collectionName: string,
  onProgress?: (pct: number) => void,
): Promise<IngestResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("collection_name", collectionName);

  const res = await http.post<{ data: IngestResponse }>(
    "/api/v1/ingest",
    form,
    {
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    },
  );

  return res?.data?.data;
}
