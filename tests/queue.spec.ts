import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import {
  goToGuestRoom,
  searchAndAddFirstResult,
  selectTab,
} from './helpers/ui'

test.describe('Queue', () => {
  test('adds a track as play next from search', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await searchAndAddFirstResult(page, 'one more time daft punk', 'Play next')

    await selectTab(page, 'Queue')
    await expect(page.locator('ul li')).toHaveCount(1, { timeout: 10_000 })
    await expect(page.getByText(/Daft Punk|One More Time/i).first()).toBeVisible()
    await expect(page.locator('ul li').first().getByText('Play next')).toBeVisible()
  })

  test('adds a track as queue from search', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await searchAndAddFirstResult(
      page,
      'daft punk get lucky',
      'Add to queue',
    )

    await selectTab(page, 'Queue')
    await expect(page.locator('ul li')).toHaveCount(1, { timeout: 10_000 })
    await expect(
      page.locator('ul li').first().getByText('Queue', { exact: true }),
    ).toBeVisible()
  })

  test('shows distinct tags for queue and play-next adds', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)

    await searchAndAddFirstResult(page, 'daft punk one more time', 'Play next')
    await searchAndAddFirstResult(page, 'daft punk get lucky', 'Add to queue')

    await selectTab(page, 'Queue')
    const rows = page.locator('ul li')
    await expect(rows).toHaveCount(2, { timeout: 10_000 })
    await expect(rows.filter({ hasText: 'Play next' })).toHaveCount(1)
    await expect(
      rows.filter({ has: page.getByText('Queue', { exact: true }) }),
    ).toHaveCount(1)
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
})
