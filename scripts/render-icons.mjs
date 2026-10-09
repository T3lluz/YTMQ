// Renders the icon PNGs from design/brand/*.svg: the extension's toolbar
// icons and the site's apple-touch-icon. Run after changing the mark:
//   node scripts/render-icons.mjs
// Needs a Chromium: npx playwright install chromium, or point CHROMIUM at
// any Chrome/Chromium binary.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = resolve(import.meta.dirname, '..')
const jobs = [
  // Below 48px the trail only muddies the edge.
  ['design/brand/ytmq-16.svg', 16, 'extension/icons/icon16.png'],
  ['design/brand/ytmq-small.svg', 32, 'extension/icons/icon32.png'],
  ['design/brand/ytmq.svg', 48, 'extension/icons/icon48.png'],
  ['design/brand/ytmq.svg', 128, 'extension/icons/icon128.png'],
  ['design/brand/ytmq-tile.svg', 180, 'public/apple-touch-icon.png'],
]

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
for (const [src, size, out] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const svg = readFileSync(resolve(root, src), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`)
  await page.screenshot({ path: resolve(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  await page.close()
  console.log(out)
}
await browser.close()
