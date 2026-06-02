/** postMessage type when the bridge subscribes on music.youtube.com */
export const YTMQ_CONNECTED_MESSAGE = 'ytmq:connected' as const

const viteBasePath = () => import.meta.env.BASE_URL.replace(/\/$/, '')

/**
 * Deploy root for static assets (includes `/YTMQ` on GitHub Pages).
 * `VITE_PUBLIC_SITE_URL` is the full site root; do not append BASE_URL twice.
 */
export function bridgeSiteRoot(): string | null {
  const base = viteBasePath()
  const fromEnv = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, '')

  if (fromEnv) {
    if (base && fromEnv.endsWith(base)) return fromEnv
    return base ? `${fromEnv}${base}` : fromEnv
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    const { origin } = window.location
    return base ? `${origin}${base}` : origin
  }

  return null
}

/** @deprecated Use bridgeSiteRoot — kept for callers expecting an “origin”. */
export function bridgeScriptOrigin(): string | null {
  return bridgeSiteRoot()
}

/** Path to bundled bridge on this deployment (no query string — GH Pages 404s some ? URLs). */
export function bridgeScriptFetchUrl(): string | null {
  const urls = bridgeScriptFetchUrls()
  return urls[0] ?? null
}

/** Ordered bridge URLs for the YT Music console loader (deduped). */
export function bridgeScriptFetchUrls(): string[] {
  const root = bridgeSiteRoot()
  if (!root) return []

  return [`${root}/ytmusic-bridge.js`]
}

function bridgeParamsJson(roomId: string, playbackSince: string) {
  return JSON.stringify({
    roomId,
    sb: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY,
    since: playbackSince,
  })
}

/** One-liner for YouTube Music console — fetch + inline inject (Trusted Types safe). */
export function buildYtmConnectSnippet(
  roomId: string,
  playbackSince: string,
): string | null {
  const urls = bridgeScriptFetchUrls()
  if (urls.length === 0) return null

  const params = bridgeParamsJson(roomId, playbackSince)

  const urlsJson = JSON.stringify(urls)

  return `(function(){var p=${params},urls=${urlsJson};window.__YTMQ_BRIDGE_PARAMS__=p;function load(i){if(i>=urls.length){console.error('[YTMQ] Could not load bridge from',urls);return}fetch(urls[i]).then(function(r){if(!r.ok)throw new Error('load '+r.status);return r.text()}).then(function(c){var s=document.createElement('script'),t=window.trustedTypes;if(t&&t.createPolicy){s.text=t.createPolicy('ytmq',{createScript:function(x){return x}}).createScript(c)}else{s.textContent=c}document.head.appendChild(s)}).catch(function(){load(i+1)})}load(0)})();`
}

/** Open on music.youtube.com; YTMQ userscript auto-loads the bridge when installed. */
export function buildYtmConnectDeepLink(
  roomId: string,
  playbackSince: string,
): string | null {
  const bridgeUrls = bridgeScriptFetchUrls()
  if (bridgeUrls.length === 0) return null

  const q = new URLSearchParams({
    roomId,
    sb: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY,
    since: playbackSince,
    ytmqBridge: bridgeUrls.join(','),
  })
  return `https://music.youtube.com/?${q}`
}

/** Tampermonkey / Violentmonkey install URL (hosted on your Pages site). */
export function ytmUserscriptInstallUrl(): string | null {
  const root = bridgeSiteRoot()
  if (!root) return null
  return `${root}/ytmq-connect.user.js`
}

export function needsHttpsBridgeOrigin(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    !import.meta.env.VITE_PUBLIC_SITE_URL
  )
}
