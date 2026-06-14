import { expect, test, type Page } from '@playwright/test'

/**
 * Smoke tests for the "Up next" banner that the YT Music bridge shows on
 * music.youtube.com in the last 15 seconds of the current track.
 *
 * The banner module is self-contained and accepts injectable readers, so we
 * load it directly from the Vite dev server into a blank fixture page and
 * drive it through every state without needing a real music.youtube.com tab.
 */

const FIXTURE_URL = 'http://localhost:5173/YTMQ/__test/next-song-toast.html'

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>next-song-toast fixture</title>
  </head>
  <body>
    <script type="module">
      import {
        ensureNextToastStyles,
        showNextSongToast,
        hideNextSongToast,
        tickNextSongToast,
        computeVisibleMs,
        getShownVideoIdForTest,
        resetNextSongToastForTest,
      } from 'http://localhost:5173/YTMQ/src/bridge/nextSongToast.ts'

      const state = {
        times: null,
        currentVideoId: '',
        nextSong: null,
      }

      window.__nextToastTest = {
        state,
        setTimes: (current, duration) => {
          state.times = current == null ? null : { current, duration }
        },
        setCurrentVideoId: (id) => {
          state.currentVideoId = id ?? ''
        },
        setNextSong: (song) => {
          state.nextSong = song
        },
        tick: () => {
          tickNextSongToast({
            readTimes: () => state.times,
            readCurrentVideoId: () => state.currentVideoId,
            readNextSong: () => state.nextSong,
          })
        },
        show: (info, currentVideoId, visibleMs) =>
          showNextSongToast(info, currentVideoId, visibleMs),
        hide: (immediate) => hideNextSongToast({ immediate }),
        styles: () => ensureNextToastStyles(),
        shownFor: () => getShownVideoIdForTest(),
        reset: () => resetNextSongToastForTest(),
        computeVisibleMs,
      }
      window.__nextToastReady = true
    </script>
  </body>
</html>`

async function gotoFixture(page: Page) {
  await page.route(FIXTURE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE_HTML }),
  )
  await page.goto(FIXTURE_URL)
  await page.waitForFunction(() => (window as unknown as { __nextToastReady?: boolean }).__nextToastReady === true)
}

type TestApi = {
  setTimes: (current: number | null, duration?: number) => void
  setCurrentVideoId: (id: string) => void
  setNextSong: (
    song: {
      videoId: string
      title: string
      artist: string
      thumbnailUrl: string
    } | null,
  ) => void
  tick: () => void
  show: (
    info: { videoId: string; title: string; artist: string; thumbnailUrl: string },
    currentVideoId: string,
    visibleMs: number,
  ) => void
  hide: (immediate?: boolean) => void
  styles: () => void
  shownFor: () => string
  reset: () => void
  computeVisibleMs: (remaining: number) => number
}

declare global {
  interface Window {
    __nextToastTest: TestApi
    __nextToastReady?: boolean
  }
}

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await page.evaluate(() => window.__nextToastTest.reset())
})

test.describe('Up next banner', () => {
  test('appears when remaining time is within the 15 s window', async ({ page }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('current_vid_1')
      api.setNextSong({
        videoId: 'next_vid_1',
        title: 'Voyager',
        artist: 'Daft Punk',
        thumbnailUrl: 'https://i.ytimg.com/vi/next_vid_1/default.jpg',
      })
      api.setTimes(290, 300)
      api.tick()
    })

    const toast = page.locator('#ytmq-next-toast')
    await expect(toast).toBeVisible()
    await expect(toast.locator('.ytmq-next-label')).toHaveText('Up next')
    await expect(toast.locator('.ytmq-next-title')).toHaveText('Voyager')
    await expect(toast.locator('.ytmq-next-artist')).toHaveText('Daft Punk')
    const thumbSrc = await toast.locator('img.ytmq-next-thumb').getAttribute('src')
    expect(thumbSrc).toBe('https://i.ytimg.com/vi/next_vid_1/default.jpg')

    const shownFor = await page.evaluate(() => window.__nextToastTest.shownFor())
    expect(shownFor).toBe('current_vid_1')
  })

  test('does not appear when more than 15 s remain', async ({ page }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('current_vid_2')
      api.setNextSong({
        videoId: 'next_vid_2',
        title: 'Around the World',
        artist: 'Daft Punk',
        thumbnailUrl: '',
      })
      api.setTimes(100, 300)
      api.tick()
    })

    await expect(page.locator('#ytmq-next-toast')).toHaveCount(0)
  })

  test('does not appear when the track is essentially over (< 0.5 s remaining)', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('current_vid_3')
      api.setNextSong({
        videoId: 'next_vid_3',
        title: 'Rollin & Scratchin',
        artist: 'Daft Punk',
        thumbnailUrl: '',
      })
      api.setTimes(299.8, 300)
      api.tick()
    })

    await expect(page.locator('#ytmq-next-toast')).toHaveCount(0)
  })

  test('does not appear when there is no next song queued', async ({ page }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('current_vid_4')
      api.setNextSong(null)
      api.setTimes(290, 300)
      api.tick()
    })

    await expect(page.locator('#ytmq-next-toast')).toHaveCount(0)
  })

  test('does not appear when the next song id equals the current song id', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('repeat_vid')
      api.setNextSong({
        videoId: 'repeat_vid',
        title: 'Looped track',
        artist: 'Self',
        thumbnailUrl: '',
      })
      api.setTimes(290, 300)
      api.tick()
    })

    await expect(page.locator('#ytmq-next-toast')).toHaveCount(0)
  })

  test('is not duplicated when the scheduler ticks again for the same track', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('current_vid_5')
      api.setNextSong({
        videoId: 'next_vid_5',
        title: 'Aerodynamic',
        artist: 'Daft Punk',
        thumbnailUrl: '',
      })
      api.setTimes(290, 300)
      api.tick()
      api.setTimes(292, 300)
      api.tick()
      api.setTimes(294, 300)
      api.tick()
    })

    await expect(page.locator('#ytmq-next-toast')).toHaveCount(1)
  })

  test('disappears immediately when the current track changes', async ({ page }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('current_vid_6')
      api.setNextSong({
        videoId: 'next_vid_6',
        title: 'Digital Love',
        artist: 'Daft Punk',
        thumbnailUrl: '',
      })
      api.setTimes(290, 300)
      api.tick()
    })

    await expect(page.locator('#ytmq-next-toast')).toBeVisible()

    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('next_vid_6')
      api.setTimes(0, 300)
      api.tick()
    })

    await expect(page.locator('#ytmq-next-toast')).toHaveCount(0)
    const shownFor = await page.evaluate(() => window.__nextToastTest.shownFor())
    expect(shownFor).toBe('')
  })

  test('auto-hides with a leaving animation after the visible window elapses', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.show(
        {
          videoId: 'auto_next',
          title: 'High Life',
          artist: 'Daft Punk',
          thumbnailUrl: '',
        },
        'auto_current',
        200,
      )
    })

    const toast = page.locator('#ytmq-next-toast')
    await expect(toast).toBeVisible()

    // After visibleMs, the toast should pick up the .is-leaving class…
    await expect(toast).toHaveClass(/is-leaving/, { timeout: 1500 })
    // …and then be removed once the leave animation completes.
    await expect(toast).toHaveCount(0, { timeout: 2000 })

    const shownFor = await page.evaluate(() => window.__nextToastTest.shownFor())
    expect(shownFor).toBe('')
  })

  test('computes the visible window from remaining time and clamps to 1.5–15 s', async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const api = window.__nextToastTest
      return {
        ten: api.computeVisibleMs(10),
        threshold: api.computeVisibleMs(15),
        belowFloor: api.computeVisibleMs(1),
        zero: api.computeVisibleMs(0),
        huge: api.computeVisibleMs(120),
      }
    })

    expect(result.ten).toBe(9600)
    expect(result.threshold).toBe(14_600)
    expect(result.belowFloor).toBe(1500)
    expect(result.zero).toBe(1500)
    expect(result.huge).toBe(15_000)
  })

  test('hides the missing-thumbnail image instead of breaking the layout', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.setCurrentVideoId('no_thumb_current')
      api.setNextSong({
        videoId: 'no_thumb_next',
        title: 'Anonymous',
        artist: '',
        thumbnailUrl: '',
      })
      api.setTimes(290, 300)
      api.tick()
    })

    const toast = page.locator('#ytmq-next-toast')
    await expect(toast).toBeVisible()

    const visibility = await toast
      .locator('img.ytmq-next-thumb')
      .evaluate((el) => (el as HTMLImageElement).style.visibility)
    expect(visibility).toBe('hidden')

    // Empty artist must not render the artist span.
    await expect(toast.locator('.ytmq-next-artist')).toHaveCount(0)
  })

  test('progress bar animation duration matches the visible window', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const api = window.__nextToastTest
      api.show(
        {
          videoId: 'progress_next',
          title: 'Progress',
          artist: 'Bar',
          thumbnailUrl: '',
        },
        'progress_current',
        7_777,
      )
    })

    const duration = await page
      .locator('#ytmq-next-toast .ytmq-next-progress')
      .evaluate((el) => (el as HTMLElement).style.animationDuration)
    expect(duration).toBe('7777ms')
  })

  test('injected stylesheet is added only once even if ensureNextToastStyles runs many times', async ({
    page,
  }) => {
    const count = await page.evaluate(() => {
      const api = window.__nextToastTest
      api.styles()
      api.styles()
      api.styles()
      return document.querySelectorAll('#ytmq-next-toast-style').length
    })
    expect(count).toBe(1)
  })
})
