# YTMQ

Shared queue for **YouTube Music**: host plays in the YT Music app; guests use this web app to search and manage the queue in realtime.

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

1. Repo **Settings → Pages → Build and deployment**: **GitHub Actions**.
2. Add repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push to `main` — workflow `.github/workflows/deploy.yml` builds and deploys.

## Smoke tests

- [ ] **Create lobby** → host view shows QR + guest link
- [ ] **Join** with 6-character code on another device
- [ ] **Search** → add 3 tracks → Queue tab updates within ~1s
- [ ] **Remove** and **reorder** (↑/↓) on Queue tab
- [ ] **Host** “Open” opens `https://music.youtube.com/watch?v=…`
- [ ] Built bundle has no `YOUTUBE_API_KEY` or `service_role` (grep `dist/`)

## Architecture

See [docs/AGENT.md](docs/AGENT.md) for product scope, data model, and build order.
