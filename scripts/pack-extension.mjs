/**
 * Packages the Chrome extension into dist/ytmq-extension.zip so hosts can
 * download it straight from the deployed site. Run after `vite build`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const extensionDir = resolve(root, 'extension')
const distDir = resolve(root, 'dist')
const zipPath = resolve(distDir, 'ytmq-extension.zip')

const requiredFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'site.js',
  'popup.html',
  'popup.js',
  'ytm-panel.js',
  'ytmusic-bridge.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
]

// The bundled bridge is a build artifact; make sure it's fresh.
copyFileSync(
  resolve(root, 'public/ytmusic-bridge.js'),
  resolve(extensionDir, 'ytmusic-bridge.js'),
)

for (const file of requiredFiles) {
  if (!existsSync(resolve(extensionDir, file))) {
    console.error(`FAIL: extension/${file} missing`)
    process.exit(1)
  }
}

mkdirSync(distDir, { recursive: true })
rmSync(zipPath, { force: true })

// `zip` where it exists (CI), Python's zipfile where it doesn't (t3lluz).
try {
  execFileSync('zip', ['-r', '-q', zipPath, ...requiredFiles], {
    cwd: extensionDir,
    stdio: 'inherit',
  })
} catch (err) {
  if (err?.code !== 'ENOENT') throw err
  execFileSync('python3', ['-m', 'zipfile', '-c', zipPath, ...requiredFiles], {
    cwd: extensionDir,
    stdio: 'inherit',
  })
}

console.log('OK: packed dist/ytmq-extension.zip')

// What installed copies compare themselves against (extension/background.js,
// checkForUpdate). The bridge is left out: the extension loads the live one
// from the site, so a bridge-only change needs no reinstall.
const fingerprinted = requiredFiles.filter((file) => file !== 'ytmusic-bridge.js').sort()
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const fingerprint = sha256(
  fingerprinted
    .map((file) => `${file}\n${sha256(readFileSync(resolve(extensionDir, file)))}\n`)
    .join(''),
)
const { version } = JSON.parse(readFileSync(resolve(extensionDir, 'manifest.json'), 'utf8'))
writeFileSync(
  resolve(distDir, 'ytmq-extension.json'),
  JSON.stringify({ version, fingerprint, files: fingerprinted, zip: 'ytmq-extension.zip' }, null, 2) + '\n',
)
console.log(`OK: dist/ytmq-extension.json (v${version}, ${fingerprint.slice(0, 12)})`)
