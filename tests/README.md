# YTMQ Playwright tests

End-to-end tests against the Vite dev server with a live Supabase backend.

## Prerequisites

- `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Dev server on `http://localhost:5173/YTMQ/` (started automatically, or reuse an existing `npm run dev`)
- Supabase `search` edge function deployed with `YOUTUBE_API_KEY` secret

## Run

```bash
# All tests (21)
npm run test:e2e

# Interactive UI
npm run test:e2e:ui

# Headed browser
npm run test:e2e:headed

# Single file
npx playwright test tests/queue.spec.ts

# Single test
npx playwright test tests/join.spec.ts -g "joins a valid"

# HTML report
npm run test:e2e:report
```

## Layout

| File | Coverage |
|------|----------|
| `home.spec.ts` | Landing, create lobby |
| `join.spec.ts` | Join form validation & success |
| `search.spec.ts` | Song/artist search, artist tracks |
| `queue.spec.ts` | Add, remove, reorder |
| `room-tab.spec.ts` | QR, copy link, nickname |
| `host.spec.ts` | Host mirror, YT Music links, realtime |
| `full-flow.spec.ts` | Full host+guest journey + API sync |
| `helpers/` | Supabase API + UI navigation (`gotoApp` for `/YTMQ/` base) |
