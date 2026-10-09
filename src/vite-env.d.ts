/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API URL; defaults to `<origin><base>api`. */
  readonly VITE_API_URL?: string
  readonly VITE_PUBLIC_SITE_URL?: string
  readonly VITE_SPOTIFY_CLIENT_ID?: string
  readonly VITE_SPOTIFY_CLIENT_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __YTMQ_BRIDGE_PARAMS__?: {
    roomId: string
    api: string
    since?: string
  }
  __YTMQ_BRIDGE__?: unknown
}
