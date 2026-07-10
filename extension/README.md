# YTMQ Chrome extension

Auto-connects YTMQ shared queues on [music.youtube.com](https://music.youtube.com). Once installed, every YouTube Music tab links to your room automatically — across reloads, navigations, and browser restarts.

## Install (Load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select this folder.

Then open your YTMQ lobby as host. The extension picks up the room straight from the YTMQ site — if a YouTube Music tab is already open it links to it automatically, otherwise click **Connect YouTube Music** and it reuses or opens one for you. Guest picks land in your YouTube Music queue automatically from then on.

Creating a new lobby re-points every YouTube Music tab at the new room — no stale sessions.

## Files

- `manifest.json` — Manifest V3, scoped to `https://music.youtube.com/*` and the YTMQ site.
- `content.js` — runs on music.youtube.com; captures the room session from the connect link (`document_start`, before YT Music strips the query string) and persists it. When several stored sessions exist, the newest wins.
- `site.js` — runs on the YTMQ web app; relays the current room session to the service worker so open YouTube Music tabs connect without a deep link.
- `background.js` — service worker; injects the bridge into the page's main world via `chrome.scripting.executeScript`, re-linking tabs whenever the room changes.
- `ytmusic-bridge.js` — the bundled YTMQ bridge (build artifact of `npm run build:bridge`; do not edit by hand).
- `popup.html` / `popup.js` — toolbar popup showing link status. Open YTMQ / Open YT Music focus existing tabs instead of opening duplicates; Disconnect unlinks everything.
