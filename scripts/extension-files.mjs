/**
 * What goes into the extension, for Chrome and for Firefox. Both ship the
 * same files from extension/; Firefox gets its own manifest.json, written
 * by firefoxManifest() at pack time.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const root = resolve(import.meta.dirname, '..')
export const extensionDir = resolve(root, 'extension')
export const distDir = resolve(root, 'dist')

export const SITE = 'https://t3lluz.com/ytmq'
export const GECKO_ID = 'ytmq@t3lluz.com'

export const extensionFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'site.js',
  'popup.html',
  'popup.js',
  'ui.js',
  'ytm-panel.js',
  'ytmusic-bridge.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
]

export function chromeManifest() {
  return JSON.parse(readFileSync(resolve(extensionDir, 'manifest.json'), 'utf8'))
}

/**
 * Firefox runs MV3 background code as an event page, not a service worker,
 * and needs an add-on id. update_url is where Firefox looks for new signed
 * builds (scripts/sign-firefox.mjs writes it). 140 is the ESR that knows
 * data_collection_permissions; MAIN-world scripting needs 128.
 */
export function firefoxManifest(version) {
  const manifest = chromeManifest()
  delete manifest.minimum_chrome_version
  manifest.version = version ?? manifest.version
  manifest.background = { scripts: [manifest.background.service_worker] }
  manifest.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: '140.0',
      update_url: `${SITE}/ytmq-firefox-updates.json`,
      // The queue and what YouTube Music plays go to the lobby's server.
      data_collection_permissions: { required: ['websiteContent'] },
    },
  }
  return manifest
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/**
 * Identifies a Firefox build by its contents, version left out, so signing
 * runs once per change and not once per deploy. Unlike the Chrome
 * fingerprint it covers the bridge: Firefox runs only the bundled copy.
 */
export function firefoxFingerprint() {
  return sha256(
    extensionFiles
      .map((file) => {
        const data =
          file === 'manifest.json'
            ? JSON.stringify(firefoxManifest('0'))
            : readFileSync(resolve(extensionDir, file))
        return `${file}\n${sha256(data)}\n`
      })
      .join(''),
  )
}

/** zip FILES (relative to CWD) into OUT, keeping their folders. */
export function zipFiles(cwd, files, out) {
  // `zip` where it exists (CI), Python's zipfile where it doesn't (t3lluz).
  try {
    execFileSync('zip', ['-r', '-q', out, ...files], { cwd, stdio: 'inherit' })
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
    // Not `python3 -m zipfile -c`: that stores icons/icon16.png as icon16.png,
    // and Chrome then refuses the extension for a missing icon.
    const script =
      'import sys, zipfile\n' +
      'with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:\n' +
      '    for f in sys.argv[2:]: z.write(f, f)\n'
    execFileSync('python3', ['-c', script, out, ...files], { cwd, stdio: 'inherit' })
  }
}

/** Pack the Firefox build at VERSION into OUT (an .xpi is a zip). */
export function packFirefox(out, version) {
  const stage = mkdtempSync(join(tmpdir(), 'ytmq-firefox-'))
  try {
    for (const file of extensionFiles) {
      if (file === 'manifest.json') continue
      cpSync(resolve(extensionDir, file), join(stage, file), { recursive: true })
    }
    writeFileSync(join(stage, 'manifest.json'), JSON.stringify(firefoxManifest(version), null, 2) + '\n')
    rmSync(out, { force: true })
    zipFiles(stage, extensionFiles, out)
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}
