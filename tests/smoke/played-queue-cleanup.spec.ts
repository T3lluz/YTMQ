import { expect, test, type Page } from '@playwright/test'

/**
 * Unit-style smoke tests for the `playedQueueCleanup` module that the bridge
 * uses to decide which shared-queue row to delete when YT Music advances to a
 * new now-playing track. The module is pure logic (no DOM, no live Supabase),
 * so we load it directly from the Vite dev server with mocked deps and verify
 * its branching from a fixture page.
 *
 * Bug regression coverage (the original report):
 *   "When a song is added as Play next then skipping to that song while it's
 *    at the #1 spot in the queue, it does not get removed from the queue list."
 *
 * The fallback covered here is what fixes that bug — see the
 * `play_next at #1 is consumed when …` tests below.
 */

const FIXTURE_URL =
  'http://localhost:5173/YTMQ/__test/played-queue-cleanup.html'

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>played-queue-cleanup fixture</title>
  </head>
  <body>
    <script type="module">
      import { createPlayedQueueCleanup } from 'http://localhost:5173/YTMQ/src/bridge/playedQueueCleanup.ts'

      const state = {
        rows: [],
        sessionStart: 0,
        nowMs: 0,
        deletedIds: [],
        deleteReasons: [],
        cooldownMs: 8000,
        suppressExactMatchFor: new Set(),
      }

      function sortRowsByPosition() {
        return [...state.rows].sort((a, b) => a.position - b.position)
      }

      function buildCleanup() {
        return createPlayedQueueCleanup(
          {
            findByVideoId: async (videoId) => {
              if (state.suppressExactMatchFor.has(videoId)) return null
              const matches = sortRowsByPosition().filter(
                (row) => row.video_id === videoId,
              )
              return matches[0] ?? null
            },
            findTopOfQueue: async () => sortRowsByPosition()[0] ?? null,
            deleteRow: async (row, reason) => {
              const idx = state.rows.findIndex((r) => r.id === row.id)
              if (idx >= 0) state.rows.splice(idx, 1)
              state.deletedIds.push(row.id)
              state.deleteReasons.push(reason)
              return true
            },
            isInPlaybackSession: (createdAt) =>
              Number(createdAt) >= state.sessionStart,
            now: () => state.nowMs,
          },
          { fallbackCooldownMs: state.cooldownMs },
        )
      }

      let cleanup = buildCleanup()

      window.__cleanupTest = {
        state,
        setRows: (rows) => {
          state.rows = rows.map((r) => ({ ...r }))
        },
        setSessionStart: (ts) => {
          state.sessionStart = ts
        },
        setNow: (ts) => {
          state.nowMs = ts
        },
        setCooldown: (ms) => {
          state.cooldownMs = ms
          cleanup = buildCleanup()
        },
        suppressExactMatchFor: (videoId) => {
          state.suppressExactMatchFor.add(videoId)
        },
        rebuild: () => {
          cleanup = buildCleanup()
        },
        run: (videoId) => cleanup(videoId),
        getRows: () => state.rows.slice(),
        getDeletedIds: () => state.deletedIds.slice(),
        reset: () => {
          state.rows = []
          state.sessionStart = 0
          state.nowMs = 0
          state.deletedIds = []
          state.deleteReasons = []
          state.cooldownMs = 8000
          state.suppressExactMatchFor.clear()
          cleanup = buildCleanup()
        },
      }
      window.__cleanupReady = true
    </script>
  </body>
</html>`

type Row = {
  id: string
  position: number
  video_id: string
  insert_mode: 'play_next' | 'queue'
  created_at: string
  title?: string
}

type CleanupResult = {
  removedRowId: string | null
  reason: string
}

type TestApi = {
  setRows: (rows: Row[]) => void
  setSessionStart: (ts: number) => void
  setNow: (ts: number) => void
  setCooldown: (ms: number) => void
  suppressExactMatchFor: (videoId: string) => void
  rebuild: () => void
  run: (videoId: string) => Promise<CleanupResult>
  getRows: () => Row[]
  getDeletedIds: () => string[]
  reset: () => void
}

declare global {
  interface Window {
    __cleanupTest: TestApi
    __cleanupReady?: boolean
  }
}

async function gotoFixture(page: Page) {
  await page.route(FIXTURE_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: FIXTURE_HTML,
    }),
  )
  await page.goto(FIXTURE_URL)
  await page.waitForFunction(
    () =>
      (window as unknown as { __cleanupReady?: boolean }).__cleanupReady ===
      true,
  )
}

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await page.evaluate(() => window.__cleanupTest.reset())
})

test.describe('removePlayedFromSharedQueue', () => {
  test('exact videoId match removes the matching session row', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(100)
      api.setNow(1_000)
      api.setRows([
        {
          id: 'r_play_next',
          position: 0,
          video_id: 'vidPlayNext',
          insert_mode: 'play_next',
          created_at: '500',
          title: 'Play next track',
        },
        {
          id: 'r_queue',
          position: 1,
          video_id: 'vidQueue',
          insert_mode: 'queue',
          created_at: '600',
          title: 'Queue track',
        },
      ])
      const r = await api.run('vidPlayNext')
      return { r, rows: api.getRows() }
    })
    expect(result.r).toEqual({
      removedRowId: 'r_play_next',
      reason: 'exact-match',
    })
    expect(result.rows.map((r) => r.id)).toEqual(['r_queue'])
  })

  test('exact match in a previous session is left untouched', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(1_000)
      api.setNow(2_000)
      api.setRows([
        {
          id: 'r_old',
          position: 0,
          video_id: 'vidOld',
          insert_mode: 'queue',
          // Pre-session creation time → must NOT be deleted.
          created_at: '500',
        },
      ])
      const r = await api.run('vidOld')
      return { r, rows: api.getRows() }
    })
    expect(result.r).toEqual({
      removedRowId: null,
      reason: 'exact-not-in-session',
    })
    expect(result.rows.map((r) => r.id)).toEqual(['r_old'])
  })

  test(
    'play_next at #1 is consumed when YT Music advances to a substituted videoId ' +
      '(regression: play_next stuck at #1 after skip)',
    async ({ page }) => {
      const result = await page.evaluate(async () => {
        const api = window.__cleanupTest
        api.setSessionStart(100)
        api.setNow(5_000)
        api.setRows([
          // The user added this as Play next; PR #5 puts it at the top.
          {
            id: 'r_play_next_top',
            position: -1,
            video_id: 'vidWeQueued',
            insert_mode: 'play_next',
            created_at: '1000',
            title: 'What the user picked',
          },
          {
            id: 'r_queue_below',
            position: 0,
            video_id: 'vidBelow',
            insert_mode: 'queue',
            created_at: '500',
          },
        ])
        // YT Music advanced to a DIFFERENT videoId (substitution / autoplay /
        // pending insert). The exact-match branch finds nothing, the fallback
        // must consume the top play_next row.
        const r = await api.run('vidYtmActuallyPlays')
        return { r, rows: api.getRows() }
      })
      expect(result.r).toEqual({
        removedRowId: 'r_play_next_top',
        reason: 'play-next-fallback',
      })
      expect(result.rows.map((r) => r.id)).toEqual(['r_queue_below'])
    },
  )

  test('fallback does NOT trigger when the top row is a "queue" entry', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(100)
      api.setNow(5_000)
      api.setRows([
        {
          id: 'r_queue_top',
          position: 0,
          video_id: 'vidQueueTop',
          insert_mode: 'queue',
          created_at: '1000',
        },
      ])
      const r = await api.run('vidWhatever')
      return { r, rows: api.getRows() }
    })
    expect(result.r).toEqual({
      removedRowId: null,
      reason: 'fallback-not-play-next',
    })
    expect(result.rows.map((r) => r.id)).toEqual(['r_queue_top'])
  })

  test('fallback does NOT trigger when the top play_next row is from a previous session', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(2_000)
      api.setNow(5_000)
      api.setRows([
        {
          id: 'r_pre_session',
          position: 0,
          video_id: 'vidPreSession',
          insert_mode: 'play_next',
          // Created before the current playback session started.
          created_at: '500',
        },
      ])
      const r = await api.run('vidUnrelated')
      return { r, rows: api.getRows() }
    })
    expect(result.r).toEqual({
      removedRowId: null,
      reason: 'fallback-not-in-session',
    })
    expect(result.rows.map((r) => r.id)).toEqual(['r_pre_session'])
  })

  test('fallback respects cooldown: a second non-matching tick within cooldown does NOT delete another row', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(100)
      api.setCooldown(5_000)
      api.setNow(1_000)
      api.setRows([
        {
          id: 'r_pn_1',
          position: -2,
          video_id: 'vidA',
          insert_mode: 'play_next',
          created_at: '200',
        },
        {
          id: 'r_pn_2',
          position: -1,
          video_id: 'vidB',
          insert_mode: 'play_next',
          created_at: '300',
        },
      ])

      // 1st tick: now-playing doesn't match any row → fallback consumes r_pn_1.
      const first = await api.run('vidAutoplay1')
      // 2nd tick a moment later: now-playing changes again, still no match.
      // Without cooldown the fallback would happily eat r_pn_2 too. With
      // cooldown it must be skipped.
      api.setNow(2_000)
      const second = await api.run('vidAutoplay2')
      // 3rd tick after the cooldown elapses: fallback fires again.
      api.setNow(10_000)
      const third = await api.run('vidAutoplay3')

      return {
        first,
        second,
        third,
        deletedIds: api.getDeletedIds(),
        remainingIds: api.getRows().map((r) => r.id),
      }
    })
    expect(result.first).toEqual({
      removedRowId: 'r_pn_1',
      reason: 'play-next-fallback',
    })
    expect(result.second).toEqual({
      removedRowId: null,
      reason: 'fallback-cooldown',
    })
    expect(result.third).toEqual({
      removedRowId: 'r_pn_2',
      reason: 'play-next-fallback',
    })
    expect(result.deletedIds).toEqual(['r_pn_1', 'r_pn_2'])
    expect(result.remainingIds).toEqual([])
  })

  test('fallback skips when the top row videoId equals now-playing (lets exact-match handle it on a later tick)', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(100)
      api.setNow(1_000)
      api.setRows([
        {
          id: 'r_stale_miss',
          position: -1,
          video_id: 'vidNowPlaying',
          insert_mode: 'play_next',
          created_at: '500',
        },
      ])
      // Simulate a read-after-write miss: the exact-match query transiently
      // can't find the row even though it's still at the top. The fallback
      // must NOT consume it (its videoId matches now-playing, so leaving it
      // means the next exact-match tick will delete it cleanly).
      api.suppressExactMatchFor('vidNowPlaying')
      api.rebuild()
      const r = await api.run('vidNowPlaying')
      return { r, rows: api.getRows() }
    })
    expect(result.r).toEqual({
      removedRowId: null,
      reason: 'fallback-matches-now-playing',
    })
    expect(result.rows.map((r) => r.id)).toEqual(['r_stale_miss'])
  })

  test('fallback skipped when the queue is empty', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(100)
      api.setNow(1_000)
      api.setRows([])
      const r = await api.run('vidAutoplay')
      return r
    })
    expect(result).toEqual({ removedRowId: null, reason: 'no-match' })
  })

  test('exact-match always wins over the fallback (even when a different play_next is at #1)', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const api = window.__cleanupTest
      api.setSessionStart(100)
      api.setNow(1_000)
      api.setRows([
        // Top of queue is a fresh play_next — but NOT what's actually
        // playing. The exact match below must win.
        {
          id: 'r_top_pn',
          position: -1,
          video_id: 'vidTopPlayNext',
          insert_mode: 'play_next',
          created_at: '900',
        },
        {
          id: 'r_buried_match',
          position: 5,
          video_id: 'vidActuallyPlaying',
          insert_mode: 'queue',
          created_at: '800',
        },
      ])
      const r = await api.run('vidActuallyPlaying')
      return { r, rows: api.getRows() }
    })
    expect(result.r).toEqual({
      removedRowId: 'r_buried_match',
      reason: 'exact-match',
    })
    expect(result.rows.map((r) => r.id)).toEqual(['r_top_pn'])
  })
})
