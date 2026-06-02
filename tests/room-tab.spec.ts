import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import { goToGuestRoom, selectTab } from './helpers/ui'

test.describe('Room tab', () => {
  test('shows code, link, and QR', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)
    await selectTab(page, 'Room')

    await expect(page.getByRole('heading', { name: 'Room' })).toBeVisible()
    await expect(page.getByText(lobby.code)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
    await expect(
      page.getByRole('img', { name: new RegExp(`QR code for room ${lobby.code}`) }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('copies guest link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)
    await selectTab(page, 'Room')

    await page.getByRole('button', { name: 'Copy link' }).click()
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()
    await expect(page.getByText('Link copied')).toBeVisible()
  })

  test('saves optional nickname', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToGuestRoom(page, lobby.room_id)
    await selectTab(page, 'Room')

    const nickname = page.getByPlaceholder('Your name on the queue')
    await nickname.fill('TestGuest')

    await selectTab(page, 'Search')
    await selectTab(page, 'Room')
    await expect(nickname).toHaveValue('TestGuest')
  })
})
