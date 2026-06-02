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

  test('filter pills switch between songs and artists', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await expect(page.getByRole('tab', { name: 'Songs' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByPlaceholder(/search songs/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Artists' }).click()
    await expect(page.getByRole('tab', { name: 'Artists' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByPlaceholder(/search artists/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Songs' }).click()
    await expect(page.getByPlaceholder(/search songs/i)).toBeVisible()
  })

  test('artist view lists popular songs', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await selectTab(page, 'Search')
    await page.getByRole('tab', { name: 'Artists' }).click()
    await page.getByPlaceholder(/search artists/i).fill('taylor swift')
    await page.getByText('View →').first().click()

    await expect(page.getByText('Popular songs')).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible()
  })
})
