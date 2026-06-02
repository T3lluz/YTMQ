/** HTTPS origin for ytmusic-bridge.js (required on music.youtube.com). */
export function bridgeScriptOrigin(): string | null {
  const fromEnv = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return window.location.origin
  }

  return null
}

export function bridgeScriptUrl(roomId: string): string | null {
  const origin = bridgeScriptOrigin()
  if (!origin) return null

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const sb = encodeURIComponent(import.meta.env.VITE_SUPABASE_URL)
  const key = encodeURIComponent(import.meta.env.VITE_SUPABASE_ANON_KEY)
  return `${origin}${base}/ytmusic-bridge.js?roomId=${encodeURIComponent(roomId)}&sb=${sb}&key=${key}`
}

/** One-liner for YouTube Music console — fetch + inline inject (Trusted Types safe). */
export function buildYtmConnectSnippet(roomId: string): string | null {
  const scriptUrl = bridgeScriptUrl(roomId)
  if (!scriptUrl) return null

  const params = JSON.stringify({
    roomId,
    sb: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })

  return `(function(){var p=${params},u=${JSON.stringify(scriptUrl)};window.__YTMQ_BRIDGE_PARAMS__=p;fetch(u).then(function(r){if(!r.ok)throw new Error('load '+r.status);return r.text()}).then(function(c){var s=document.createElement('script'),t=window.trustedTypes;if(t&&t.createPolicy){s.text=t.createPolicy('ytmq',{createScript:function(x){return x}}).createScript(c)}else{s.textContent=c}document.head.appendChild(s)}).catch(function(e){console.error('[YTMQ]',e)})})();`
}

export function needsHttpsBridgeOrigin(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    !import.meta.env.VITE_PUBLIC_SITE_URL
  )
}
