import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import { goToGuestRoom, gotoApp } from './helpers/ui'

test.describe('Join', () => {
  test('requires a room code', async ({ page }) => {
    await gotoApp(page, 'join')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter a room code')
  })

  test('rejects invalid room code', async ({ page }) => {
    await gotoApp(page, 'join')
    await page.getByPlaceholder('ABC123').fill('ZZZZZZ')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByRole('alert')).toContainText(/not found|Could not join/i)
  })

  test('joins a valid lobby by code', async ({ page }) => {
    const lobby = await createLobbyViaApi()

    await gotoApp(page, 'join')
    await page.getByPlaceholder('ABC123').fill(lobby.code)
    await page.getByRole('button', { name: 'Join' }).click()

    await expect(page).toHaveURL(new RegExp(`/YTMQ/room/${lobby.room_id}/?$`))
    await page.getByRole('navigation', { name: 'Room navigation' }).waitFor()
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
  })
})
