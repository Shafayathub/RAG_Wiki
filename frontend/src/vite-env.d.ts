/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the API origin when the SPA and API are deployed separately. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
