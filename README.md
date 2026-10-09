# YTMQ

Shared queue for **YouTube Music**, plus a Spotify follower for lyrics: guests use this web app to search and manage the queue in realtime; the host connects [YouTube Music](https://music.youtube.com) so new tracks play there, and/or links Spotify so the lobby shows whatever is already playing.

**Live app:** https://t3lluz.com/ytmq/ (`/YTMQ`, `/Ytmq` and so on redirect there). Push to `main` and it is live within a minute.

Everything runs on t3lluz: one Deno server (`server/`) serves the app, the API, the realtime WebSocket and the search/lyrics functions, with the data in SQLite. How it is deployed and exposed: [deploy/server/README.md](deploy/server/README.md).

## Local development

1. `npm install`
2. Start the API: `cd server && deno task dev` (port 8787, data in `.data/`). Or skip it and use the live API: `YTMQ_API_PROXY=https://t3lluz.com npm run dev`.
3. `npm run dev` → open `http://localhost:5173/ytmq/`

Optional `.env.local`:
- `VITE_PUBLIC_SITE_URL` — HTTPS site root the YouTube Music bridge loads from when you develop on `http://localhost` (e.g. `https://t3lluz.com/ytmq`).
- `VITE_API_URL` — absolute API URL, if it is not the app's own origin.
- `VITE_SPOTIFY_CLIENT_ID` — only to override the built-in Spotify app.

No secrets anywhere: search scrapes YouTube Music's own web API server-side, and lyrics come from public sources.

## Spotify (optional host follower)

Spotify uses the official Web API (PKCE) from the host's YTMQ tab. No extension, no Client ID prompt. After login, YTMQ reads the active Spotify player and shows that track on lyrics, now playing, and recently played. It does not push the shared queue onto Spotify.

The app already ships a public Client ID. On the Spotify dashboard, add these exact redirect URIs (trailing slash included):
- `http://localhost:5173/ytmq/`
- `https://t3lluz.com/ytmq/`

Then play something in the Spotify app, click **Connect Spotify** in Admin, and approve access. Keep the YTMQ host tab open.

Skip / pause / seek from YTMQ need Spotify Premium. Following what is playing works on Free.

You can connect YouTube Music and Spotify at the same time; now-playing prefers Spotify while it is actively publishing.

Guest links and QR codes point at `/ytmq/room/<id>`; the server answers any unknown path under `/ytmq/` with the app.

## Chrome extension (host auto-connect)

The `extension/` folder is a Manifest V3 Chrome extension that auto-injects the YTMQ bridge on **every** `music.youtube.com` tab — no Tampermonkey, no console pasting, and it survives reloads and browser restarts.

**Install (one time):**

1. Download `ytmq-extension.zip` from the deployed site (or run `npm run build` and grab `dist/ytmq-extension.zip`), unzip it somewhere permanent — or use the `extension/` folder of a checkout directly.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the folder.

**How it works:** the host clicks *Connect YouTube Music* in the lobby, which opens `music.youtube.com` with the room id and API address in the URL. The extension's content script captures them (before YT Music strips the query string), stores the session (`chrome.storage.local` + `localStorage`, 7-day expiry), and the service worker injects the bundled `ytmusic-bridge.js` into the page's main world via `chrome.scripting`. Every later YT Music tab reconnects automatically from the stored session. The toolbar popup shows the linked room and offers a one-click **Disconnect** (stops the bridge in all YT Music tabs and clears the session).

`extension/ytmusic-bridge.js` is the same bundle built by `npm run build:bridge` (kept in sync by `scripts/copy-bridge-root.mjs`); `scripts/pack-extension.mjs` zips the extension into `dist/` on every build.

## Tests

- `npx playwright test -c playwright.smoke.config.ts` — mocked-backend smoke tests (no server needed).
- `npm run test:e2e` — end-to-end against a local server (`cd server && deno task dev`). See [tests/README.md](tests/README.md).
- `cd server && deno task check` — type-check the server.

## Architecture

See [docs/AGENT.md](docs/AGENT.md) for product scope, data model and routes.
