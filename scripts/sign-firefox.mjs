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
 * It also keeps the add-on's page on addons.mozilla.org in line with
 * store/firefox/listing.json: name, summary, description, homepage, icon
 * and screenshots. That only runs when one of them changed.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  chromeManifest,
  distDir,
  firefoxFingerprint,
  GECKO_ID,
  packFirefox,
  root,
  sha256,
  SITE,
} from './extension-files.mjs'

const AMO = 'https://addons.mozilla.org/api/v5'
const cacheDir = process.env.YTMQ_FIREFOX_DIR || join(homedir(), 'docker/ytmq/firefox')
const statePath = join(cacheDir, 'state.json')
const WAIT_MS = 15 * 60 * 1000
const listingDir = resolve(root, 'store/firefox')

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

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

function token() {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const iat = Math.floor(Date.now() / 1000)
  const body =
    part({ alg: 'HS256', typ: 'JWT' }) +
    '.' +
    part({ iss: process.env.AMO_JWT_ISSUER, jti: randomUUID(), iat, exp: iat + 60 })
  return body + '.' + createHmac('sha256', process.env.AMO_JWT_SECRET).update(body).digest('base64url')
}

async function amo(method, path, body) {
  const res = await fetch(/^https?:/.test(path) ? path : AMO + path, {
    method,
    headers: {
      Authorization: `JWT ${token()}`,
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 404 && method === 'GET') return null
  if (!res.ok) throw new Error(`AMO ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 500)}`)
  return res
}

const addonPath = `/addons/addon/${encodeURIComponent(GECKO_ID)}`

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

/** Bring the add-on's page on addons.mozilla.org in line with the repo. */
async function syncListing(state) {
  const listing = JSON.parse(readFileSync(join(listingDir, 'listing.json'), 'utf8'))
  const icon = readFileSync(resolve(listingDir, listing.icon))
  const shots = listing.screenshots.map((file) => readFileSync(join(listingDir, file)))
  const hash = sha256(JSON.stringify(listing) + sha256(icon) + shots.map((png) => sha256(png)).join(''))
  if (state.listing === hash) return

  const en = (text) => ({ 'en-US': text })
  await amo('PATCH', addonPath + '/', {
    name: en(listing.name),
    summary: en(listing.summary),
    description: en(listing.description),
    homepage: en(listing.homepage),
  })
  const iconForm = new FormData()
  iconForm.append('icon', new Blob([icon], { type: 'image/png' }), 'icon.png')
  await amo('PATCH', addonPath + '/', iconForm)

  // Screenshots: replace the lot, in the order listing.json gives.
  const addon = await (await amo('GET', addonPath + '/')).json()
  for (const preview of addon.previews ?? []) {
    await amo('DELETE', `${addonPath}/previews/${preview.id}/`)
  }
  for (const [i, png] of shots.entries()) {
    const form = new FormData()
    form.append('image', new Blob([png], { type: 'image/png' }), listing.screenshots[i])
    form.append('position', String(i))
    await amo('POST', `${addonPath}/previews/`, form)
  }

  state.listing = hash
  saveState(state)
  console.log(`OK: add-on page on addons.mozilla.org updated (${shots.length} screenshots)`)
}

async function main() {
  const state = await sign()
  if (!state?.signed || !process.env.AMO_JWT_ISSUER || !process.env.AMO_JWT_SECRET) return
  try {
    await syncListing(state)
  } catch (err) {
    console.error(`sign-firefox: add-on page not updated: ${err.message}`)
  }
}

/** Sign when the build changed, publish the signed build. Returns the state. */
async function sign() {
  mkdirSync(cacheDir, { recursive: true })
  const state = readState()
  const fingerprint = firefoxFingerprint()
  const have = state.signed && existsSync(state.signed.file) ? state.signed : null

  if (have?.fingerprint === fingerprint) {
    publish(have)
    return state
  }
  if (!process.env.AMO_JWT_ISSUER || !process.env.AMO_JWT_SECRET) {
    console.log('sign-firefox: no AMO_JWT_ISSUER/AMO_JWT_SECRET, not signing')
    if (have) publish(have)
    return state
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
  return state
}

await main()
