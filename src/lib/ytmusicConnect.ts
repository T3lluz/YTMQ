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
  const origin = bridgeScriptOrigin()
  if (!origin) return null

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${origin}${base}/ytmusic-bridge.js`
}

/** Fallback when Pages artifact is missing the bridge file (served from git @ main). */
export const BRIDGE_CDN_URL =
  'https://cdn.jsdelivr.net/gh/T3lluz/YTMQ@main/public/ytmusic-bridge.js'

/** One-liner for YouTube Music console — fetch + inline inject (Trusted Types safe). */
export function buildYtmConnectSnippet(roomId: string): string | null {
  const primaryUrl = bridgeScriptFetchUrl()
  if (!primaryUrl) return null

  const params = JSON.stringify({
    roomId,
    sb: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })

  const urls = JSON.stringify([primaryUrl, BRIDGE_CDN_URL])

  return `(function(){var p=${params},urls=${urls};window.__YTMQ_BRIDGE_PARAMS__=p;function load(i){if(i>=urls.length){console.error('[YTMQ] Could not load bridge from',urls);return}fetch(urls[i]).then(function(r){if(!r.ok)throw new Error('load '+r.status);return r.text()}).then(function(c){var s=document.createElement('script'),t=window.trustedTypes;if(t&&t.createPolicy){s.text=t.createPolicy('ytmq',{createScript:function(x){return x}}).createScript(c)}else{s.textContent=c}document.head.appendChild(s)}).catch(function(){load(i+1)})}load(0)})();`
}

export function needsHttpsBridgeOrigin(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    !import.meta.env.VITE_PUBLIC_SITE_URL
  )
}
