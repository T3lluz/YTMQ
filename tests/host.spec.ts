import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import {
  goToGuestRoom,
  goToHost,
  searchAndAddFirstResult,
} from './helpers/ui'

test.describe('Host', () => {
  test('shows share panel and queue mirror', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await goToHost(page, lobby)

    await expect(page.getByRole('heading', { name: /Lobby/ })).toBeVisible()
    await expect(page.getByText(lobby.code)).toBeVisible()
    await expect(page.getByRole('img', { name: new RegExp(`QR code for room ${lobby.code}`) })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText('Queue mirror')).toBeVisible()
  })

  test('rejects host view without session token', async ({ page }) => {
    const lobby = await createLobbyViaApi()
    await page.goto(`/host/${lobby.room_id}`)
    await expect(page.getByText(/Host session missing/i)).toBeVisible()
  })

  test('mirrors guest queue in realtime', async ({ browser }) => {
    const lobby = await createLobbyViaApi()

    const hostPage = await browser.newPage()
    const guestPage = await browser.newPage()

    await goToHost(hostPage, lobby)
    await goToGuestRoom(guestPage, lobby.room_id)
    await searchAndAddFirstResult(guestPage, 'daft punk get lucky')

    await expect(hostPage.locator('ul li')).toHaveCount(1, { timeout: 15_000 })
    await expect(
      hostPage.getByRole('link', { name: 'Open' }).first(),
    ).toHaveAttribute('href', /^https:\/\/music\.youtube\.com\/watch\?v=/)

    await hostPage.close()
    await guestPage.close()
  })

  test('copy video IDs button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    const lobby = await createLobbyViaApi()
    await goToHost(page, lobby)

    const guestPage = await context.newPage()
    await goToGuestRoom(guestPage, lobby.room_id)
    await searchAndAddFirstResult(guestPage, 'daft punk')

    await expect(page.locator('ul li')).toHaveCount(1, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Copy video IDs' }).click()
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()

    await guestPage.close()
  })
})
