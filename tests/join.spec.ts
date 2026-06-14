import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import { gotoApp, joinLobbyWithNickname } from './helpers/ui'

test.describe('Join', () => {
  test('requires a room code', async ({ page }) => {
    await gotoApp(page, 'join')
    await page.getByPlaceholder('Your name on the queue').fill('TestGuest')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter a room code')
  })

  test('requires a nickname', async ({ page }) => {
    await gotoApp(page, 'join')
    await page.getByPlaceholder('ABC123').fill('ABC123')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter a nickname')
  })

  test('rejects invalid room code', async ({ page }) => {
    await gotoApp(page, 'join')
    await joinLobbyWithNickname(page, 'ZZZZZZ')
    await expect(page.getByRole('alert')).toContainText(/not found|Could not join/i)
  })

  test('joins a valid lobby by code', async ({ page }) => {
    const lobby = await createLobbyViaApi()

    await gotoApp(page, 'join')
    await joinLobbyWithNickname(page, lobby.code)

    await expect(page).toHaveURL(new RegExp(`/YTMQ/room/${lobby.room_id}/?$`))
    await page.getByRole('navigation', { name: 'Room navigation' }).waitFor()
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
  })
})
