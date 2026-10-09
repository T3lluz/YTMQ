/**
 * Gets the Firefox build signed by addons.mozilla.org and puts it on the
 * site. Release Firefox installs nothing unsigned, so this is what makes
 * the one-click install on /ytmq/setup work.
 *
 *   dist/ytmq-firefox.xpi             the signed build
 *   dist/ytmq-firefox.json            the setup page and installed copies read this
 *   dist/ytmq-firefox-updates.json    Firefox's own update check (update_url)
 *
 * The add-on is "unlisted": Mozilla signs it, but it is only offered here,
 * never on the add-ons site. Signing runs once per change to the extension:
 * signed builds are kept in YTMQ_FIREFOX_DIR (default ~/docker/ytmq/firefox)
 * by fingerprint, and every deploy in between reuses the last one.
 *
 * Needs AMO_JWT_ISSUER and AMO_JWT_SECRET, an API key from
 * https://addons.mozilla.org/developers/addon/api/key/. Without them, or
 * when signing fails, the last signed build stays up and the deploy goes on.
 * Run after scripts/pack-extension.mjs.
 *
 * The add-on's page on addons.mozilla.org is scripts/firefox-page.mjs.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  chromeManifest,
  distDir,
  firefoxFingerprint,
  GECKO_ID,
  packFirefox,
  sha256,
  SITE,
} from './extension-files.mjs'
import { addonPath, amo, hasKeys, sleep } from './amo.mjs'

const cacheDir = process.env.YTMQ_FIREFOX_DIR || join(homedir(), 'docker/ytmq/firefox')
const statePath = join(cacheDir, 'state.json')
const WAIT_MS = 15 * 60 * 1000

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return {}
  }
}

function saveState(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
}

function versionAbove(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0
  }
  return false
}

/**
 * Mozilla takes each version number once, but the extension can change
 * without a bump in manifest.json. Those builds get a fourth part:
 * 1.9.1, then 1.9.1.1, 1.9.1.2, until manifest.json moves to 1.9.2.
 */
function nextVersion(base, last) {
  if (!last || versionAbove(base, last)) return base
  const parts = last.split('.').map(Number)
  while (parts.length < 4) parts.push(0)
  parts[3] += 1
  return parts.join('.')
}

async function until(what, check) {
  const end = Date.now() + WAIT_MS
  for (;;) {
    const result = await check()
    if (result) return result
    if (Date.now() > end) throw new Error(`gave up waiting for ${what}`)
    await sleep(10_000)
  }
}

/** Upload XPI, have it validated, and add it as an unlisted VERSION. */
async function submit(xpi, version) {
  const form = new FormData()
  form.append('upload', new Blob([readFileSync(xpi)]), `ytmq-firefox-${version}.xpi`)
  form.append('channel', 'unlisted')
  const { uuid } = await (await amo('POST', '/addons/upload/', form)).json()
  const upload = await until('validation', async () => {
    const u = await (await amo('GET', `/addons/upload/${uuid}/`)).json()
    return u.processed ? u : null
  })
  if (!upload.valid) {
    const errors = (upload.validation?.messages ?? [])
      .filter((m) => m.type === 'error')
      .map((m) => `${m.message} ${m.file ?? ''}`.trim())
    throw new Error(`validation failed: ${errors.join('; ') || 'see AMO'}`)
  }
  // Creates the add-on under its id the first time, adds a version after.
  await amo('PUT', addonPath + '/', { version: { upload: uuid } })
}

/** Wait for Mozilla to sign VERSION, then download it to OUT. */
async function fetchSigned(version, out) {
  const file = await until('signing', async () => {
    const res = await amo('GET', addonPath + '/versions/?filter=all_with_unlisted&page_size=50')
    const found = res && (await res.json()).results.find((v) => v.version === version)
    if (!found?.file) return null
    if (found.file.status === 'disabled') throw new Error(`Mozilla refused ${version}`)
    return found.file.status === 'public' ? found.file : null
  })
  const res = await amo('GET', file.url)
  writeFileSync(out, Buffer.from(await res.arrayBuffer()))
}

function publish(signed) {
  const xpi = readFileSync(signed.file)
  copyFileSync(signed.file, resolve(distDir, 'ytmq-firefox.xpi'))
  const info = JSON.parse(readFileSync(resolve(distDir, 'ytmq-firefox.json'), 'utf8'))
  writeFileSync(
    resolve(distDir, 'ytmq-firefox.json'),
    JSON.stringify(
      { ...info, version: signed.version, fingerprint: signed.fingerprint, xpi: 'ytmq-firefox.xpi' },
      null,
      2,
    ) + '\n',
  )
  writeFileSync(
    resolve(distDir, 'ytmq-firefox-updates.json'),
    JSON.stringify(
      {
        addons: {
          [GECKO_ID]: {
            updates: [
              {
                version: signed.version,
                update_link: `${SITE}/ytmq-firefox.xpi?v=${signed.version}`,
                update_hash: `sha256:${sha256(xpi)}`,
              },
            ],
          },
        },
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`OK: dist/ytmq-firefox.xpi (signed v${signed.version})`)
}

async function main() {
  mkdirSync(cacheDir, { recursive: true })
  const state = readState()
  const fingerprint = firefoxFingerprint()
  const have = state.signed && existsSync(state.signed.file) ? state.signed : null

  if (have?.fingerprint === fingerprint) {
    publish(have)
    return
  }
  if (!hasKeys()) {
    console.log('sign-firefox: no AMO_JWT_ISSUER/AMO_JWT_SECRET, not signing')
    if (have) publish(have)
    return
  }

  try {
    // A version a previous run uploaded but did not see signed.
    let version = state.pending?.fingerprint === fingerprint ? state.pending.version : null
    if (!version) {
      version = nextVersion(chromeManifest().version, state.lastVersion)
      const unsigned = join(cacheDir, `unsigned-${version}.xpi`)
      packFirefox(unsigned, version)
      // Saved first: Mozilla keeps the number even if this run dies.
      state.lastVersion = version
      saveState(state)
      console.log(`sign-firefox: uploading v${version}`)
      await submit(unsigned, version)
      state.pending = { version, fingerprint }
      saveState(state)
    }
    const file = join(cacheDir, `ytmq-firefox-${version}.xpi`)
    await fetchSigned(version, file)
    state.signed = { version, fingerprint, file }
    delete state.pending
    saveState(state)
    publish(state.signed)
  } catch (err) {
    console.error(`sign-firefox: ${err.message}`)
    if (have) {
      console.error(`sign-firefox: keeping signed v${have.version}`)
      publish(have)
    }
  }
}

await main()
