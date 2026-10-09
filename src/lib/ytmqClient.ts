/**
 * Client for the YTMQ server (server/main.ts). Shared by the app and the
 * YouTube Music bridge, so it takes its base URL instead of reading env.
 *
 * Realtime keeps the shape supabase-js had, because the hooks and the
 * bridge were written against it: `channel(topic).on(...).subscribe(cb)`,
 * statuses SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT, `send`, `httpSend` and
 * `removeChannel`. All channels of one client share one WebSocket, which
 * reconnects by itself and rejoins every channel (reporting SUBSCRIBED again).
 */

export type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
export type ChangeType = 'INSERT' | 'UPDATE' | 'DELETE'
export type ChangeTable = 'queue_items' | 'participants' | 'room_settings'

export type ChangePayload<T = Record<string, unknown>> = {
  eventType: ChangeType
  table: ChangeTable
  new: T | null
  old: T | null
}

type ChangeFilter = { event: ChangeType | '*'; table: ChangeTable; roomId: string }
type BroadcastHandler = (message: { event: string; payload: unknown }) => void
type ChangeHandler = (payload: ChangePayload) => void

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status: number, code = '') {
    super(message)
    this.status = status
    this.code = code
  }
}

const JOIN_TIMEOUT_MS = 10_000
const PING_MS = 25_000
const PONG_TIMEOUT_MS = 10_000

export class RealtimeChannel {
  readonly topic: string
  readonly ref: string
  readonly self: boolean
  readonly broadcastHandlers: { event: string; handler: BroadcastHandler }[] = []
  readonly changeHandlers: { filter: ChangeFilter; handler: ChangeHandler }[] = []
  statusCallback: ((status: ChannelStatus) => void) | null = null
  joined = false
  subscribed = false
  joinTimer: ReturnType<typeof setTimeout> | undefined
  private readonly realtime: Realtime

  constructor(realtime: Realtime, topic: string, ref: string, self: boolean) {
    this.realtime = realtime
    this.topic = topic
    this.ref = ref
    this.self = self
  }

  on(
    type: 'broadcast',
    filter: { event: string },
    handler: BroadcastHandler,
  ): this
  on<T = Record<string, unknown>>(
    type: 'changes',
    filter: ChangeFilter,
    handler: (payload: ChangePayload<T>) => void,
  ): this
  on(
    type: 'broadcast' | 'changes',
    filter: { event: string } | ChangeFilter,
    handler: BroadcastHandler | ChangeHandler,
  ): this {
    if (type === 'broadcast') {
      this.broadcastHandlers.push({
        event: filter.event,
        handler: handler as BroadcastHandler,
      })
    } else {
      this.changeHandlers.push({
        filter: filter as ChangeFilter,
        handler: handler as ChangeHandler,
      })
    }
    return this
  }

  subscribe(callback?: (status: ChannelStatus) => void): this {
    this.statusCallback = callback ?? null
    this.subscribed = true
    this.realtime.join(this)
    return this
  }

  /** Same shape as supabase-js: `{ type: 'broadcast', event, payload }`. */
  async send(message: { type: 'broadcast'; event: string; payload: unknown }) {
    this.realtime.broadcast(this, message.event, message.payload)
    return 'ok' as const
  }

  /** Broadcast over HTTP, for when the socket is not up. */
  async httpSend(event: string, payload: unknown) {
    await this.realtime.httpBroadcast(this, event, payload)
  }
}

class Realtime {
  private readonly url: string
  private readonly api: Api
  private socket: WebSocket | null = null
  private readonly channels = new Map<string, RealtimeChannel>()
  private nextRef = 1
  private retry = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private pongTimer: ReturnType<typeof setTimeout> | undefined

  constructor(url: string, api: Api) {
    this.url = url
    this.api = api
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.channels.size > 0) {
          this.connectNow()
        }
      })
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.channels.size > 0) this.connectNow()
      })
    }
  }

  channel(topic: string, opts?: { config?: { broadcast?: { self?: boolean } } }) {
    const ref = String(this.nextRef++)
    return new RealtimeChannel(this, topic, ref, opts?.config?.broadcast?.self === true)
  }

  join(channel: RealtimeChannel) {
    this.channels.set(channel.ref, channel)
    clearTimeout(channel.joinTimer)
    channel.joinTimer = setTimeout(() => {
      if (!channel.joined && this.channels.has(channel.ref)) {
        channel.statusCallback?.('TIMED_OUT')
      }
    }, JOIN_TIMEOUT_MS)
    if (this.socket?.readyState === WebSocket.OPEN) this.sendJoin(channel)
    else this.connect()
  }

  remove(channel: RealtimeChannel) {
    clearTimeout(channel.joinTimer)
    channel.subscribed = false
    channel.joined = false
    if (!this.channels.delete(channel.ref)) return
    this.write({ t: 'leave', ref: channel.ref })
    if (this.channels.size === 0) this.disconnect()
  }

  removeAll() {
    for (const channel of [...this.channels.values()]) this.remove(channel)
  }

  broadcast(from: RealtimeChannel, event: string, payload: unknown) {
    // Other channels of this tab on the same topic hear it here; the server
    // only relays to other sockets.
    for (const channel of this.channels.values()) {
      if (channel.topic !== from.topic) continue
      if (channel === from && !from.self) continue
      deliverBroadcast(channel, event, payload)
    }
    if (!this.write({ t: 'broadcast', topic: from.topic, event, payload })) {
      void this.httpBroadcast(from, event, payload, false)
    }
  }

  async httpBroadcast(
    from: RealtimeChannel,
    event: string,
    payload: unknown,
    local = true,
  ) {
    if (local) {
      for (const channel of this.channels.values()) {
        if (channel.topic === from.topic && (channel !== from || from.self)) {
          deliverBroadcast(channel, event, payload)
        }
      }
    }
    await this.api.post('/broadcast', { topic: from.topic, event, payload })
  }

  private write(message: unknown): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false
    try {
      this.socket.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  private sendJoin(channel: RealtimeChannel) {
    const changes = channel.changeHandlers.map(({ filter }) => ({
      table: filter.table,
      roomId: filter.roomId,
    }))
    this.write({ t: 'join', ref: channel.ref, topic: channel.topic, changes })
  }

  private connectNow() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.retry = 0
    this.connect()
  }

  private connect() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return
    if (this.reconnectTimer !== undefined) return
    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      this.retry = 0
      for (const channel of this.channels.values()) this.sendJoin(channel)
      clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => this.ping(), PING_MS)
    }
    socket.onmessage = (event) => this.onMessage(event.data)
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      clearInterval(this.pingTimer)
      clearTimeout(this.pongTimer)
      for (const channel of this.channels.values()) {
        if (channel.joined) {
          channel.joined = false
          channel.statusCallback?.('CHANNEL_ERROR')
        }
      }
      if (this.channels.size > 0) this.scheduleReconnect()
    }
  }

  private ping() {
    if (!this.write({ t: 'ping' })) return
    clearTimeout(this.pongTimer)
    this.pongTimer = setTimeout(() => this.socket?.close(), PONG_TIMEOUT_MS)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== undefined) return
    const delay = Math.min(10_000, 500 * 2 ** this.retry) + Math.random() * 300
    this.retry += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, delay)
  }

  private disconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    clearInterval(this.pingTimer)
    clearTimeout(this.pongTimer)
    const socket = this.socket
    this.socket = null
    socket?.close()
  }

  private onMessage(raw: unknown) {
    if (typeof raw !== 'string') return
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    switch (msg.t) {
      case 'pong':
        clearTimeout(this.pongTimer)
        return
      case 'joined': {
        const channel = this.channels.get(String(msg.ref))
        if (!channel) return
        clearTimeout(channel.joinTimer)
        channel.joined = true
        channel.statusCallback?.('SUBSCRIBED')
        return
      }
      case 'error': {
        const channel = this.channels.get(String(msg.ref ?? ''))
        channel?.statusCallback?.('CHANNEL_ERROR')
        return
      }
      case 'broadcast':
        for (const channel of this.channels.values()) {
          if (channel.topic === msg.topic) {
            deliverBroadcast(channel, String(msg.event), msg.payload)
          }
        }
        return
      case 'change': {
        const channel = this.channels.get(String(msg.ref))
        if (!channel) return
        const payload: ChangePayload = {
          eventType: msg.eventType as ChangeType,
          table: msg.table as ChangeTable,
          new: (msg.new as Record<string, unknown> | null) ?? null,
          old: (msg.old as Record<string, unknown> | null) ?? null,
        }
        for (const { filter, handler } of channel.changeHandlers) {
          if (filter.table !== payload.table) continue
          if (filter.event !== '*' && filter.event !== payload.eventType) continue
          try {
            handler(payload)
          } catch (err) {
            console.error('[YTMQ] change handler failed', err)
          }
        }
        return
      }
    }
  }
}

function deliverBroadcast(channel: RealtimeChannel, event: string, payload: unknown) {
  for (const { event: wanted, handler } of channel.broadcastHandlers) {
    if (wanted !== event) continue
    try {
      handler({ event, payload })
    } catch (err) {
      console.error('[YTMQ] broadcast handler failed', err)
    }
  }
}

class Api {
  readonly base: string
  constructor(base: string) {
    this.base = base
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    if (!res.ok) {
      const err = (data ?? {}) as { error?: string; code?: string }
      throw new ApiError(err.error || `YTMQ server answered ${res.status}`, res.status, err.code)
    }
    return data as T
  }

  get<T>(path: string) {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body: unknown = {}) {
    return this.request<T>('POST', path, body)
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path)
  }
}

export function createYtmqClient(apiUrl: string) {
  const base = apiUrl.replace(/\/$/, '')
  const api = new Api(base)
  const wsUrl = new URL(`${base}/realtime`, typeof location !== 'undefined' ? location.href : undefined)
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const realtime = new Realtime(wsUrl.href, api)

  return {
    apiUrl: base,
    /** Call a room/participant function by its old Postgres RPC name. */
    rpc<T = unknown>(name: string, args: Record<string, unknown> = {}) {
      return api.post<T>(`/rpc/${name}`, args)
    },
    /** Call the search or lyrics function. */
    invoke<T = unknown>(name: 'search' | 'lyrics', body: unknown, signal?: AbortSignal) {
      return fetch(`${base}/functions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }).then(async (res) => {
        const data = (await res.json().catch(() => null)) as T | null
        if (!res.ok && !data) throw new ApiError(`${name} failed (${res.status})`, res.status)
        return data as T
      })
    },
    get: api.get.bind(api),
    post: api.post.bind(api),
    delete: api.delete.bind(api),
    channel: realtime.channel.bind(realtime),
    async removeChannel(channel: RealtimeChannel) {
      realtime.remove(channel)
    },
    removeAllChannels: () => realtime.removeAll(),
  }
}

export type YtmqClient = ReturnType<typeof createYtmqClient>
