import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import {
  goToGuestRoom,
  searchAndAddFirstResult,
  selectTab,
} from './helpers/ui'

test.describe('Queue', () => {
  test('adds a track from search', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await searchAndAddFirstResult(page, 'one more time daft punk')

    await selectTab(page, 'Queue')
    await expect(page.locator('ul li')).toHaveCount(1, { timeout: 10_000 })
    await expect(page.getByText(/Daft Punk|One More Time/i).first()).toBeVisible()
  })

  test('removes a track', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await searchAndAddFirstResult(page, 'daft punk instant crush')
    await selectTab(page, 'Queue')

    const row = page.locator('ul li').first()
    await row.getByRole('button', { name: 'Remove' }).click()

    await expect(page.getByText('Queue is empty')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('reorders tracks with up and down', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await searchAndAddFirstResult(page, 'daft punk one more time')
    await searchAndAddFirstResult(page, 'daft punk harder better faster')

    await selectTab(page, 'Queue')
    const rows = page.locator('ul li')
    await expect(rows).toHaveCount(2, { timeout: 10_000 })

    const firstTitle = await rows.nth(0).locator('.font-medium').textContent()
    const secondTitle = await rows.nth(1).locator('.font-medium').textContent()

    await rows.nth(1).getByRole('button', { name: 'Move down' }).click()

    await expect(async () => {
      const newFirst = await rows.nth(0).locator('.font-medium').textContent()
      expect(newFirst).toBe(secondTitle)
    }).toPass({ timeout: 10_000 })

    await rows.nth(0).getByRole('button', { name: 'Move up' }).click()

    await expect(async () => {
      const restored = await rows.nth(0).locator('.font-medium').textContent()
      expect(restored).toBe(firstTitle)
    }).toPass({ timeout: 10_000 })
  })
})
