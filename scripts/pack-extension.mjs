/**
 * Packages the extension so hosts can download it straight from the
 * deployed site. Run after `vite build`.
 *
 *   dist/ytmq-extension.zip            Chrome, Edge, Brave (Load unpacked)
 *   dist/ytmq-extension.json           what installed Chrome copies compare against
 *   dist/ytmq-firefox-unsigned.xpi     Firefox build before signing
 *   dist/ytmq-firefox.json             what the setup page offers Firefox
 *
 * scripts/sign-firefox.mjs adds the signed ytmq-firefox.xpi on t3lluz.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  chromeManifest,
  distDir,
  extensionDir,
  extensionFiles,
  firefoxFingerprint,
  packFirefox,
  root,
  sha256,
  zipFiles,
} from './extension-files.mjs'

const zipPath = resolve(distDir, 'ytmq-extension.zip')

// The bundled bridge is a build artifact; make sure it's fresh.
copyFileSync(
  resolve(root, 'public/ytmusic-bridge.js'),
  resolve(extensionDir, 'ytmusic-bridge.js'),
)

for (const file of extensionFiles) {
  if (!existsSync(resolve(extensionDir, file))) {
    console.error(`FAIL: extension/${file} missing`)
    process.exit(1)
  }
}

mkdirSync(distDir, { recursive: true })
rmSync(zipPath, { force: true })
zipFiles(extensionDir, extensionFiles, zipPath)
console.log('OK: packed dist/ytmq-extension.zip')

// What installed copies compare themselves against (extension/background.js,
// checkForUpdate). The bridge is left out: the extension loads the live one
// from the site, so a bridge-only change needs no reinstall.
const fingerprinted = extensionFiles.filter((file) => file !== 'ytmusic-bridge.js').sort()
const fingerprint = sha256(
  fingerprinted
    .map((file) => `${file}\n${sha256(readFileSync(resolve(extensionDir, file)))}\n`)
    .join(''),
)
const { version } = chromeManifest()
writeFileSync(
  resolve(distDir, 'ytmq-extension.json'),
  JSON.stringify({ version, fingerprint, files: fingerprinted, zip: 'ytmq-extension.zip' }, null, 2) + '\n',
)
console.log(`OK: dist/ytmq-extension.json (v${version}, ${fingerprint.slice(0, 12)})`)

// Firefox. Release Firefox only installs signed add-ons, so this copy is for
// Developer Edition, Nightly and forks that allow unsigned ones. `xpi` stays
// null until sign-firefox.mjs has a signed build to offer.
packFirefox(resolve(distDir, 'ytmq-firefox-unsigned.xpi'), version)
writeFileSync(
  resolve(distDir, 'ytmq-firefox.json'),
  JSON.stringify(
    { version, fingerprint: firefoxFingerprint(), xpi: null, unsigned: 'ytmq-firefox-unsigned.xpi' },
    null,
    2,
  ) + '\n',
)
console.log(`OK: packed dist/ytmq-firefox-unsigned.xpi (v${version})`)
