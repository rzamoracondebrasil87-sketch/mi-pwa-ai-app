/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GEMINI_API_KEYS: string;
  readonly VITE_GEMINI_RETRIES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
