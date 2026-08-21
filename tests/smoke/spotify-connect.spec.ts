import { expect, test, type Page } from '@playwright/test'

const ROOM_ID = '11111111-1111-4111-9111-111111111111'

async function installMocks(page: Page, asHost: boolean) {
  await page.route(/stub\.supabase\.co\/.*/i, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method().toUpperCase()
    const path = url.pathname

    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-expose-headers': '*',
        },
        body: JSON.stringify(body),
      })

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': '*',
          'access-control-allow-headers': '*',
        },
      })
    }

    if (path.endsWith('/rpc/get_room')) {
      return json(200, {
        room_id: ROOM_ID,
        code: 'TEST01',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        locked: false,
        has_password: false,
        allow_guest_add: true,
        allow_guest_remove: true,
        allow_guest_controls: true,
      })
    }

    if (path.includes('/realtime/')) {
      return route.fulfill({ status: 200, body: '' })
    }

    return json(200, [])
  })

  await page.addInitScript(
    ({ roomId, asHost: host }) => {
      try {
        sessionStorage.clear()
        localStorage.clear()
        if (host) {
          sessionStorage.setItem(`ytmq_host_${roomId}`, 'host-token')
          sessionStorage.setItem(`ytmq_nickname_${roomId}`, 'HOST')
        }
      } catch {
        /* ignore */
      }
    },
    { roomId: ROOM_ID, asHost },
  )
}

async function gotoRoom(page: Page, nickname = 'SmokeGuest') {
  await page.goto(`./room/${ROOM_ID}`)
  const dialog = page.getByRole('dialog', { name: 'Choose a nickname' })
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByPlaceholder('Your name on the queue').fill(nickname)
    await dialog.getByRole('button', { name: 'Continue' }).click()
  }
  await page.getByRole('heading', { name: 'Search songs' }).waitFor({
    timeout: 15_000,
  })
}

test.use({ viewport: { width: 390, height: 844 } })

test.describe('Spotify connect (mocked Supabase)', () => {
  test('host Admin tab offers Connect Spotify next to YouTube Music', async ({
    page,
  }) => {
    await installMocks(page, true)
    await gotoRoom(page)

    await expect(page.getByText('Host')).toBeVisible()
    await page.getByRole('button', { name: 'Admin' }).click()

    await expect(
      page.getByRole('button', { name: 'Connect YouTube Music' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Connect Spotify' }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible()
  })

  test('guests do not see Spotify connect', async ({ page }) => {
    await installMocks(page, false)
    await gotoRoom(page)

    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Connect Spotify' }),
    ).toHaveCount(0)
  })
})
