import type { Page } from '@playwright/test'
import type { LobbyApiResult } from './supabase'

export function hostStorageKey(roomId: string) {
  return `ytmq_host_${roomId}`
}

export async function seedHostSession(page: Page, lobby: LobbyApiResult) {
  await page.addInitScript(
    ({ roomId, hostToken, key }) => {
      sessionStorage.setItem(key, hostToken)
    },
    {
      roomId: lobby.room_id,
      hostToken: lobby.host_token,
      key: hostStorageKey(lobby.room_id),
    },
  )
}

export async function goToGuestRoom(page: Page, roomId: string) {
  await page.goto(`/room/${roomId}`)
  await page.getByRole('navigation', { name: 'Room navigation' }).waitFor()
}

export async function goToHost(page: Page, lobby: LobbyApiResult) {
  await seedHostSession(page, lobby)
  await page.goto(`/host/${lobby.room_id}`)
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

export async function searchAndAddFirstResult(page: Page, query: string) {
  await selectTab(page, 'Search')
  const input = page.getByPlaceholder(/search songs/i)
  await input.fill(query)
  const addButton = page.getByRole('button', { name: 'Add' }).first()
  await addButton.waitFor({ state: 'visible', timeout: 20_000 })
  await addButton.click()
  await page.getByText(/Added “/).waitFor({ timeout: 10_000 })
}
