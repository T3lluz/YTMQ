/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_PUBLIC_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __YTMQ_BRIDGE_PARAMS__?: {
    roomId: string
    sb: string
    key: string
  }
  __YTMQ_BRIDGE__?: unknown
}
