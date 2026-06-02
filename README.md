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
4. Deploy edge function `search` (included in repo under `supabase/functions/search/`).

## GitHub Pages deploy

**One-time setup:**

1. In [Settings → Secrets and variables → Actions](https://github.com/T3lluz/YTMQ/settings/secrets/actions), add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Push to `main` (or **Actions → Deploy to GitHub Pages → Run workflow**). Wait until all three jobs succeed: `build`, `deploy`, `publish-gh-pages-branch`.

3. Open [Settings → Pages](https://github.com/T3lluz/YTMQ/settings/pages). Under **Build and deployment → Source**, pick **one**:
   - **GitHub Actions** — appears after the first successful `deploy` job. Choose workflow **Deploy to GitHub Pages** if prompted.
   - **Deploy from a branch** → **`gh-pages`** → **`/ (root)`** — only listed after `publish-gh-pages-branch` has run once.
   - **Never** use branch **`main`** (causes `GET /src/main.tsx 404`).

4. If the site still loads `/src/main.tsx`, the wrong source is selected — switch as above and hard-refresh.

Live site: `https://t3lluz.github.io/YTMQ/` (includes `ytmusic-bridge.js` for host connect).

Guest links and QR codes point at `/YTMQ/room/<id>`. GitHub Pages needs `public/404.html` (copied to `dist/404.html`) plus the redirect script in `index.html` so those deep links load the app instead of a static 404.

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
