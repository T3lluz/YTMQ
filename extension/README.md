# YTMQ extension (Chrome and Firefox)

Links [music.youtube.com](https://music.youtube.com) to your YTMQ lobby. Once installed, every YouTube Music tab follows the lobby by itself, across reloads, navigations and browser restarts. User docs: [t3lluz.com/ytmq/docs/extension](https://t3lluz.com/ytmq/docs/extension).

## Install

Firefox: one click on [t3lluz.com/ytmq/docs/install](https://t3lluz.com/ytmq/docs/install). The Firefox build is these files with a manifest from `scripts/extension-files.mjs`; see the main README.

Chrome (Load unpacked):

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select this folder.

Then open your YTMQ lobby as host. The extension picks up the room from the YTMQ site. If a YouTube Music tab is open it links that one; otherwise **Connect YouTube Music** in Admin reuses or opens one. Guest picks land in your YouTube Music queue from then on.

Creating a new lobby re-points every YouTube Music tab at it, so an ended lobby never keeps a tab.

## Files

- `manifest.json`: Manifest V3, scoped to `https://music.youtube.com/*` and the YTMQ site (`https://t3lluz.com/ytmq`).
- `content.js`: runs on music.youtube.com; captures the room session from the connect link (`document_start`, before YT Music strips the query string) and persists it. When several stored sessions exist, the newest wins.
- `site.js`: runs on the YTMQ web app; relays the current room session to the service worker so open YouTube Music tabs connect without a deep link.
- `background.js`: service worker; injects the bridge into the page's main world via `chrome.scripting.executeScript`, re-linking tabs whenever the room changes.
- `ytmusic-bridge.js`: the bundled YTMQ bridge (build artifact of `npm run build:bridge`; do not edit by hand).
- `ui.js`: the panel view shared by the overlay and the popup (styles, rows, now playing, animations).
- `ytm-panel.js`: the overlay on music.youtube.com: the pill (draggable) and the panel for that tab, fed by `src/bridge/panelBridge.ts`.
- `popup.html` / `popup.js`: the toolbar popup: the whole lobby, read straight from the server, covering YouTube Music and Spotify.
