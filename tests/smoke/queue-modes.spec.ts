import { expect, test, type Page } from '@playwright/test'

/**
 * Mocked-Supabase smoke test for the Play next / Add to queue UI.
 *
 * Real Supabase isn't available in this environment, so we intercept every
 * supabase.co request the React app makes and respond with deterministic
 * fixtures. This exercises:
 *   - Two icon buttons render on each search result (Play next + Add to queue)
 *   - Buttons stay aligned on a 360 px viewport without clipping
 *   - Adding a track surfaces the right toast for each mode
 *   - The queue list shows the matching "Play next" / "Queue" badge tag
 */

const ROOM_ID = '11111111-1111-4111-9111-111111111111'

type QueueRow = {
  id: string
  room_id: string
  position: number
  video_id: string
  title: string
  channel_title: string
  thumbnail_url: string
  added_by: string
  created_at: string
  insert_mode: 'play_next' | 'queue'
}

function makeSongs() {
  return [
    {
      id: 'vid_one_more_time',
      title: 'One More Time',
      channelTitle: 'Daft Punk',
      thumbnail: '',
      type: 'song' as const,
      subtitle: 'Daft Punk',
    },
    {
      id: 'vid_get_lucky',
      title: 'Get Lucky',
      channelTitle: 'Daft Punk feat. Pharrell',
      thumbnail: '',
      type: 'song' as const,
      subtitle: 'Daft Punk feat. Pharrell',
    },
    {
      id: 'vid_long_title',
      title:
        'Around the World / Harder Better Faster Stronger (Alive 2007 Live Edit Extended Bonus Mix)',
      channelTitle: 'Daft Punk - Alive 2007',
      thumbnail: '',
      type: 'song' as const,
      subtitle: 'Daft Punk - Alive 2007',
    },
  ]
}

async function installMocks(page: Page) {
  const queue: QueueRow[] = []
  let positionCounter = 0

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
      })
    }

    if (path.endsWith('/functions/v1/search')) {
      return json(200, { results: makeSongs() })
    }

    if (path.endsWith('/rest/v1/queue_items')) {
      const accept = req.headers()['accept'] ?? ''
      const wantsSingleObject = accept.includes(
        'application/vnd.pgrst.object+json',
      )

      if (method === 'GET') {
        const body: unknown = wantsSingleObject
          ? queue[queue.length - 1] ?? null
          : queue
        return json(200, body)
      }
      if (method === 'POST') {
        let body: Partial<QueueRow> | Partial<QueueRow>[] = {}
        try {
          const raw = req.postData()
          body = raw
            ? (JSON.parse(raw) as Partial<QueueRow> | Partial<QueueRow>[])
            : {}
        } catch {
          body = {}
        }
        const bodyJson: Partial<QueueRow> = Array.isArray(body)
          ? (body[0] ?? {})
          : body
        const row: QueueRow = {
          id: `qi_${queue.length + 1}`,
          room_id: ROOM_ID,
          position: positionCounter++,
          video_id: bodyJson.video_id ?? '',
          title: bodyJson.title ?? '',
          channel_title: bodyJson.channel_title ?? '',
          thumbnail_url: bodyJson.thumbnail_url ?? '',
          added_by: bodyJson.added_by ?? '',
          created_at: new Date().toISOString(),
          insert_mode: bodyJson.insert_mode === 'queue' ? 'queue' : 'play_next',
        }
        queue.push(row)
        return json(201, wantsSingleObject ? row : [row])
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        if (id) {
          const idx = queue.findIndex((row) => row.id === id)
          if (idx >= 0) queue.splice(idx, 1)
        }
        return json(204, null)
      }
    }

    if (path.includes('/realtime/')) {
      return route.fulfill({ status: 200, body: '' })
    }

    // Default: 200 with empty body so unexpected calls don't break the app.
    return json(200, [])
  })

  // Pretend a fresh page; nuke any leftover storage so we always start clean.
  await page.addInitScript(() => {
    try {
      sessionStorage.clear()
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })
}

async function gotoRoom(page: Page) {
  await page.goto(`./room/${ROOM_ID}`)
  // Tab bar appears after the room loads.
  await page
    .getByRole('navigation', { name: 'Room navigation' })
    .waitFor({ timeout: 15_000 })
}

test.use({ viewport: { width: 360, height: 720 } })

test.describe('Queue insert modes (mocked Supabase)', () => {
  test('search rows render Play next and Add to queue buttons that fit on mobile widths', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    await page.getByPlaceholder(/search songs/i).fill('daft punk')

    const firstRow = page.locator('ul li').first()
    await expect(firstRow).toBeVisible({ timeout: 10_000 })

    const playNextBtn = firstRow.getByRole('button', { name: 'Play next' })
    const queueBtn = firstRow.getByRole('button', { name: 'Add to queue' })

    await expect(playNextBtn).toBeVisible()
    await expect(queueBtn).toBeVisible()

    // Title and buttons must share the row without clipping/overlap.
    const titleBox = await firstRow
      .locator('p.font-medium')
      .first()
      .boundingBox()
    const playNextBox = await playNextBtn.boundingBox()
    const queueBox = await queueBtn.boundingBox()
    const rowBox = await firstRow.boundingBox()

    expect(titleBox).toBeTruthy()
    expect(playNextBox).toBeTruthy()
    expect(queueBox).toBeTruthy()
    expect(rowBox).toBeTruthy()

    if (titleBox && playNextBox && queueBox && rowBox) {
      // No overlap: title ends before play-next starts.
      expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(playNextBox.x + 1)
      // Play next sits to the left of Queue.
      expect(playNextBox.x + playNextBox.width).toBeLessThanOrEqual(
        queueBox.x + 1,
      )
      // Whole row fits inside the viewport bounds with the row container.
      expect(queueBox.x + queueBox.width).toBeLessThanOrEqual(
        rowBox.x + rowBox.width + 1,
      )
      // Buttons hit the 36 px tap target.
      expect(playNextBox.height).toBeGreaterThanOrEqual(34)
      expect(queueBox.height).toBeGreaterThanOrEqual(34)
    }
  })

  test('adding as Play next shows the Play next badge in the queue', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    await page.getByPlaceholder(/search songs/i).fill('daft punk')
    await page
      .locator('ul li')
      .first()
      .getByRole('button', { name: 'Play next' })
      .click()

    await expect(page.getByText(/Playing next:/)).toBeVisible()

    await page
      .getByRole('navigation', { name: 'Room navigation' })
      .getByRole('button', { name: /^Queue/ })
      .click()

    const row = page.locator('section ul li').first()
    await expect(row).toBeVisible()
    await expect(row.getByText('Play next', { exact: true })).toBeVisible()
    await expect(row.getByText('Queue', { exact: true })).toHaveCount(0)

    // Badge must live below the title, not on the same baseline (otherwise
    // small mobile widths clip the title to ~2 chars).
    const titleBox = await row.locator('p.font-medium').first().boundingBox()
    const badgeBox = await row.getByText('Play next', { exact: true }).boundingBox()
    expect(titleBox).toBeTruthy()
    expect(badgeBox).toBeTruthy()
    if (titleBox && badgeBox) {
      expect(badgeBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1)
    }
  })

  test('adding as Add to queue shows the Queue badge in the queue', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    await page.getByPlaceholder(/search songs/i).fill('daft punk')
    await page
      .locator('ul li')
      .first()
      .getByRole('button', { name: 'Add to queue' })
      .click()

    await expect(page.getByText(/Added to queue:/)).toBeVisible()

    await page
      .getByRole('navigation', { name: 'Room navigation' })
      .getByRole('button', { name: /^Queue/ })
      .click()

    const row = page.locator('section ul li').first()
    await expect(row).toBeVisible()
    await expect(row.getByText('Queue', { exact: true })).toBeVisible()
    // Make sure we didn't accidentally show the Play next badge too.
    await expect(row.getByText('Play next', { exact: true })).toHaveCount(0)
  })

  test('extremely long titles still leave room for both action buttons', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    await page.getByPlaceholder(/search songs/i).fill('daft punk')
    const longRow = page.locator('ul li').nth(2)
    await expect(longRow).toBeVisible()

    const titleBox = await longRow.locator('p.font-medium').first().boundingBox()
    const playNextBox = await longRow
      .getByRole('button', { name: 'Play next' })
      .boundingBox()
    const queueBox = await longRow
      .getByRole('button', { name: 'Add to queue' })
      .boundingBox()
    const rowBox = await longRow.boundingBox()

    expect(titleBox && playNextBox && queueBox && rowBox).toBeTruthy()
    if (titleBox && playNextBox && queueBox && rowBox) {
      expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(playNextBox.x + 1)
      expect(queueBox.x + queueBox.width).toBeLessThanOrEqual(
        rowBox.x + rowBox.width + 1,
      )
    }
  })

  test('queue list shows both badges when both modes are mixed without title clipping', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    const search = page.getByPlaceholder(/search songs/i)
    await search.fill('daft punk')

    const rows = page.locator('ul li')
    await rows.first().getByRole('button', { name: 'Play next' }).click()
    await expect(page.getByText(/Playing next:/)).toBeVisible()

    await search.fill('')
    await search.fill('daft punk')
    await rows.nth(1).getByRole('button', { name: 'Add to queue' }).click()
    await expect(page.getByText(/Added to queue:/)).toBeVisible()

    await page
      .getByRole('navigation', { name: 'Room navigation' })
      .getByRole('button', { name: /^Queue/ })
      .click()

    const queueRows = page.locator('section ul li')
    await expect(queueRows).toHaveCount(2)
    await expect(queueRows.filter({ hasText: 'Play next' })).toHaveCount(1)
    await expect(
      queueRows.filter({ has: page.getByText('Queue', { exact: true }) }),
    ).toHaveCount(1)

    for (const row of await queueRows.all()) {
      const title = row.locator('p.font-medium').first()
      const titleBox = await title.boundingBox()
      const rowBox = await row.boundingBox()
      expect(titleBox).toBeTruthy()
      expect(rowBox).toBeTruthy()
      if (titleBox && rowBox) {
        expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(
          rowBox.x + rowBox.width + 1,
        )
      }
    }
  })
})
