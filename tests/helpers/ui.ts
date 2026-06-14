import type { Page } from '@playwright/test'
import type { LobbyApiResult } from './supabase'

/** Navigate within the Vite `base` path (/YTMQ/). */
export async function gotoApp(page: Page, path = '') {
  const segment = path.replace(/^\//, '')
  await page.goto(segment ? `./${segment}` : './')
}

export function hostStorageKey(roomId: string) {
  return `ytmq_host_${roomId}`
}

export async function seedHostSession(page: Page, lobby: LobbyApiResult) {
  await gotoApp(page)
  await page.evaluate(
    ({ key, hostToken }) => {
      sessionStorage.setItem(key, hostToken)
    },
    {
      key: hostStorageKey(lobby.room_id),
      hostToken: lobby.host_token,
    },
  )
}

export async function goToGuestRoom(page: Page, roomId: string) {
  await gotoApp(page, `room/${roomId}`)
  await page.getByRole('navigation', { name: 'Room navigation' }).waitFor()
}

export async function goToHost(page: Page, lobby: LobbyApiResult) {
  await seedHostSession(page, lobby)
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('ytmq_ytm_connected_')) sessionStorage.removeItem(key)
    }
  })
  await gotoApp(page, `host/${lobby.room_id}`)
  await page.getByText('Queue mirror').waitFor()
}

export async function selectTab(
  page: Page,
  tab: 'Search' | 'Queue' | 'Room',
) {
  await page.getByRole('navigation', { name: 'Room navigation' })
    .getByRole('button', { name: new RegExp(`^${tab}`) })
    .click()
}

export function ytMusicOpenLink(page: Page) {
  return page.getByRole('link', { name: 'Open', exact: true })
}

export async function searchAndAddFirstResult(
  page: Page,
  query: string,
  mode: 'Play next' | 'Add to queue' = 'Play next',
) {
  await selectTab(page, 'Search')
  const input = page.getByPlaceholder(/search songs/i)
  await input.fill(query)
  const addButton = page.getByRole('button', { name: mode }).first()
  await addButton.waitFor({ state: 'visible', timeout: 20_000 })
  await addButton.click()
  const confirmation = mode === 'Add to queue' ? /Added to queue/ : /Playing next/
  await page.getByText(confirmation).waitFor({ timeout: 10_000 })
}
