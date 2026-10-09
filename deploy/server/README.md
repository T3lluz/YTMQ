# YTMQ on t3lluz.com

The app runs at **https://t3lluz.com/ytmq/**, in any case: `/YTMQ`,
`/Ytmq/room/…` and so on redirect to the lowercase path. One container
does everything Supabase used to.

```
                 Cloudflare tunnel (cinema-tunnel)      tailnet (Caddy)
 public ──────── t3lluz.com/ytmq* ──────────┐   ┌────── t3lluz.com/ytmq* ── Fredde's devices
                                            ▼   ▼
 music.youtube.com (bridge) ── /ytmq/api ─► ytmq (Deno, server/main.ts) :8080
                                              app, API, WebSocket, search, lyrics
                                              SQLite in data/ytmq.db
```

## What the server does

- **Serves the app** under `/ytmq/`, built from `main` by `update.sh`.
  Hashed files in `/assets/` are cached for a year, everything else is
  revalidated on every load, so a deploy shows up on the next refresh.
  Unknown paths get `index.html` (client-side routes).
- **Rooms, queue, participants** in SQLite (`server/db.ts`), with the same
  RPC names and arguments the Postgres functions had.
- **Realtime** over one WebSocket per tab (`server/realtime.ts`):
  broadcasts for playback controls and now playing, and row changes for
  the queue, participants and room settings.
- **Search and lyrics** (`server/functions/`), formerly Supabase edge
  functions, now plain handlers in the same process.
- Purges expired rooms (24 h) every hour and whenever a room is created.

## Layout on the server

| | |
| --- | --- |
| `~/docker/ytmq/repo` | deploy checkout of `main` (do not work in it) |
| `~/docker/ytmq/build/current` | the live site, a symlink to `site-<sha>` |
| `~/docker/ytmq/data/ytmq.db` | the database |
| `~/docker/ytmq/amo.env` | Mozilla API key for signing the Firefox add-on (mode 600) |
| `~/docker/ytmq/firefox/` | signed Firefox builds, kept across deploys |
| `~/projects/ytmq` | the work clone |
| `~/docker/caddy/Caddyfile` | `handle /ytmq*` for the tailnet |
| `~/.config/systemd/user/ytmq-deploy.{service,timer}` | the deploy poller |

## Deploying

Push (or merge) to `main`. Within a minute `ytmq-deploy.timer` notices,
`update.sh` runs `npm ci` if the lockfile moved, builds the app, the bridge
and the extension zip, has Mozilla sign the Firefox build when the extension
changed, and swaps the build in. If `server/` changed it
restarts the container. A failed build leaves the last good one live and is
not retried until `main` moves again.

```bash
journalctl --user -u ytmq-deploy -n 50     # what the last deploys did
~/docker/ytmq/repo/deploy/server/update.sh --force   # rebuild now
docker logs -f ytmq                        # server log, incl. lyrics lookups
```

## Public route

`go-public.sh` adds `t3lluz.com/ytmq*` → `ytmq:8080` to the shared
`t3lluz-public` tunnel, in front of its catch-all 404, and checks it from
outside. It only swaps its own rule. `--remove` takes it out.

Cinema Info's `go-public.sh` rewrites the same tunnel's ingress. Run this
one again after it.

The container is on `cinema-info_edge` so the tunnel can reach it. That
network belongs to Cinema Info's compose project; `docker compose down` there
will refuse to remove it while ytmq is attached, which is fine.

## First-time setup (already done on t3lluz, 2026-10-09)

```bash
mkdir -p ~/docker/ytmq/{build,data}
git clone https://github.com/T3lluz/YTMQ.git ~/docker/ytmq/repo
~/docker/ytmq/repo/deploy/server/update.sh --force
cp ~/docker/ytmq/repo/deploy/server/systemd/ytmq-deploy.* ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now ytmq-deploy.timer
~/docker/ytmq/repo/deploy/server/go-public.sh
```

Plus, in `~/docker/caddy/Caddyfile` on the t3lluz.com site block:

```caddy
handle /ytmq* {
	reverse_proxy ytmq:8080
}
```

## Firefox signing

Release Firefox installs only add-ons Mozilla signed. `update.sh` runs
`scripts/sign-firefox.mjs`, which uploads a changed build to
addons.mozilla.org as an unlisted add-on (signed, never listed), waits for
the signature (usually a minute or two) and keeps the result in
`~/docker/ytmq/firefox/`. Unchanged builds reuse it. A signing failure never
fails the deploy; the last signed build stays up.

One-time: create an API key at
https://addons.mozilla.org/developers/addon/api/key/ and store it:

```bash
install -m 600 /dev/null ~/docker/ytmq/amo.env
printf 'AMO_JWT_ISSUER=%s\nAMO_JWT_SECRET=%s\n' 'user:…' '…' > ~/docker/ytmq/amo.env
~/docker/ytmq/repo/deploy/server/update.sh --force
```

## Backups

`data/ytmq.db` only holds lobbies, and those expire after a day. Nothing
else is stateful; a fresh checkout plus `update.sh --force` rebuilds it all.
