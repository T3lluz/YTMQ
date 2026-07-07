# YTMQ Chrome extension

Auto-connects YTMQ shared queues on [music.youtube.com](https://music.youtube.com). Once installed, every YouTube Music tab links to your room automatically — across reloads, navigations, and browser restarts.

## Install (Load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select this folder.

Then open your YTMQ lobby as host and click **Connect YouTube Music** once. Done — guest picks land in your YouTube Music queue automatically from then on.

## Files

- `manifest.json` — Manifest V3, scoped to `https://music.youtube.com/*` only.
- `content.js` — captures the room session from the connect link (`document_start`, before YT Music strips the query string) and persists it.
- `background.js` — service worker; injects the bridge into the page's main world via `chrome.scripting.executeScript`.
- `ytmusic-bridge.js` — the bundled YTMQ bridge (build artifact of `npm run build:bridge`; do not edit by hand).
- `popup.html` / `popup.js` — toolbar popup showing link status with a Disconnect button.
