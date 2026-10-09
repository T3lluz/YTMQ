import { useEffect, useState, type ReactNode } from 'react'
import { B, Callout, Code, CodeBlock, H2, H3, Lead, P, Table } from '../ui'

const BASE = 'https://t3lluz.com/ytmq/api'

function useHealth() {
  const [health, setHealth] = useState<{ ok: boolean; sockets?: number } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch(`${import.meta.env.BASE_URL}api/health`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => !cancelled && (setHealth(d), setFailed(false)))
        .catch(() => !cancelled && setFailed(true))
    void load()
    const t = window.setInterval(load, 15000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])
  return { health, failed }
}

function Status() {
  const { health, failed } = useHealth()
  const up = health?.ok && !failed
  return (
    <div className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-white/[0.05] px-4 py-2 text-sm" role="status">
      <span className={`h-2 w-2 rounded-full ${up ? 'bg-emerald-400' : failed ? 'bg-accent-500' : 'bg-neutral-500'}`} />
      <span className="font-semibold text-white">{up ? 'API is up' : failed ? 'API unreachable' : 'Checking the API…'}</span>
      {up && typeof health?.sockets === 'number' && (
        <span className="text-neutral-400">
          · {health.sockets} live {health.sockets === 1 ? 'connection' : 'connections'} right now
        </span>
      )}
    </div>
  )
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-300',
  POST: 'bg-sky-500/15 text-sky-300',
  DELETE: 'bg-accent-500/15 text-accent-300',
  WS: 'bg-amber-500/15 text-amber-200',
}

function Endpoint({ method, path, children }: { method: string; path: string; children: ReactNode }) {
  const id = `${method}-${path}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <section id={id} className="mt-6 scroll-mt-24 rounded-2xl border border-white/[0.07] p-5">
      <p className="flex flex-wrap items-center gap-2.5">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${METHOD_COLORS[method] ?? ''}`}>{method}</span>
        <span className="font-mono text-[15px] font-medium text-white">{path}</span>
      </p>
      <div className="mt-2 text-[15px] leading-7 text-neutral-300 [&>p]:mt-2">{children}</div>
    </section>
  )
}

export default function Api() {
  return (
    <>
      <Lead>
        Everything the app does goes through this API, so anything it does you can do too. JSON in,
        JSON out, no keys. CORS is open.
      </Lead>
      <Status />

      <H2>Basics</H2>
      <Table
        head={['', '']}
        rows={[
          ['Base URL', <Code>{BASE}</Code>],
          ['Realtime', <Code>wss://t3lluz.com/ytmq/api/realtime</Code>],
          ['Auth', <>None for reading and adding. Host-only calls take the lobby&apos;s <Code>host_token</Code>.</>],
          ['Errors', <>Non-2xx with <Code>{'{ "error": "…", "code": "…" }'}</Code></>],
          ['Lifetime', 'Lobbies, their queue and people are deleted 24 hours after creation.'],
        ]}
      />
      <Callout tone="note" title="Ids">
        <p>
          A lobby has a <B>room id</B> (a UUID, used in every call and in links) and a <B>code</B> (six
          hex characters people type). <Code>join_room</Code> turns a code into a room id.
        </p>
      </Callout>

      <H2>Quick start</H2>
      <CodeBlock lang="bash" title="Create a lobby, add a song, read the queue">{`
API=${BASE}

# 1. Create a lobby. Keep host_token secret; it is the admin key.
curl -s -X POST $API/rpc/create_room
# {"room_id":"8c76ae73-…","code":"0804F9","host_token":"…"}

# 2. Add a song to the top of the queue.
curl -s -X POST $API/rooms/8c76ae73-…/queue \\
  -H 'content-type: application/json' \\
  -d '{"video_id":"dQw4w9WgXcQ","title":"Never Gonna Give You Up",
       "channel_title":"Rick Astley","added_by":"Curl","insert_mode":"play_next"}'

# 3. Read it back, in play order.
curl -s $API/rooms/8c76ae73-…/queue
`}</CodeBlock>

      <H2>RPCs</H2>
      <P>
        <Code>POST /rpc/&lt;name&gt;</Code> with a JSON body of <Code>p_</Code>-prefixed arguments. The
        names and arguments match the Postgres functions YTMQ started with.
      </P>
      <Table
        head={['Name', 'Arguments', 'Returns']}
        rows={[
          [<Code>create_room</Code>, '–', <Code>{'{ room_id, code, host_token }'}</Code>],
          [<Code>join_room</Code>, <>p_code, p_password?</>, <><Code>{'{ room_id, code }'}</Code>, <Code>{'{ error: "locked" | "password" }'}</Code> or null</>],
          [<Code>get_room</Code>, 'p_room_id', <>room id, code, created_at, expires_at and the five settings, or null</>],
          [<Code>verify_room_password</Code>, 'p_room_id, p_password', 'boolean'],
          [<Code>set_room_settings</Code>, <>p_room_id, p_host_token, p_locked?, p_allow_guest_add?, p_allow_guest_remove?, p_allow_guest_controls?</>, 'boolean'],
          [<Code>set_room_password</Code>, <>p_room_id, p_host_token, p_password (empty clears it)</>, 'boolean'],
          [<Code>end_room</Code>, 'p_room_id, p_host_token', 'boolean'],
          [<Code>touch_participant</Code>, 'p_room_id, p_client_id, p_nickname?', <><Code>"ok"</Code>, <Code>"kicked"</Code>, <Code>"locked"</Code> or <Code>"inactive"</Code></>],
          [<Code>kick_participant</Code>, 'p_room_id, p_host_token, p_client_id', 'boolean'],
          [<Code>kick_by_nickname</Code>, 'p_room_id, p_host_token, p_nickname', 'number removed'],
          [<Code>leave_participant</Code>, 'p_room_id, p_client_id', 'true'],
        ]}
      />
      <P>
        <Code>touch_participant</Code> is the presence heartbeat; the app calls it every 20 seconds.
        Someone counts as listening for 45 seconds after their last one.
      </P>

      <H2>Queue</H2>
      <Endpoint method="GET" path="/rooms/:roomId/queue">
        <p>The queue in play order. An ended lobby returns an empty list.</p>
      </Endpoint>
      <Endpoint method="POST" path="/rooms/:roomId/queue">
        <p>
          Adds a song and returns the new row with <B>201</B>. Body: <Code>video_id</Code> and{' '}
          <Code>title</Code> (required), <Code>channel_title</Code>, <Code>thumbnail_url</Code>,{' '}
          <Code>added_by</Code>, <Code>insert_mode</Code> (<Code>play_next</Code> by default, or{' '}
          <Code>queue</Code>), and <Code>host_token</Code> to add while guest adding is off.
        </p>
        <p>
          Errors: <Code>404 room_inactive</Code>, <Code>403 add_disabled</Code>, <Code>400</Code> for a
          missing field.
        </p>
      </Endpoint>
      <Endpoint method="DELETE" path="/queue/:itemId">
        <p>
          Removes a row; returns <Code>{'{ "deleted": true }'}</Code>. The app hides Remove from
          guests when the host turns it off, but the server does not check, so treat a room id as
          something you share with people you trust.
        </p>
      </Endpoint>
      <CodeBlock lang="json" title="A queue row">{`
{
  "id": "5b0c…",
  "room_id": "8c76ae73-…",
  "position": -1,
  "video_id": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "channel_title": "Rick Astley",
  "thumbnail_url": "",
  "added_by": "Curl",
  "insert_mode": "play_next",
  "created_at": "2026-10-09T21:14:03.120Z"
}
`}</CodeBlock>

      <H2>People</H2>
      <Endpoint method="GET" path="/rooms/:roomId/participants">
        <p>
          Everyone not kicked, most recently seen first: <Code>room_id</Code>, <Code>client_id</Code>,{' '}
          <Code>nickname</Code>, <Code>last_seen</Code>, <Code>kicked</Code>.
        </p>
      </Endpoint>
      <Endpoint method="GET" path="/rooms/:roomId/counts">
        <p>
          <Code>{'{ "queue": 6, "participants": 4 }'}</Code>. Cheap enough to poll.
        </p>
      </Endpoint>

      <H2>Search and lyrics</H2>
      <Endpoint method="POST" path="/functions/search">
        <p>
          Body <Code>{'{ q, type, limit? }'}</Code> with type <Code>all</Code>, <Code>song</Code> or{' '}
          <Code>artist</Code>. For an artist&apos;s songs use <Code>{'{ type: "channel_tracks", channelId }'}</Code>{' '}
          with the artist&apos;s id. Returns <Code>{'{ results: [{ id, title, channelTitle, thumbnail, type, subtitle }] }'}</Code>.
          Queries shorter than two characters return nothing.
        </p>
      </Endpoint>
      <Endpoint method="POST" path="/functions/lyrics">
        <p>
          Body <Code>{'{ title, artist?, album?, duration? }'}</Code>, optionally <Code>sources</Code> as a
          comma list of <Code>musixmatch,lrclib,netease,kugou</Code>. Returns{' '}
          <Code>{'{ lyrics: { source, syncedLrc, plain, instrumental, trackName, artistName, duration } }'}</Code>{' '}
          or <Code>{'{ lyrics: null }'}</Code>. <Code>syncedLrc</Code> is standard LRC text.
        </p>
      </Endpoint>
      <Endpoint method="GET" path="/health">
        <p>
          <Code>{'{ "ok": true, "sockets": 12 }'}</Code>, the number of open realtime connections. The
          status line at the top of this page reads it.
        </p>
      </Endpoint>

      <H2>Realtime</H2>
      <P>
        One WebSocket carries any number of channels. Each channel has a <B>topic</B> for broadcasts and
        can ask for table changes in one lobby. All messages are JSON with a <Code>t</Code> field.
      </P>
      <Table
        head={['Direction', 'Message']}
        rows={[
          ['→ server', <Code>{'{ t: "join", ref, topic, changes?: [{ table, roomId }] }'}</Code>],
          ['→ server', <Code>{'{ t: "leave", ref }'}</Code>],
          ['→ server', <Code>{'{ t: "broadcast", topic, event, payload }'}</Code>],
          ['→ server', <Code>{'{ t: "ping" }'}</Code>],
          ['← client', <Code>{'{ t: "joined", ref }'}</Code>],
          ['← client', <Code>{'{ t: "change", ref, table, eventType, new, old }'}</Code>],
          ['← client', <Code>{'{ t: "broadcast", topic, event, payload }'}</Code>],
          ['← client', <><Code>{'{ t: "pong" }'}</Code>, <Code>{'{ t: "error", ref?, message }'}</Code></>],
        ]}
      />
      <H3>Topics and events</H3>
      <Table
        head={['Topic', 'Event', 'Payload']}
        rows={[
          [<Code>ytmq-playback:&lt;roomId&gt;</Code>, <Code>now_playing</Code>, <>videoId, title, artist, state, currentTime, duration, volume, nextUp, source, thumbnailUrl, updatedAt</>],
          [<Code>ytmq-bridge:&lt;roomId&gt;</Code>, <Code>playback_control</Code>, <><Code>action</Code>: next, prev, play, pause, toggle, seek (with <Code>position</Code>) or volume (with <Code>volume</Code>)</>],
          [<Code>ytmq-bridge:&lt;roomId&gt;</Code>, <Code>queue_remove</Code>, <>id, video_id, title</>],
        ]}
      />
      <P>
        Tables you can follow: <Code>queue_items</Code>, <Code>participants</Code> and{' '}
        <Code>room_settings</Code>. Broadcasts reach everyone on the topic except the sender, and only
        a socket that joined a topic may broadcast on it. Limits: 64 channels per socket, 64 KB per
        message, and the server drops a socket idle for 60 seconds, so ping every 25.
      </P>
      <CodeBlock lang="js" title="Follow a lobby from a browser console">{`
const room = '8c76ae73-…'
const ws = new WebSocket('wss://t3lluz.com/ytmq/api/realtime')
ws.onopen = () => {
  ws.send(JSON.stringify({ t: 'join', ref: 'np', topic: 'ytmq-playback:' + room }))
  ws.send(JSON.stringify({
    t: 'join', ref: 'q', topic: 'queue:' + room,
    changes: [{ table: 'queue_items', roomId: room }],
  }))
  setInterval(() => ws.send('{"t":"ping"}'), 25000)
}
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.t === 'broadcast' && m.event === 'now_playing') console.log('▶', m.payload.title)
  if (m.t === 'change') console.log(m.eventType, m.new?.title ?? m.old?.title)
}
`}</CodeBlock>
      <P>
        <Code>POST /broadcast</Code> with <Code>{'{ topic, event, payload }'}</Code> sends a broadcast
        over HTTP when a socket is not open yet.
      </P>
    </>
  )
}
