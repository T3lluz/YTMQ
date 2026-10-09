import { expect, test, type Page } from '@playwright/test'

/**
 * Mocked-backend smoke test for the Play next / Add to queue UI.
 *
 * The YTMQ server isn't running here, so we intercept every request the
 * React app makes to the stub API and respond with deterministic fixtures. This exercises:
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
  let idCounter = 0

  function sortedQueue(): QueueRow[] {
    return [...queue].sort((a, b) => a.position - b.position)
  }

  await page.route(/stub\.ytmq\.test\/.*/i, async (route) => {
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

    if (path.endsWith('/functions/search')) {
      return json(200, { results: makeSongs() })
    }

    if (path.endsWith(`/rooms/${ROOM_ID}/queue`)) {
      if (method === 'GET') return json(200, sortedQueue())
      if (method === 'POST') {
        let body: Partial<QueueRow> = {}
        try {
          body = JSON.parse(req.postData() ?? '{}') as Partial<QueueRow>
        } catch {
          body = {}
        }
        // Mirror the server: Play next goes above the top, Add to queue below
        // the bottom.
        const sorted = sortedQueue()
        const mode = body.insert_mode === 'queue' ? 'queue' : 'play_next'
        const position =
          sorted.length === 0
            ? 0
            : mode === 'queue'
              ? sorted[sorted.length - 1]!.position + 1
              : sorted[0]!.position - 1
        idCounter += 1
        const row: QueueRow = {
          id: `qi_${idCounter}`,
          room_id: ROOM_ID,
          position,
          video_id: body.video_id ?? '',
          title: body.title ?? '',
          channel_title: body.channel_title ?? '',
          thumbnail_url: body.thumbnail_url ?? '',
          added_by: body.added_by ?? '',
          created_at: new Date().toISOString(),
          insert_mode: mode,
        }
        queue.push(row)
        return json(201, row)
      }
    }

    const deleteMatch = path.match(/\/queue\/([^/]+)$/)
    if (deleteMatch && method === 'DELETE') {
      const idx = queue.findIndex((row) => row.id === deleteMatch[1])
      if (idx >= 0) queue.splice(idx, 1)
      return json(200, { deleted: idx >= 0 })
    }

    if (path.endsWith('/realtime')) {
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
  const dialog = page.getByRole('dialog', { name: 'What should we call you?' })
  const nav = page.getByRole('navigation', { name: 'Room navigation' })
  // The name prompt shows once the room has loaded; wait for whichever comes.
  await dialog.or(nav).first().waitFor({ timeout: 15_000 })
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByPlaceholder('Your name').fill('SmokeGuest')
    await dialog.getByRole('button', { name: 'Start adding songs' }).click()
  }
  // Tab bar appears after the room loads.
  await page
    .getByRole('navigation', { name: 'Room navigation' })
    .waitFor({ timeout: 15_000 })
}

test.use({ viewport: { width: 360, height: 720 } })

test.describe('Queue insert modes (mocked API)', () => {
  test('search rows render Play next and Add to queue buttons that fit on mobile widths', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    await page.getByPlaceholder(/songs or artists/i).fill('daft punk')

    const firstRow = page.locator('ul li').first()
    await expect(firstRow).toBeVisible({ timeout: 10_000 })

    const playNextBtn = firstRow.getByRole('button', { name: 'Play next' })
    const queueBtn = firstRow.getByRole('button', { name: 'Add to queue' })

    await expect(playNextBtn).toBeVisible()
    await expect(queueBtn).toBeVisible()

    // Title and buttons must share the row without clipping/overlap.
    const titleBox = await firstRow
      .locator('p.font-semibold')
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

    await page.getByPlaceholder(/songs or artists/i).fill('daft punk')
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
    const titleBox = await row.locator('p.font-semibold').first().boundingBox()
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

    await page.getByPlaceholder(/songs or artists/i).fill('daft punk')
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

    await page.getByPlaceholder(/songs or artists/i).fill('daft punk')
    // All puts the first song in a Top result card; Songs lists every row.
    await page.getByRole('tab', { name: 'Songs' }).click()
    const longRow = page.locator('ul li').nth(2)
    await expect(longRow).toBeVisible()

    const titleBox = await longRow.locator('p.font-semibold').first().boundingBox()
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

    const search = page.getByPlaceholder(/songs or artists/i)
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
      const title = row.locator('p.font-semibold').first()
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

  test('queue order mirrors YouTube Music: Play next jumps to the top, Add to queue appends to the bottom', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    const search = page.getByPlaceholder(/songs or artists/i)
    await search.fill('daft punk')
    // All puts the first song in a Top result card; Songs lists every row.
    await page.getByRole('tab', { name: 'Songs' }).click()

    const searchRows = page.locator('ul li')
    await expect(searchRows).toHaveCount(3)

    async function clickAndWaitForToast(
      rowIndex: number,
      buttonName: 'Play next' | 'Add to queue',
      toastPattern: RegExp,
      expectedToastCount: number,
    ) {
      await searchRows
        .nth(rowIndex)
        .getByRole('button', { name: buttonName })
        .click()
      // Wait for the new toast to appear (toasts stack, so we count them).
      await expect(page.getByText(toastPattern)).toHaveCount(expectedToastCount)
    }

    // 1) Add row 0 ("One More Time") as "Add to queue" → only queue item, bottom.
    await clickAndWaitForToast(0, 'Add to queue', /Added to queue:/, 1)
    // 2) Add row 1 ("Get Lucky") as "Add to queue" → appended below #1.
    await clickAndWaitForToast(1, 'Add to queue', /Added to queue:/, 2)
    // 3) Add row 2 (long title) as "Play next" → jumps above both queue items.
    await clickAndWaitForToast(2, 'Play next', /Playing next:/, 1)
    // 4) Add row 0 again as "Play next" → jumps ABOVE the previous play_next.
    await clickAndWaitForToast(0, 'Play next', /Playing next:/, 2)

    await page
      .getByRole('navigation', { name: 'Room navigation' })
      .getByRole('button', { name: /^Queue/ })
      .click()

    const queueRows = page.locator('section ul li')
    await expect(queueRows).toHaveCount(4)

    // Expected display order, top → bottom:
    //   [Play next #2] One More Time            (last play_next → top)
    //   [Play next #1] Around the World …       (first play_next)
    //   [Queue #1]     One More Time            (first queue item)
    //   [Queue #2]     Get Lucky                (second queue item)
    async function readRow(index: number) {
      const row = queueRows.nth(index)
      const title = await row.locator('p.font-semibold').first().textContent()
      const badge = await row
        .locator('span', { hasText: /^(Play next|Queue)$/ })
        .first()
        .textContent()
      return {
        title: (title ?? '').trim(),
        badge: (badge ?? '').trim(),
      }
    }

    const [row0, row1, row2, row3] = await Promise.all([
      readRow(0),
      readRow(1),
      readRow(2),
      readRow(3),
    ])

    expect(row0).toEqual({ title: 'One More Time', badge: 'Play next' })
    expect(row1).toEqual({
      title:
        'Around the World / Harder Better Faster Stronger (Alive 2007 Live Edit Extended Bonus Mix)',
      badge: 'Play next',
    })
    expect(row2).toEqual({ title: 'One More Time', badge: 'Queue' })
    expect(row3).toEqual({ title: 'Get Lucky', badge: 'Queue' })
  })

  test('Play next into an empty queue places the track at position 0', async ({
    page,
  }) => {
    await installMocks(page)
    await gotoRoom(page)

    await page.getByPlaceholder(/songs or artists/i).fill('daft punk')
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

    const queueRows = page.locator('section ul li')
    await expect(queueRows).toHaveCount(1)
    await expect(queueRows.first().getByText('Play next', { exact: true })).toBeVisible()
  })
})
