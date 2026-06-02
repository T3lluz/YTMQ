/** Sanity-check bridge URL construction (no double /YTMQ/). */

function bridgeSiteRoot({ VITE_PUBLIC_SITE_URL, BASE_URL }) {
  const base = BASE_URL.replace(/\/$/, '')
  const fromEnv = VITE_PUBLIC_SITE_URL?.replace(/\/$/, '')

  if (fromEnv) {
    if (base && fromEnv.endsWith(base)) return fromEnv
    return base ? `${fromEnv}${base}` : fromEnv
  }

  return null
}

function bridgeScriptFetchUrls(env) {
  const root = bridgeSiteRoot(env)
  if (!root) return []
  return [`${root}/ytmusic-bridge.js`]
}

const cases = [
  {
    name: 'GitHub Pages production env',
    env: {
      VITE_PUBLIC_SITE_URL: 'https://t3lluz.github.io/YTMQ',
      BASE_URL: '/YTMQ/',
    },
    expect: 'https://t3lluz.github.io/YTMQ/ytmusic-bridge.js',
  },
  {
    name: 'origin-only local https',
    env: { BASE_URL: '/YTMQ/' },
    expect: null,
  },
]

let failed = 0
for (const { name, env, expect } of cases) {
  const urls = bridgeScriptFetchUrls(env)
  const got = urls[0] ?? null
  if (got !== expect) {
    console.error(`FAIL ${name}: expected ${expect}, got ${got}`)
    failed += 1
  } else {
    console.log(`OK ${name}: ${got}`)
  }
}

if (failed > 0) process.exit(1)
