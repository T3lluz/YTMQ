import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import {
  goToGuestRoom,
  goToHost,
  searchAndAddFirstResult,
  selectTab,
} from './helpers/ui'

/**
 * End-to-end: host creates lobby → guest joins → search/add/reorder → host mirrors queue.
 */
test.describe('Full flow', () => {
  test('host and guest share queue end to end', async ({ browser }) => {
    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()

    const hostPage = await hostContext.newPage()
    const guestPage = await guestContext.newPage()

    // Host creates lobby via UI
    await hostPage.goto('/')
    await hostPage.getByRole('button', { name: 'Create lobby' }).click()
    await expect(hostPage).toHaveURL(/\/host\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    const roomId = hostPage.url().match(/\/host\/([0-9a-f-]{36})$/)?.[1]
    expect(roomId).toBeTruthy()

    const heading = await hostPage.getByRole('heading', { level: 1 }).textContent()
    const code = heading?.replace(/^Lobby\s+/i, '').trim()
    expect(code).toMatch(/^[A-Z0-9]{6}$/)

    // Guest joins with code
    await guestPage.goto('/join')
    await guestPage.getByPlaceholder('ABC123').fill(code)
    await guestPage.getByRole('button', { name: 'Join' }).click()
    await expect(guestPage).toHaveURL(new RegExp(`/room/${roomId}$`))

    // Guest sets nickname and adds tracks
    await selectTab(guestPage, 'Room')
    await guestPage.getByPlaceholder('Your name on the queue').fill('PartyGuest')

    await searchAndAddFirstResult(guestPage, 'daft punk one more time')
    await searchAndAddFirstResult(guestPage, 'daft punk get lucky')

    await selectTab(guestPage, 'Queue')
    const guestRows = guestPage.locator('ul li')
    await expect(guestRows).toHaveCount(2, { timeout: 10_000 })

    // Host sees both tracks
    await expect(hostPage.locator('ul li')).toHaveCount(2, { timeout: 15_000 })

    const openLink = hostPage.getByRole('link', { name: 'Open' }).first()
    await expect(openLink).toHaveAttribute(
      'href',
      /^https:\/\/music\.youtube\.com\/watch\?v=[\w-]+$/,
    )

    // Guest reorders: move second track up
    const secondTitle = await guestRows
      .nth(1)
      .locator('.font-medium')
      .textContent()
    await guestRows.nth(1).getByRole('button', { name: 'Move up' }).click()

    await expect(async () => {
      const top = await guestRows.nth(0).locator('.font-medium').textContent()
      expect(top).toBe(secondTitle)
    }).toPass({ timeout: 10_000 })

    // Guest removes bottom track
    await guestRows.nth(1).getByRole('button', { name: 'Remove' }).click()
    await expect(guestRows).toHaveCount(1, { timeout: 10_000 })
    await expect(hostPage.locator('ul li')).toHaveCount(1, { timeout: 15_000 })

    // Room tab share works
    await selectTab(guestPage, 'Room')
    await expect(guestPage.getByText(code)).toBeVisible()

    await hostContext.close()
    await guestContext.close()
  })

  test('API lobby + dual browser queue sync', async ({ browser }) => {
    const lobby = await createLobbyViaApi()

    const hostPage = await browser.newPage()
    const guestPage = await browser.newPage()

    await goToHost(hostPage, lobby)
    await goToGuestRoom(guestPage, lobby.room_id)

    await searchAndAddFirstResult(guestPage, 'radiohead creep')
    await selectTab(guestPage, 'Queue')
    await expect(guestPage.locator('ul li')).toHaveCount(1)

    await expect(hostPage.getByRole('link', { name: 'Open' })).toBeVisible({
      timeout: 15_000,
    })

    await hostPage.close()
    await guestPage.close()
  })
})
