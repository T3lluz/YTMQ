/** postMessage type when the bridge subscribes on music.youtube.com */
export const YTMQ_CONNECTED_MESSAGE = 'ytmq:connected' as const

/** HTTPS origin for ytmusic-bridge.js (required on music.youtube.com). */
export function bridgeScriptOrigin(): string | null {
  const fromEnv = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return window.location.origin
  }

  return null
}

/** Path to bundled bridge on this deployment (no query string — GH Pages 404s some ? URLs). */
export function bridgeScriptFetchUrl(): string | null {
  const urls = bridgeScriptFetchUrls()
  return urls[0] ?? null
}

/** Fallback when Pages artifact is missing the bridge file (public repo only). */
export const BRIDGE_CDN_URL =
  'https://cdn.jsdelivr.net/gh/T3lluz/YTMQ@main/public/ytmusic-bridge.js'

/** Ordered bridge URLs for the YT Music console loader (deduped). */
export function bridgeScriptFetchUrls(): string[] {
  const origin = bridgeScriptOrigin()
  if (!origin) return []

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const candidates = [
    `${origin}${base}/ytmusic-bridge.js`,
    `${origin}${base}/public/ytmusic-bridge.js`,
    BRIDGE_CDN_URL,
  ]

  return [...new Set(candidates)]
}

/** One-liner for YouTube Music console — fetch + inline inject (Trusted Types safe). */
export function buildYtmConnectSnippet(roomId: string): string | null {
  const urls = bridgeScriptFetchUrls()
  if (urls.length === 0) return null

  const params = JSON.stringify({
    roomId,
    sb: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })

  const urlsJson = JSON.stringify(urls)

  return `(function(){var p=${params},urls=${urlsJson};window.__YTMQ_BRIDGE_PARAMS__=p;function load(i){if(i>=urls.length){console.error('[YTMQ] Could not load bridge from',urls);return}fetch(urls[i]).then(function(r){if(!r.ok)throw new Error('load '+r.status);return r.text()}).then(function(c){var s=document.createElement('script'),t=window.trustedTypes;if(t&&t.createPolicy){s.text=t.createPolicy('ytmq',{createScript:function(x){return x}}).createScript(c)}else{s.textContent=c}document.head.appendChild(s)}).catch(function(){load(i+1)})}load(0)})();`
}

/** Open on music.youtube.com; YTMQ userscript auto-loads the bridge when installed. */
export function buildYtmConnectDeepLink(roomId: string): string | null {
  const bridgeUrls = bridgeScriptFetchUrls()
  if (bridgeUrls.length === 0) return null

  const q = new URLSearchParams({
    roomId,
    sb: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY,
    ytmqBridge: bridgeUrls.join(','),
  })
  return `https://music.youtube.com/?${q}`
}

/** Tampermonkey / Violentmonkey install URL (hosted on your Pages site). */
export function ytmUserscriptInstallUrl(): string | null {
  const origin = bridgeScriptOrigin()
  if (!origin) return null
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${origin}${base}/ytmq-connect.user.js`
}

export function needsHttpsBridgeOrigin(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    !import.meta.env.VITE_PUBLIC_SITE_URL
  )
}
