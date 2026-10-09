// The WebSocket hub that replaces Supabase Realtime.
//
// One socket per browser tab. A tab joins any number of channels; each join
// has its own ref, a topic (for broadcasts) and an optional list of table
// changes it wants for one room. Wire format, all JSON:
//
//   client -> server
//     { t: "join", ref, topic, changes?: [{ table, roomId }] }
//     { t: "leave", ref }
//     { t: "broadcast", topic, event, payload }
//     { t: "ping" }
//   server -> client
//     { t: "joined", ref }            { t: "error", ref?, message }
//     { t: "broadcast", topic, event, payload }
//     { t: "change", ref, table, eventType, new, old }
//     { t: "pong" }
//
// Broadcasts go to every other socket on the topic; the sending tab fans
// them out to its own channels itself (see src/lib/ytmqClient.ts).

import type { Change, Table } from "./db.ts";

const TABLES = new Set<Table>(["queue_items", "participants", "room_settings"]);
const MAX_SUBS_PER_SOCKET = 64;
const MAX_MESSAGE_BYTES = 64 * 1024;
const TOPIC_RE = /^[\w.-]{1,40}:[\w-]{1,64}$/;

type Sub = { topic: string; changes: { table: Table; roomId: string }[] };
type Client = { socket: WebSocket; subs: Map<string, Sub> };

export function createHub() {
  const clients = new Set<Client>();

  function send(client: Client, message: unknown) {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    try {
      client.socket.send(JSON.stringify(message));
    } catch {
      /* closing */
    }
  }

  function broadcast(topic: string, event: string, payload: unknown, from?: Client) {
    const message = { t: "broadcast", topic, event, payload };
    for (const client of clients) {
      if (client === from) continue;
      for (const sub of client.subs.values()) {
        if (sub.topic === topic) {
          send(client, message);
          break;
        }
      }
    }
  }

  function publishChange(change: Change) {
    for (const client of clients) {
      for (const [ref, sub] of client.subs) {
        if (sub.changes.some((c) => c.table === change.table && c.roomId === change.roomId)) {
          send(client, {
            t: "change",
            ref,
            table: change.table,
            eventType: change.eventType,
            new: change.new,
            old: change.old,
          });
        }
      }
    }
  }

  function onMessage(client: Client, raw: string) {
    if (raw.length > MAX_MESSAGE_BYTES) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const ref = typeof msg.ref === "string" ? msg.ref.slice(0, 40) : "";
    const topic = typeof msg.topic === "string" ? msg.topic : "";

    switch (msg.t) {
      case "ping":
        send(client, { t: "pong" });
        return;
      case "join": {
        if (!ref || !TOPIC_RE.test(topic)) {
          send(client, { t: "error", ref, message: "bad join" });
          return;
        }
        if (!client.subs.has(ref) && client.subs.size >= MAX_SUBS_PER_SOCKET) {
          send(client, { t: "error", ref, message: "too many channels" });
          return;
        }
        const changes = (Array.isArray(msg.changes) ? msg.changes : [])
          .filter((c): c is { table: Table; roomId: string } =>
            c && TABLES.has(c.table) && typeof c.roomId === "string" && c.roomId.length <= 64
          )
          .slice(0, 8)
          .map((c) => ({ table: c.table, roomId: c.roomId }));
        client.subs.set(ref, { topic, changes });
        send(client, { t: "joined", ref });
        return;
      }
      case "leave":
        client.subs.delete(ref);
        return;
      case "broadcast": {
        if (!TOPIC_RE.test(topic) || typeof msg.event !== "string") return;
        // Only members of a topic may talk on it, as with Supabase.
        if (![...client.subs.values()].some((s) => s.topic === topic)) return;
        broadcast(topic, msg.event.slice(0, 60), msg.payload, client);
        return;
      }
    }
  }

  function upgrade(req: Request): Response {
    const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: 60 });
    const client: Client = { socket, subs: new Map() };
    socket.onopen = () => clients.add(client);
    socket.onmessage = (e) => {
      if (typeof e.data === "string") onMessage(client, e.data);
    };
    socket.onclose = () => clients.delete(client);
    socket.onerror = () => clients.delete(client);
    return response;
  }

  /** HTTP fallback for a tab whose socket could not open in time. */
  function httpBroadcast(topic: string, event: string, payload: unknown): boolean {
    if (!TOPIC_RE.test(topic) || !event) return false;
    broadcast(topic, event.slice(0, 60), payload);
    return true;
  }

  return {
    upgrade,
    publishChange,
    httpBroadcast,
    stats: () => ({ sockets: clients.size }),
  };
}
