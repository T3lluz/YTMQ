# YTMQ

Shared queue for **YouTube Music**: guests use this web app to search and manage the queue in realtime; the host connects [YouTube Music](https://music.youtube.com) in the browser so new tracks are added to their player queue automatically.

**Live app (after deploy):** `https://<your-github-user>.github.io/YTMQ/`

## Local development

1. Copy `.env.example` → `.env.local` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. `npm install`
3. `npm run dev` → open `http://localhost:5173/YTMQ/`

## Supabase setup (one-time)

1. Run migration `supabase/migrations/001_initial.sql` (SQL editor or CLI).
2. In **Database → Replication**, confirm `queue_items` is in the `supabase_realtime` publication.
3. Set YouTube API key for search:
   ```bash
   supabase secrets set YOUTUBE_API_KEY=your_google_api_key --project-ref owpmwxoqpzwbsrrcmvpz
   ```
4. Deploy edge functions:
   - `search` (under `supabase/functions/search/`) — YouTube Music search proxy.
   - `lyrics` (under `supabase/functions/lyrics/`) — multi-source lyrics aggregator (LRCLIB + NetEase Cloud Music + KuGou). Needed for synced lyrics on tracks LRCLIB doesn’t cover. No secrets required.

   ```bash
   supabase functions deploy lyrics --project-ref owpmwxoqpzwbsrrcmvpz
   ```

   If you don’t deploy `lyrics`, the app still works — it just falls back to LRCLIB-only coverage like before.

## GitHub Pages deploy

**One-time setup:**

1. In [Settings → Secrets and variables → Actions](https://github.com/T3lluz/YTMQ/settings/secrets/actions), add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. To run a workflow manually: **Actions → Deploy to GitHub Pages → Run workflow**, and choose branch **`main`** (not `gh-pages` — that branch has no workflow files).

3. Open [Settings → Pages](https://github.com/T3lluz/YTMQ/settings/pages). Under **Source**, pick **exactly one** (mixing both causes “in progress deployment” errors):
   - **GitHub Actions** (recommended) → push to `main` or run **Deploy to GitHub Pages**. Wait for `build` + `deploy`.
   - **Deploy from a branch** → **`gh-pages`** / **`(root)`** → run **Publish gh-pages branch** manually when you need an update (not on every `main` push).
   - **Never** use branch **`main`** (causes `GET /src/main.tsx 404`).

4. If **Deploy to GitHub Pages** fails with *“due to in progress deployment”*: wait a few minutes and **Re-run all jobs**, or cancel the stuck deployment under [Environments → github-pages](https://github.com/T3lluz/YTMQ/settings/environments).

5. If the site still loads `/src/main.tsx`, the wrong source is selected — fix step 3 and hard-refresh.

Live site: `https://t3lluz.github.io/YTMQ/` (includes `ytmusic-bridge.js` for host connect and `ytmq-extension.zip` for the Chrome extension).

Guest links and QR codes point at `/YTMQ/room/<id>`. GitHub Pages needs `public/404.html` (copied to `dist/404.html`) plus the redirect script in `index.html` so those deep links load the app instead of a static 404.

## Chrome extension (host auto-connect)

The `extension/` folder is a Manifest V3 Chrome extension that auto-injects the YTMQ bridge on **every** `music.youtube.com` tab — no Tampermonkey, no console pasting, and it survives reloads and browser restarts.

**Install (one time):**

1. Download `ytmq-extension.zip` from the deployed site (or run `npm run build` and grab `dist/ytmq-extension.zip`), unzip it somewhere permanent — or use the `extension/` folder of a checkout directly.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the folder.

**How it works:** the host clicks *Connect YouTube Music* in the lobby, which opens `music.youtube.com` with the room credentials in the URL. The extension's content script captures them (before YT Music strips the query string), stores the session (`chrome.storage.local` + `localStorage`, 7-day expiry), and the service worker injects the bundled `ytmusic-bridge.js` into the page's main world via `chrome.scripting`. Every later YT Music tab reconnects automatically from the stored session. The toolbar popup shows the linked room and offers a one-click **Disconnect** (stops the bridge in all YT Music tabs and clears the session).

`extension/ytmusic-bridge.js` is the same bundle built by `npm run build:bridge` (kept in sync by `scripts/copy-bridge-root.mjs`); `scripts/pack-extension.mjs` zips the extension into `dist/` on every build.

## E2E tests (Playwright)

Requires `.env.local` and a running or auto-started dev server. See [tests/README.md](tests/README.md).

```bash
npm run test:e2e          # all 21 tests
npx playwright test tests/queue.spec.ts   # one suite
```

## Smoke tests

- [ ] **Create lobby** → host view shows QR + guest link
- [ ] **Join** with 6-character code on another device
- [ ] **Search** → add 3 tracks → Queue tab updates within ~1s
- [ ] **Remove** and **reorder** (↑/↓) on Queue tab
- [ ] **Host** connects YouTube Music (console on music.youtube.com); guest add appears in YT Music queue
- [ ] **Host** “Open” opens `https://music.youtube.com/watch?v=…`
- [ ] Built bundle has no `YOUTUBE_API_KEY` or `service_role` (grep `dist/`)

## Architecture

See [docs/AGENT.md](docs/AGENT.md) for product scope, data model, and build order.
