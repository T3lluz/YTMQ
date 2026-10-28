# AGENTS.md

## Cursor Cloud specific instructions

YTMQ is a single web app (no monorepo): a realtime shared **YouTube Music** queue. Stack: Vite 8 + React 19 + TypeScript + Tailwind 4 frontend, with a **remote/shared Supabase** backend (Postgres + Realtime + Deno edge functions). See `README.md` and `docs/AGENT.md` for product scope, and `tests/README.md` for the Playwright suite.

### Services & how to run them
- **Frontend dev server:** `npm run dev` → the app is served at `http://localhost:5173/YTMQ/`. The Vite `base` is `/YTMQ/`, so the bare `http://localhost:5173/` is not the app — always use the `/YTMQ/` path (and deep links like `/YTMQ/room/<id>`).
- **Backend:** there is **no local Supabase stack**. The app talks to the already-provisioned shared Supabase project `owpmwxoqpzwbsrrcmvpz` (tables `rooms`/`queue_items`/`participants`/`room_settings` and the `search` + `lyrics` edge functions are all live). Nothing to start locally.
- **Host YT Music bridge** (`ytmusic-bridge.js`) needs a real logged-in `music.youtube.com` browser session, so it can't be exercised headlessly — treat it as out of scope for automated/local testing.

### Environment (important gotcha)
- The app **throws at runtime** if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset (see `src/lib/supabase.ts`), so a `.env.local` must exist before `npm run dev`/tests.
- `.env.local` is **gitignored**. The startup update script recreates it (pointing at project `owpmwxoqpzwbsrrcmvpz`) when missing, so you normally don't need to touch it. The anon key is a public/publishable client key (it ships in the GitHub Pages bundle), so it is safe to have in `.env.local`.
- Despite `README.md` mentioning a `YOUTUBE_API_KEY` secret, the deployed `search` function uses a hardcoded YouTube Music Innertube key, so **search works with no extra secret**.

### Lint / build / test
- **Lint:** `npm run lint` — this repo currently has pre-existing lint errors, so a non-zero exit is expected and is not caused by your setup. Don't assume a clean baseline.
- **Build:** `npm run build` (runs `build:bridge` → `tsc -b` → `vite build`).
- **E2E:** `npm run test:e2e` (Playwright auto-starts the dev server; requires `.env.local`). E2E tests hit the live Supabase backend and real search results, so they depend on network + backend availability.
