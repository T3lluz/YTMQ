import { expect, test } from '@playwright/test'
import { createLobbyViaApi } from './helpers/supabase'
import {
  goToGuestRoom,
  goToHost,
  gotoApp,
  joinLobbyWithNickname,
  searchAndAddFirstResult,
  selectTab,
} from './helpers/ui'

/**
 * End-to-end: host creates lobby → guest joins → search/add/remove → host mirrors queue.
 */
test.describe('Full flow', () => {
  test('host and guest share queue end to end', async ({ browser }) => {
    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()

    const hostPage = await hostContext.newPage()
    const guestPage = await guestContext.newPage()

    await gotoApp(hostPage)
    await hostPage.getByRole('button', { name: 'Create lobby' }).click()
    await expect(hostPage).toHaveURL(/\/YTMQ\/room\/[0-9a-f-]{36}\/?$/, {
      timeout: 15_000,
    })

    const roomId = hostPage.url().match(/\/room\/([0-9a-f-]{36})/)?.[1]
    expect(roomId).toBeTruthy()

    const heading = await hostPage.getByRole('heading', { level: 1 }).textContent()
    const code = heading?.replace(/^Lobby\s+/i, '').trim()
    expect(code).toMatch(/^[A-Z0-9]{6}$/)

    await gotoApp(guestPage, 'join')
    await joinLobbyWithNickname(guestPage, code!, 'PartyGuest')
    await expect(guestPage).toHaveURL(new RegExp(`/YTMQ/room/${roomId}/?$`))

    await searchAndAddFirstResult(guestPage, 'daft punk one more time')
    await searchAndAddFirstResult(guestPage, 'daft punk get lucky')

    await selectTab(guestPage, 'Queue')
    const guestRows = guestPage.locator('ul li')
    await expect(guestRows).toHaveCount(2, { timeout: 10_000 })

    await expect(hostPage.locator('ul li')).toHaveCount(2, { timeout: 15_000 })

    const openLink = hostPage.getByRole('link', { name: 'Open', exact: true }).first()
    await expect(openLink).toHaveAttribute(
      'href',
      /^https:\/\/music\.youtube\.com\/watch\?v=[\w-]+$/,
    )

    await guestRows.nth(1).getByRole('button', { name: 'Remove' }).click()
    await expect(guestRows).toHaveCount(1, { timeout: 10_000 })
    await expect(hostPage.locator('ul li')).toHaveCount(1, { timeout: 15_000 })

    await selectTab(guestPage, 'Room')
    await expect(guestPage.getByText(code!)).toBeVisible()

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

    await expect(
      hostPage.getByRole('link', { name: 'Open', exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 })

    await hostPage.close()
    await guestPage.close()
  })
})
