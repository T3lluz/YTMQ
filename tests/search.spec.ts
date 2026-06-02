import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import { goToGuestRoom, selectTab } from './helpers/ui'

test.describe('Search', () => {
  test('finds songs and shows add buttons', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await page.getByPlaceholder(/search songs and artists/i).fill('daft punk')

    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.locator('ul li').first()).toBeVisible()
  })

  test('unified search shows artists with open button', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await page.getByPlaceholder(/search songs and artists/i).fill('taylor swift')

    await expect(
      page.getByRole('button', { name: 'Open' }).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('artist view lists songs and albums', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await page.getByPlaceholder(/search songs and artists/i).fill('taylor swift')
    await page.getByRole('button', { name: 'Open' }).first().click()

    await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible()
  })
})
