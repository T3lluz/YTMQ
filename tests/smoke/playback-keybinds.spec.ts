import { expect, test, type Page } from '@playwright/test'
import { PREV_RESTART_SECONDS } from '../../src/lib/playback'

/**
 * Unit-style smoke tests for room transport keybinds:
 * Space = play/pause, Right = next, Left = restart-or-previous (3s rule).
 */

const FIXTURE_URL = 'http://localhost:5173/YTMQ/__test/playback-keybinds.html'

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>playback-keybinds fixture</title>
  </head>
  <body>
    <input id="search" />
    <textarea id="notes"></textarea>
    <div id="plain" tabindex="0">not editable</div>
    <script type="module">
      import {
        playbackActionFromKey,
        isEditableKeyboardTarget,
        resolvePrevCommand,
        commandForPlaybackKey,
        bindPlaybackKeybinds,
      } from 'http://localhost:5173/YTMQ/src/lib/playbackKeybinds.ts'
      import { PREV_RESTART_SECONDS } from 'http://localhost:5173/YTMQ/src/lib/playback.ts'

      const state = {
        enabled: true,
        position: 0,
        commands: [],
        unbind: null,
      }

      function bind() {
        state.unbind?.()
        state.unbind = bindPlaybackKeybinds({
          getEnabled: () => state.enabled,
          getPosition: () => state.position,
          sendCommand: (command) => {
            state.commands.push(command)
          },
        })
      }

      window.__keybindTest = {
        PREV_RESTART_SECONDS,
        playbackActionFromKey,
        isEditableKeyboardTarget,
        resolvePrevCommand,
        commandForPlaybackKey,
        state,
        bind,
        reset: () => {
          state.enabled = true
          state.position = 0
          state.commands = []
          bind()
        },
        setEnabled: (value) => {
          state.enabled = value
        },
        setPosition: (value) => {
          state.position = value
        },
        getCommands: () => state.commands.slice(),
      }
      window.__keybindReady = true
    </script>
  </body>
</html>`

type KeyLike = {
  key: string
  code?: string
  repeat?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

type Command =
  | { action: 'toggle' | 'next' | 'prev' }
  | { action: 'seek'; position: number }

type TestApi = {
  PREV_RESTART_SECONDS: number
  playbackActionFromKey: (event: KeyLike) => 'toggle' | 'next' | 'prev' | null
  isEditableKeyboardTarget: (target: EventTarget | null) => boolean
  resolvePrevCommand: (currentTime: number) => Command
  commandForPlaybackKey: (
    action: 'toggle' | 'next' | 'prev',
    currentTime: number,
  ) => Command
  reset: () => void
  setEnabled: (value: boolean) => void
  setPosition: (value: number) => void
  getCommands: () => Command[]
}

declare global {
  interface Window {
    __keybindTest: TestApi
    __keybindReady?: boolean
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
      (window as unknown as { __keybindReady?: boolean }).__keybindReady ===
      true,
  )
}

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await page.evaluate(() => window.__keybindTest.reset())
})

test.describe('playback key mapping', () => {
  test('space toggles, arrows skip and previous', async ({ page }) => {
    const mapped = await page.evaluate(() => {
      const api = window.__keybindTest
      return {
        space: api.playbackActionFromKey({ key: ' ' }),
        spacebar: api.playbackActionFromKey({ key: 'Spacebar' }),
        spaceCode: api.playbackActionFromKey({ key: 'Unidentified', code: 'Space' }),
        right: api.playbackActionFromKey({ key: 'ArrowRight' }),
        left: api.playbackActionFromKey({ key: 'ArrowLeft' }),
        other: api.playbackActionFromKey({ key: 'k' }),
      }
    })

    expect(mapped.space).toBe('toggle')
    expect(mapped.spacebar).toBe('toggle')
    expect(mapped.spaceCode).toBe('toggle')
    expect(mapped.right).toBe('next')
    expect(mapped.left).toBe('prev')
    expect(mapped.other).toBeNull()
  })

  test('ignores key repeat and modifier chords', async ({ page }) => {
    const mapped = await page.evaluate(() => {
      const api = window.__keybindTest
      return {
        repeat: api.playbackActionFromKey({ key: ' ', repeat: true }),
        ctrl: api.playbackActionFromKey({ key: 'ArrowRight', ctrlKey: true }),
        meta: api.playbackActionFromKey({ key: 'ArrowLeft', metaKey: true }),
        alt: api.playbackActionFromKey({ key: ' ', altKey: true }),
        shift: api.playbackActionFromKey({ key: 'ArrowRight', shiftKey: true }),
      }
    })

    expect(mapped.repeat).toBeNull()
    expect(mapped.ctrl).toBeNull()
    expect(mapped.meta).toBeNull()
    expect(mapped.alt).toBeNull()
    expect(mapped.shift).toBeNull()
  })
})

test.describe('previous-track 3s restart', () => {
  test('restarts the current song at or after the 3s threshold', async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const api = window.__keybindTest
      return {
        threshold: api.PREV_RESTART_SECONDS,
        atZero: api.resolvePrevCommand(0),
        justUnder: api.resolvePrevCommand(2.99),
        atThreshold: api.resolvePrevCommand(3),
        wellPast: api.resolvePrevCommand(90),
        viaKey: api.commandForPlaybackKey('prev', 12),
        nextIgnoresTime: api.commandForPlaybackKey('next', 12),
      }
    })

    expect(result.threshold).toBe(PREV_RESTART_SECONDS)
    expect(result.atZero).toEqual({ action: 'prev' })
    expect(result.justUnder).toEqual({ action: 'prev' })
    expect(result.atThreshold).toEqual({ action: 'seek', position: 0 })
    expect(result.wellPast).toEqual({ action: 'seek', position: 0 })
    expect(result.viaKey).toEqual({ action: 'seek', position: 0 })
    expect(result.nextIgnoresTime).toEqual({ action: 'next' })
  })
})

test.describe('bindPlaybackKeybinds', () => {
  test('space / arrows send the matching commands', async ({ page }) => {
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await page.evaluate(() => window.__keybindTest.setPosition(1.5))
    await page.keyboard.press('ArrowLeft')
    await page.evaluate(() => window.__keybindTest.setPosition(8))
    await page.keyboard.press('ArrowLeft')

    const commands = await page.evaluate(() =>
      window.__keybindTest.getCommands(),
    )
    expect(commands).toEqual([
      { action: 'toggle' },
      { action: 'next' },
      { action: 'prev' },
      { action: 'seek', position: 0 },
    ])
  })

  test('does not steal keys while typing in a field', async ({ page }) => {
    await page.locator('#search').focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')

    await page.locator('#notes').focus()
    await page.keyboard.press('ArrowLeft')

    await page.locator('#plain').click()
    await page.keyboard.press('Space')

    const commands = await page.evaluate(() =>
      window.__keybindTest.getCommands(),
    )
    expect(commands).toEqual([{ action: 'toggle' }])
  })

  test('does nothing when controls are disabled', async ({ page }) => {
    await page.evaluate(() => window.__keybindTest.setEnabled(false))
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')

    const commands = await page.evaluate(() =>
      window.__keybindTest.getCommands(),
    )
    expect(commands).toEqual([])
  })
})
