/** After `npm run build`, ensure the app bundle has correct bridge URLs. */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const distAssets = 'dist/assets'
const siteUrl = process.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, '')

if (!existsSync(distAssets)) {
  console.error('dist/assets missing — run npm run build first')
  process.exit(1)
}

const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'))
if (jsFiles.length === 0) {
  console.error('no JS in dist/assets')
  process.exit(1)
}

let failed = 0
const combined = jsFiles
  .map((f) => readFileSync(join(distAssets, f), 'utf8'))
  .join('\n')

if (combined.includes('YTMQ/YTMQ')) {
  console.error('FAIL: bundle contains double /YTMQ/ path')
  failed += 1
}

if (combined.includes('public/ytmusic-bridge.js')) {
  console.error('FAIL: bundle still references public/ytmusic-bridge.js')
  failed += 1
}

if (combined.includes('cdn.jsdelivr.net')) {
  console.error('FAIL: bundle still references broken jsDelivr bridge URL')
  failed += 1
}

if (siteUrl) {
  const host = siteUrl.replace(/^https?:\/\//, '')
  if (!combined.includes(host)) {
    console.error(`FAIL: bundle missing site host ${host}`)
    failed += 1
  } else {
    console.log(`OK: bundle references ${host}`)
  }
}

if (!combined.includes('ytmusic-bridge.js')) {
  console.error('FAIL: bundle missing ytmusic-bridge.js path')
  failed += 1
}

if (failed > 0) process.exit(1)
console.log('OK: dist bridge URLs verified')
