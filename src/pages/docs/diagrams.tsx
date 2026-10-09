import { useState } from 'react'

/*
 * Diagrams for the docs, drawn as inline SVG so they stay sharp and cost no
 * requests. Colors: surfaces in neutral steps, the one accent for the path a
 * song takes, text in text tokens.
 */

const INK = '#f5f5f5'
const INK2 = '#a3a3a3'
const INK3 = '#737373'
const BOX = '#1a1a1a'
const LINE = '#404040'
const ACCENT = '#f5492f'

function Arrow({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1 1.5 8.5 5 1 8.5" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </marker>
  )
}

function Label({ x, y, children, size = 13, weight = 600, fill = INK, anchor = 'start' }: {
  x: number; y: number; children: string; size?: number; weight?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'
}) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} fontFamily="Figtree, system-ui, sans-serif">
      {children}
    </text>
  )
}

/** Phones, the server, the host's computer, and what flows between them. */
export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 760 360" className="w-full min-w-[620px]" role="img" aria-labelledby="arch-title arch-desc">
      <title id="arch-title">How YTMQ is put together</title>
      <desc id="arch-desc">
        Guests' phones talk to the YTMQ server on t3lluz.com over HTTPS and a WebSocket. The host's computer runs YouTube
        Music with the YTMQ extension, which also talks to the server. The server searches YouTube Music and looks up
        lyrics.
      </desc>
      <defs>
        <Arrow id="arch-a" color={ACCENT} />
        <Arrow id="arch-n" color={INK3} />
      </defs>

      {/* Guests */}
      <rect x="10" y="40" width="180" height="210" rx="18" fill={BOX} />
      <Label x={30} y={72} size={15} weight={800}>Guests</Label>
      <Label x={30} y={92} size={12} weight={500} fill={INK2}>any phone browser</Label>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${36 + i * 46} 118)`}>
          <rect width="34" height="62" rx="8" fill="#262626" />
          <rect x="4" y="8" width="26" height="40" rx="3" fill="#333" />
          <rect x="7" y="13" width="20" height="4" rx="2" fill={i === 1 ? ACCENT : '#555'} />
          <rect x="7" y="21" width="16" height="3" rx="1.5" fill="#555" />
          <rect x="7" y="28" width="18" height="3" rx="1.5" fill="#555" />
          <rect x="7" y="35" width="13" height="3" rx="1.5" fill="#555" />
        </g>
      ))}
      <Label x={30} y={214} size={12} weight={500} fill={INK2}>Search, add songs,</Label>
      <Label x={30} y={231} size={12} weight={500} fill={INK2}>lyrics, controls</Label>

      {/* Server */}
      <rect x="290" y="20" width="200" height="250" rx="18" fill={BOX} stroke={ACCENT} strokeOpacity="0.5" />
      <Label x={310} y={52} size={15} weight={800}>YTMQ server</Label>
      <Label x={310} y={72} size={12} weight={500} fill={INK2}>t3lluz.com/ytmq</Label>
      {[
        ['API', 'rooms, queue, people'],
        ['Realtime', 'one WebSocket per tab'],
        ['SQLite', 'one file, 24 h lobbies'],
        ['Search + lyrics', 'server side, no keys'],
      ].map(([a, b], i) => (
        <g key={a} transform={`translate(306 ${92 + i * 42})`}>
          <rect width="168" height="34" rx="10" fill="#242424" />
          <Label x={12} y={15} size={12} weight={700}>{a}</Label>
          <Label x={12} y={28} size={11} weight={500} fill={INK3}>{b}</Label>
        </g>
      ))}

      {/* Host */}
      <rect x="590" y="40" width="160" height="210" rx="18" fill={BOX} />
      <Label x={608} y={72} size={15} weight={800}>Host computer</Label>
      <Label x={608} y={92} size={12} weight={500} fill={INK2}>Chrome or Firefox</Label>
      <g transform="translate(606 110)">
        <rect width="128" height="54" rx="10" fill="#242424" />
        <circle cx="20" cy="27" r="10" fill="#FF0033" />
        <path d="M17.5 22.5v9l7-4.5z" fill="#fff" />
        <Label x={38} y={23} size={12} weight={700}>YouTube Music</Label>
        <Label x={38} y={38} size={11} weight={500} fill={INK3}>+ YTMQ extension</Label>
      </g>
      <g transform="translate(606 174)">
        <rect width="128" height="54" rx="10" fill="#242424" />
        <circle cx="20" cy="27" r="10" fill="#1ED760" />
        <Label x={38} y={23} size={12} weight={700}>Spotify</Label>
        <Label x={38} y={38} size={11} weight={500} fill={INK3}>optional</Label>
      </g>

      {/* Flows */}
      <path d="M196 120 H282" stroke={ACCENT} strokeWidth="2" markerEnd="url(#arch-a)" fill="none" />
      <Label x={239} y={112} size={11} weight={600} fill={INK2} anchor="middle">add song</Label>
      <path d="M284 160 H198" stroke={INK3} strokeWidth="2" markerEnd="url(#arch-n)" fill="none" />
      <Label x={239} y={178} size={11} weight={600} fill={INK2} anchor="middle">queue, now</Label>
      <Label x={239} y={192} size={11} weight={600} fill={INK2} anchor="middle">playing</Label>

      <path d="M496 128 H582" stroke={ACCENT} strokeWidth="2" markerEnd="url(#arch-a)" fill="none" />
      <Label x={539} y={120} size={11} weight={600} fill={INK2} anchor="middle">new song</Label>
      <path d="M584 168 H498" stroke={INK3} strokeWidth="2" markerEnd="url(#arch-n)" fill="none" />
      <Label x={539} y={186} size={11} weight={600} fill={INK2} anchor="middle">now playing</Label>

      {/* Outside services */}
      <path d="M390 276 V306" stroke={INK3} strokeWidth="1.5" strokeDasharray="0" markerEnd="url(#arch-n)" fill="none" />
      <rect x="210" y="310" width="360" height="40" rx="12" fill="none" stroke={LINE} />
      <Label x={390} y={335} size={12} weight={600} fill={INK2} anchor="middle">YouTube Music search · Musixmatch, LRCLIB, NetEase, KuGou</Label>
    </svg>
  )
}

/** What happens, in order, when a guest taps Play next. */
export function AddSongSequence() {
  const cols = [
    { x: 80, label: 'Guest phone' },
    { x: 290, label: 'YTMQ server' },
    { x: 500, label: 'Host tab (bridge)' },
    { x: 690, label: 'Other phones' },
  ]
  const msgs: { from: number; to: number; y: number; text: string; sub?: string; hot?: boolean; self?: boolean }[] = [
    { from: 0, to: 1, y: 96, text: 'POST /rooms/:id/queue', sub: 'video, title, Play next', hot: true },
    { from: 1, to: 1, y: 140, text: 'picks the position, saves the row', self: true },
    { from: 1, to: 2, y: 186, text: 'change: INSERT queue_items', hot: true },
    { from: 1, to: 3, y: 222, text: 'same change, same moment' },
    { from: 2, to: 2, y: 264, text: 'puts it in the YouTube Music queue', self: true },
    { from: 2, to: 1, y: 310, text: 'broadcast now_playing' },
    { from: 1, to: 0, y: 346, text: 'now_playing, to every phone' },
    { from: 2, to: 1, y: 392, text: 'DELETE /queue/:id once it starts' },
  ]
  return (
    <svg viewBox="0 0 780 430" className="w-full min-w-[640px]" role="img" aria-labelledby="seq-title">
      <title id="seq-title">Sequence: a guest adds a song and it plays in YouTube Music</title>
      <defs>
        <Arrow id="seq-a" color={ACCENT} />
        <Arrow id="seq-n" color={INK3} />
      </defs>
      {cols.map((c) => (
        <g key={c.label}>
          <rect x={c.x - 72} y="14" width="144" height="36" rx="10" fill={BOX} />
          <Label x={c.x} y={37} size={13} weight={700} anchor="middle">{c.label}</Label>
          <path d={`M${c.x} 52 V418`} stroke={LINE} strokeWidth="1" />
        </g>
      ))}
      {msgs.map((m, i) => {
        const x1 = cols[m.from].x
        const x2 = cols[m.to].x
        const color = m.hot ? ACCENT : INK3
        if (m.self) {
          return (
            <g key={i}>
              <path d={`M${x1} ${m.y - 12} h34 v22 h-30`} stroke={color} strokeWidth="1.8" fill="none" markerEnd={`url(#seq-${m.hot ? 'a' : 'n'})`} />
              <Label x={x1 + 42} y={m.y + 3} size={12} weight={600} fill={INK2}>{m.text}</Label>
            </g>
          )
        }
        const dir = x2 > x1 ? 1 : -1
        return (
          <g key={i}>
            <path d={`M${x1 + dir * 4} ${m.y} H${x2 - dir * 6}`} stroke={color} strokeWidth="2" fill="none" markerEnd={`url(#seq-${m.hot ? 'a' : 'n'})`} />
            <Label x={(x1 + x2) / 2} y={m.y - 8} size={12} weight={700} fill={m.hot ? INK : INK2} anchor="middle">{m.text}</Label>
            {m.sub && <Label x={(x1 + x2) / 2} y={m.y + 16} size={11} weight={500} fill={INK3} anchor="middle">{m.sub}</Label>}
          </g>
        )
      })}
    </svg>
  )
}

/** Where Play next and Add to queue put a song. */
export function QueueOrderDiagram() {
  const rows = [
    { pos: '−1', title: 'Play next pick', tag: 'Play next', hot: true },
    { pos: '0', title: 'Song already queued' },
    { pos: '1', title: 'Song already queued' },
    { pos: '2', title: 'Song already queued' },
    { pos: '3', title: 'Add to queue pick', tag: 'Queue', hot: true },
  ]
  return (
    <svg viewBox="0 0 620 300" className="w-full min-w-[520px]" role="img" aria-labelledby="order-title">
      <title id="order-title">Play next goes above the current top of the queue, Add to queue goes after the last song</title>
      <defs>
        <Arrow id="ord-a" color={ACCENT} />
      </defs>
      <Label x={40} y={22} size={11} weight={700} fill={INK3}>POSITION</Label>
      <Label x={110} y={22} size={11} weight={700} fill={INK3}>SHARED QUEUE (plays top to bottom)</Label>
      {rows.map((r, i) => {
        const y = 36 + i * 50
        return (
          <g key={i}>
            <Label x={58} y={y + 26} size={14} weight={700} fill={r.hot ? INK : INK3} anchor="middle">{r.pos}</Label>
            <rect x="100" y={y} width="300" height="40" rx="10" fill={r.hot ? 'rgba(245,73,47,0.14)' : BOX} stroke={r.hot ? ACCENT : 'none'} strokeOpacity="0.6" />
            <rect x="110" y={y + 8} width="24" height="24" rx="5" fill={r.hot ? ACCENT : '#333'} />
            <Label x={146} y={y + 25} size={13} weight={r.hot ? 700 : 500} fill={r.hot ? INK : INK2}>{r.title}</Label>
          </g>
        )
      })}
      <path d="M560 56 C 520 56, 470 56, 408 56" stroke={ACCENT} strokeWidth="2" fill="none" markerEnd="url(#ord-a)" />
      <Label x={572} y={52} size={12} weight={700}>Play next</Label>
      <Label x={572} y={68} size={11} weight={500} fill={INK2}>lowest − 1</Label>
      <path d="M560 256 C 520 256, 470 256, 408 256" stroke={ACCENT} strokeWidth="2" fill="none" markerEnd="url(#ord-a)" />
      <Label x={572} y={252} size={12} weight={700}>Add to queue</Label>
      <Label x={572} y={268} size={11} weight={500} fill={INK2}>highest + 1</Label>
    </svg>
  )
}

/** How a lyrics lookup picks its source. */
export function LyricsChain() {
  const tiers = [
    { n: '1', title: 'Musixmatch first', text: 'Synced lyrics from it win straight away.' },
    { n: '2', title: 'Then the first synced result', text: 'LRCLIB, NetEase and KuGou were asked at the same time. The first one with synced lyrics wins.' },
    { n: '3', title: 'Then the best plain text', text: 'No timing anywhere: the best plain or instrumental match, scored on title, artist and length.' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiers.map((t, i) => (
        <div key={t.n} className="relative rounded-xl bg-white/[0.04] p-4">
          <span className="font-mono text-xs font-semibold text-accent-400">0{t.n}</span>
          <p className="mt-1 font-bold text-white">{t.title}</p>
          <p className="mt-1 text-sm leading-6 text-neutral-400">{t.text}</p>
          {i < tiers.length - 1 && (
            <span className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 sm:flex" aria-hidden>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="m8 5 5 5-5 5" />
              </svg>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const TIMINGS: { label: string; seconds: number; shown: string; meaning: string }[] = [
  { label: 'Presence heartbeat', seconds: 20, shown: '20 s', meaning: 'Each open lobby tab tells the server it is still there.' },
  { label: 'Now playing goes stale', seconds: 30, shown: '30 s', meaning: 'No update from the player for this long and phones show it as idle.' },
  { label: 'Counted as listening', seconds: 45, shown: '45 s', meaning: 'Someone seen within this window counts in "listening".' },
  { label: 'Extension update check', seconds: 30 * 60, shown: '30 min', meaning: 'How often the extension looks for a newer build.' },
  { label: 'Lobby lifetime', seconds: 24 * 3600, shown: '24 h', meaning: 'After this the lobby, its queue and its guest list are deleted.' },
  { label: 'Extension remembers the lobby', seconds: 7 * 24 * 3600, shown: '7 days', meaning: 'How long a linked lobby stays stored in the browser.' },
]

const TICKS: [number, string][] = [
  [10, '10 s'],
  [60, '1 min'],
  [600, '10 min'],
  [3600, '1 h'],
  [86400, '1 day'],
  [604800, '1 wk'],
]

/** Every timer that shapes how a lobby behaves, on one log scale. */
export function TimingsChart() {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const left = 210
  const right = 60
  const rowH = 40
  const top = 16
  const H = top + TIMINGS.length * rowH + 34
  const lo = Math.log10(10)
  const hi = Math.log10(604800)
  const x = (s: number) => left + ((Math.log10(s) - lo) / (hi - lo)) * (W - left - right)
  const bar = 18

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-labelledby="timings-title">
        <title id="timings-title">How long things last in YTMQ, on a logarithmic scale from 10 seconds to a week</title>
        {TICKS.map(([s, t]) => (
          <g key={t}>
            <line x1={x(s)} x2={x(s)} y1={top - 6} y2={H - 28} stroke="#262626" strokeWidth="1" />
            <Label x={x(s)} y={H - 10} size={11} weight={500} fill={INK3} anchor="middle">{t}</Label>
          </g>
        ))}
        {TIMINGS.map((t, i) => {
          const y = top + i * rowH + (rowH - bar) / 2
          const w = x(t.seconds) - x(10)
          const on = hover === i
          return (
            <g
              key={t.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              style={{ outline: 'none', cursor: 'default' }}
            >
              <rect x="0" y={top + i * rowH} width={W} height={rowH} fill={on ? 'rgba(255,255,255,0.03)' : 'transparent'} />
              <Label x={left - 14} y={y + 13} size={13} weight={600} fill={on ? INK : INK2} anchor="end">{t.label}</Label>
              <path
                d={`M${x(10)} ${y} H${x(10) + w - 4} a4 4 0 0 1 4 4 V${y + bar - 4} a4 4 0 0 1 -4 4 H${x(10)} Z`}
                fill={ACCENT}
                opacity={hover == null || on ? 1 : 0.45}
              />
              <Label x={x(10) + w + 8} y={y + 13} size={12} weight={700} fill={INK}>{t.shown}</Label>
            </g>
          )
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute left-1/2 z-10 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-sm shadow-xl"
          style={{ top: `${((top + hover * rowH + rowH) / H) * 100}%` }}
          role="status"
        >
          <p className="font-bold text-white">
            {TIMINGS[hover].label} · {TIMINGS[hover].shown}
          </p>
          <p className="mt-0.5 text-neutral-400">{TIMINGS[hover].meaning}</p>
        </div>
      )}
      <details className="mt-3 text-sm text-neutral-400">
        <summary className="cursor-pointer font-semibold text-neutral-300">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <tbody className="divide-y divide-white/[0.06]">
            {TIMINGS.map((t) => (
              <tr key={t.label}>
                <td className="py-2 pr-3 font-semibold text-neutral-200">{t.label}</td>
                <td className="py-2 pr-3 font-mono text-neutral-200">{t.shown}</td>
                <td className="py-2">{t.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
