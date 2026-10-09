/**
 * Keeps the add-on's page on addons.mozilla.org in line with store/firefox/:
 * name, summary, description and homepage from listing.json, the icon, and
 * the screenshots in the order listing.json gives.
 *
 * Mozilla limits screenshot uploads hard (one wait was 37 minutes), so
 * update.sh starts this as its own systemd unit after a deploy instead of
 * waiting on it. Progress is kept in YTMQ_FIREFOX_DIR/page.json: a run that
 * stops halfway picks up from there, and a run with nothing changed only
 * reads.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { root, sha256 } from './extension-files.mjs'
import { addonPath, amo, hasKeys } from './amo.mjs'

const listingDir = resolve(root, 'store/firefox')
const cacheDir = process.env.YTMQ_FIREFOX_DIR || join(homedir(), 'docker/ytmq/firefox')
const statePath = join(cacheDir, 'page.json')
// Long enough for Mozilla's longest throttle; this runs on its own.
const MAX_WAIT_S = 2 * 60 * 60

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return {}
  }
}

const saveState = (state) => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')

async function main() {
  if (!hasKeys()) return console.log('firefox-page: no AMO keys, skipping')
  // Signing creates the add-on; until then there is no page to fill in.
  if (!(await amo('GET', addonPath + '/'))) return console.log('firefox-page: add-on not on AMO yet')

  const listing = JSON.parse(readFileSync(join(listingDir, 'listing.json'), 'utf8'))
  const icon = readFileSync(resolve(listingDir, listing.icon))
  const shots = listing.screenshots.map((file) => ({ file, png: readFileSync(join(listingDir, file)) }))
  for (const shot of shots) shot.sha = sha256(shot.png)
  const state = readState()
  state.previews ??= {} // screenshot sha256 -> preview id on AMO

  const text = sha256(JSON.stringify([listing.name, listing.summary, listing.description, listing.homepage]))
  if (state.text !== text) {
    const en = (value) => ({ 'en-US': value })
    await amo('PATCH', addonPath + '/', {
      name: en(listing.name),
      summary: en(listing.summary),
      description: en(listing.description),
      homepage: en(listing.homepage),
    })
    state.text = text
    saveState(state)
    console.log('firefox-page: text updated')
  }

  const iconSha = sha256(icon)
  if (state.icon !== iconSha) {
    const form = new FormData()
    form.append('icon', new Blob([icon], { type: 'image/png' }), 'icon.png')
    await amo('PATCH', addonPath + '/', form)
    state.icon = iconSha
    saveState(state)
    console.log('firefox-page: icon updated')
  }

  // Screenshots: drop what is not ours or no longer listed, upload what is missing.
  const wanted = new Set(shots.map((shot) => shot.sha))
  const addon = await (await amo('GET', addonPath + '/')).json()
  const onAmo = new Set((addon.previews ?? []).map((preview) => preview.id))
  for (const [sha, id] of Object.entries(state.previews)) {
    if (!wanted.has(sha) || !onAmo.has(id)) delete state.previews[sha]
  }
  const keep = new Set(Object.values(state.previews))
  for (const id of onAmo) {
    if (keep.has(id)) continue
    await amo('DELETE', `${addonPath}/previews/${id}/`, undefined, { maxWait: MAX_WAIT_S })
  }
  saveState(state)
  for (const [i, shot] of shots.entries()) {
    if (state.previews[shot.sha]) continue
    const form = new FormData()
    form.append('image', new Blob([shot.png], { type: 'image/png' }), shot.file)
    form.append('position', String(i))
    const res = await amo('POST', `${addonPath}/previews/`, form, { maxWait: MAX_WAIT_S })
    state.previews[shot.sha] = (await res.json()).id
    saveState(state)
    console.log(`firefox-page: screenshot ${shot.file} uploaded`)
  }
  console.log('firefox-page: add-on page is up to date')
}

await main()
