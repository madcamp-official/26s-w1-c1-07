/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client ID (client/.env) — GIS "Sign in with Google" (client/src/auth/google.ts) */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
