/**
 * Packages the Chrome extension into dist/ytmq-extension.zip so hosts can
 * download it straight from the deployed site. Run after `vite build`.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
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

execFileSync('zip', ['-r', '-q', zipPath, ...requiredFiles], {
  cwd: extensionDir,
  stdio: 'inherit',
})

console.log('OK: packed dist/ytmq-extension.zip')
