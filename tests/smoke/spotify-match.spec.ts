import { expect, test, type Page } from '@playwright/test'

/**
 * Unit-style coverage for YouTube Music title/artist → Spotify track matching,
 * loaded through Vite so we exercise the same module the app ships.
 */

const FIXTURE_URL = 'http://localhost:5173/YTMQ/__test/spotify-match.html'

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>spotify-match fixture</title>
  </head>
  <body>
    <script type="module">
      import {
        cleanArtistName,
        cleanMusicTitle,
        buildSpotifySearchQueries,
        scoreSpotifyCandidate,
        pickSpotifyMatch,
        pickNextPlayable,
      } from 'http://localhost:5173/YTMQ/src/lib/spotifyMatch.ts'

      window.__spotifyMatch = {
        cleanArtistName,
        cleanMusicTitle,
        buildSpotifySearchQueries,
        scoreSpotifyCandidate,
        pickSpotifyMatch,
        pickNextPlayable,
      }
      window.__spotifyMatchReady = true
    </script>
  </body>
</html>`

async function gotoFixture(page: Page) {
  await page.route(FIXTURE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE_HTML }),
  )
  await page.goto(FIXTURE_URL)
  await page.waitForFunction(
    () =>
      (window as unknown as { __spotifyMatchReady?: boolean })
        .__spotifyMatchReady === true,
  )
}

type Api = {
  cleanArtistName: (artist: string) => string
  cleanMusicTitle: (title: string) => string
  buildSpotifySearchQueries: (title: string, artist: string) => string[]
  scoreSpotifyCandidate: (
    title: string,
    artist: string,
    candidate: { name: string; artist: string },
  ) => number
  pickSpotifyMatch: (
    title: string,
    artist: string,
    candidates: {
      id: string
      uri: string
      name: string
      artist: string
      albumArt: string
      durationMs: number
    }[],
  ) => { id: string; name: string } | null
  pickNextPlayable: (
    items: { id: string }[],
    matched: Map<string, { uri: string }>,
    failed: Set<string>,
  ) => { item: { id: string } } | null
}

test.describe('Spotify track matching', () => {
  test('strips YouTube Music title noise and Topic artist suffixes', async ({
    page,
  }) => {
    await gotoFixture(page)

    expect(
      await page.evaluate(
        (title) =>
          (window as unknown as { __spotifyMatch: Api }).__spotifyMatch.cleanMusicTitle(
            title,
          ),
        'Get Lucky (Official Video)',
      ),
    ).toBe('get lucky')

    expect(
      await page.evaluate(
        (artist) =>
          (window as unknown as { __spotifyMatch: Api }).__spotifyMatch.cleanArtistName(
            artist,
          ),
        'Daft Punk - Topic',
      ),
    ).toBe('daft punk')

    const queries = await page.evaluate(
      ({ title, artist }) =>
        (
          window as unknown as { __spotifyMatch: Api }
        ).__spotifyMatch.buildSpotifySearchQueries(title, artist),
      { title: 'Get Lucky (Official Video)', artist: 'Daft Punk - Topic' },
    )
    expect(queries[0]).toContain('track:get lucky')
    expect(queries[0]).toContain('artist:daft punk')
  })

  test('picks the same song and rejects a weak match', async ({ page }) => {
    await gotoFixture(page)

    const picked = await page.evaluate(() => {
      const api = (window as unknown as { __spotifyMatch: Api }).__spotifyMatch
      return api.pickSpotifyMatch('Get Lucky', 'Daft Punk', [
        {
          id: 'wrong',
          uri: 'spotify:track:wrong',
          name: 'Around the World',
          artist: 'Daft Punk',
          albumArt: '',
          durationMs: 1,
        },
        {
          id: 'lucky',
          uri: 'spotify:track:lucky',
          name: 'Get Lucky',
          artist: 'Daft Punk',
          albumArt: '',
          durationMs: 1,
        },
      ])
    })
    expect(picked?.id).toBe('lucky')

    const rejected = await page.evaluate(() => {
      const api = (window as unknown as { __spotifyMatch: Api }).__spotifyMatch
      return api.pickSpotifyMatch('Get Lucky', 'Daft Punk', [
        {
          id: 'unrelated',
          uri: 'spotify:track:nope',
          name: 'Yellow',
          artist: 'Coldplay',
          albumArt: '',
          durationMs: 1,
        },
      ])
    })
    expect(rejected).toBeNull()
  })

  test('skips failed matches when picking the next playable row', async ({
    page,
  }) => {
    await gotoFixture(page)
    const next = await page.evaluate(() => {
      const api = (window as unknown as { __spotifyMatch: Api }).__spotifyMatch
      const matched = new Map([
        [
          'b',
          {
            id: 'b',
            uri: 'spotify:track:b',
            name: 'B',
            artist: 'X',
            albumArt: '',
            durationMs: 1,
          },
        ],
      ])
      const failed = new Set(['a'])
      return api.pickNextPlayable([{ id: 'a' }, { id: 'b' }], matched, failed)
    })
    expect(next?.item.id).toBe('b')
  })
})
