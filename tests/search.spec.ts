import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import { goToGuestRoom, selectTab } from './helpers/ui'

test.describe('Search', () => {
  test('finds songs and shows add buttons', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await page.getByPlaceholder(/search songs/i).fill('daft punk')

    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.locator('ul li').first()).toBeVisible()
  })

  test('switches between songs and artists mode', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await page.getByRole('button', { name: 'Artists' }).click()
    await page.getByPlaceholder(/search artists/i).fill('daft punk')

    await expect(
      page.getByRole('button', { name: 'Tracks' }).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('artist tracks view lists addable songs', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await page.getByRole('button', { name: 'Artists' }).click()
    await page.getByPlaceholder(/search artists/i).fill('taylor swift')
    await page.getByRole('button', { name: 'Tracks' }).first().click()

    await expect(page.getByText('Popular tracks from this channel')).toBeVisible()
    await expect(page.locator('ul li').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible()
  })
})
