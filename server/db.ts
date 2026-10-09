// Rooms, the shared queue and participants, in one SQLite file.
//
// This replaces the Supabase schema (the old supabase/migrations) one for
// one: the same tables, the same RPC names and arguments, the same return
// shapes. Rooms are never readable by clients; everything that touches
// host_token or password_hash goes through the functions below.
//
// Every write that clients used to see over Supabase Realtime calls
// `emit`, which main.ts wires to the WebSocket hub.

import { DatabaseSync } from "node:sqlite";

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 210_000;

export type Table = "queue_items" | "participants" | "room_settings";
export type ChangeType = "INSERT" | "UPDATE" | "DELETE";
export type Change = {
  table: Table;
  roomId: string;
  eventType: ChangeType;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export type QueueRow = {
  id: string;
  room_id: string;
  position: number;
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  added_by: string;
  insert_mode: "play_next" | "queue";
  created_at: string;
};

type RoomRow = {
  id: string;
  code: string;
  host_token: string;
  password_hash: string | null;
  locked: number;
  allow_guest_add: number;
  allow_guest_remove: number;
  allow_guest_controls: number;
  created_at: string;
  expires_at: string;
  settings_updated_at: string;
};

type ParticipantRow = {
  id: string;
  room_id: string;
  client_id: string;
  nickname: string;
  last_seen: string;
  kicked: number;
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code = "") {
    super(message);
  }
}

const SCHEMA = `
  create table if not exists rooms (
    id text primary key,
    code text not null unique collate nocase,
    host_token text not null,
    password_hash text,
    locked integer not null default 0,
    allow_guest_add integer not null default 1,
    allow_guest_remove integer not null default 1,
    allow_guest_controls integer not null default 1,
    created_at text not null,
    expires_at text not null,
    settings_updated_at text not null
  );

  create table if not exists queue_items (
    id text primary key,
    room_id text not null references rooms (id) on delete cascade,
    position integer not null,
    video_id text not null,
    title text not null,
    channel_title text not null default '',
    thumbnail_url text not null default '',
    added_by text not null default '',
    insert_mode text not null default 'play_next'
      check (insert_mode in ('play_next', 'queue')),
    created_at text not null,
    unique (room_id, position)
  );
  create index if not exists queue_items_room_video_idx
    on queue_items (room_id, video_id);

  create table if not exists participants (
    id text primary key,
    room_id text not null references rooms (id) on delete cascade,
    client_id text not null,
    nickname text not null default '',
    last_seen text not null,
    kicked integer not null default 0,
    unique (room_id, client_id)
  );
`;

export function openDb(path: string, emit: (change: Change) => void) {
  const db = new DatabaseSync(path);
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 3000;");
  db.exec(SCHEMA);

  const now = () => new Date().toISOString();
  const isUuid = (v: unknown): v is string =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const str = (v: unknown, max = 500) =>
    typeof v === "string" ? v.slice(0, max) : "";

  const q = {
    activeRoom: db.prepare("select * from rooms where id = ? and expires_at > ?"),
    roomByCode: db.prepare("select * from rooms where code = ? and expires_at > ?"),
    codeTaken: db.prepare("select 1 from rooms where code = ?"),
    insertRoom: db.prepare(
      `insert into rooms (id, code, host_token, created_at, expires_at, settings_updated_at)
       values (?, ?, ?, ?, ?, ?)`,
    ),
    purge: db.prepare("delete from rooms where expires_at <= ?"),
    endRoom: db.prepare("delete from rooms where id = ? and host_token = ?"),
    setSettings: db.prepare(
      `update rooms set locked = ?, allow_guest_add = ?, allow_guest_remove = ?,
       allow_guest_controls = ?, settings_updated_at = ? where id = ?`,
    ),
    setPassword: db.prepare(
      "update rooms set password_hash = ?, settings_updated_at = ? where id = ?",
    ),
    queue: db.prepare("select * from queue_items where room_id = ? order by position"),
    queueCount: db.prepare("select count(*) as n from queue_items where room_id = ?"),
    queueEnds: db.prepare(
      "select min(position) as lo, max(position) as hi from queue_items where room_id = ?",
    ),
    queueItem: db.prepare("select * from queue_items where id = ?"),
    insertQueue: db.prepare(
      `insert into queue_items (id, room_id, position, video_id, title, channel_title,
       thumbnail_url, added_by, insert_mode, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    deleteQueue: db.prepare("delete from queue_items where id = ?"),
    participants: db.prepare(
      "select * from participants where room_id = ? and kicked = 0 order by last_seen desc",
    ),
    participantCount: db.prepare(
      "select count(*) as n from participants where room_id = ? and kicked = 0",
    ),
    participant: db.prepare("select * from participants where room_id = ? and client_id = ?"),
    insertParticipant: db.prepare(
      `insert into participants (id, room_id, client_id, nickname, last_seen)
       values (?, ?, ?, ?, ?)`,
    ),
    touchParticipant: db.prepare(
      "update participants set nickname = ?, last_seen = ? where id = ?",
    ),
    kick: db.prepare(
      "update participants set kicked = 1, last_seen = ? where id = ?",
    ),
    byNickname: db.prepare(
      "select * from participants where room_id = ? and lower(trim(nickname)) = lower(trim(?))",
    ),
    leave: db.prepare("delete from participants where id = ? and kicked = 0"),
  };

  function activeRoom(roomId: unknown): RoomRow | null {
    if (!isUuid(roomId)) return null;
    return (q.activeRoom.get(roomId, now()) as RoomRow | undefined) ?? null;
  }

  function hostRoom(roomId: unknown, hostToken: unknown): RoomRow | null {
    const room = activeRoom(roomId);
    if (!room || typeof hostToken !== "string" || !hostToken) return null;
    return timingSafeEqual(room.host_token, hostToken) ? room : null;
  }

  function settingsOf(room: RoomRow) {
    return {
      room_id: room.id,
      locked: room.locked === 1,
      has_password: room.password_hash != null,
      allow_guest_add: room.allow_guest_add === 1,
      allow_guest_remove: room.allow_guest_remove === 1,
      allow_guest_controls: room.allow_guest_controls === 1,
      updated_at: room.settings_updated_at,
    };
  }

  function emitSettings(roomId: string) {
    const room = activeRoom(roomId);
    if (room) {
      emit({ table: "room_settings", roomId, eventType: "UPDATE", new: settingsOf(room), old: null });
    }
  }

  function publicParticipant(p: ParticipantRow) {
    return {
      room_id: p.room_id,
      client_id: p.client_id,
      nickname: p.nickname,
      last_seen: p.last_seen,
      kicked: p.kicked === 1,
    };
  }

  function generateCode(): string {
    for (let i = 0; i < 50; i++) {
      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
      if (!q.codeTaken.get(code)) return code;
    }
    throw new HttpError(500, "Could not generate unique room code");
  }

  function purgeExpired(): number {
    return Number(q.purge.run(now()).changes);
  }

  // --- RPCs: same names and arguments as the old Postgres functions -------

  const rpc: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>> = {
    create_room() {
      purgeExpired();
      const id = crypto.randomUUID();
      const code = generateCode();
      const hostToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
      const created = new Date();
      q.insertRoom.run(
        id,
        code,
        hostToken,
        created.toISOString(),
        new Date(created.getTime() + ROOM_TTL_MS).toISOString(),
        created.toISOString(),
      );
      return { room_id: id, code, host_token: hostToken };
    },

    async join_room({ p_code, p_password }) {
      const code = str(p_code, 32).trim();
      if (!code) return null;
      const room = q.roomByCode.get(code, now()) as RoomRow | undefined;
      if (!room) return null;
      if (room.locked) return { error: "locked" };
      if (room.password_hash && !(await verifyPassword(p_password, room.password_hash))) {
        return { error: "password" };
      }
      return { room_id: room.id, code: room.code };
    },

    get_room({ p_room_id }) {
      const room = activeRoom(p_room_id);
      if (!room) return null;
      const { room_id: _id, updated_at: _at, ...settings } = settingsOf(room);
      return {
        room_id: room.id,
        code: room.code,
        created_at: room.created_at,
        expires_at: room.expires_at,
        ...settings,
      };
    },

    async verify_room_password({ p_room_id, p_password }) {
      const room = activeRoom(p_room_id);
      if (!room) return false;
      if (!room.password_hash) return true;
      return await verifyPassword(p_password, room.password_hash);
    },

    set_room_settings(a) {
      const room = hostRoom(a.p_room_id, a.p_host_token);
      if (!room) return false;
      const pick = (v: unknown, current: number) =>
        typeof v === "boolean" ? (v ? 1 : 0) : current;
      q.setSettings.run(
        pick(a.p_locked, room.locked),
        pick(a.p_allow_guest_add, room.allow_guest_add),
        pick(a.p_allow_guest_remove, room.allow_guest_remove),
        pick(a.p_allow_guest_controls, room.allow_guest_controls),
        now(),
        room.id,
      );
      emitSettings(room.id);
      return true;
    },

    async set_room_password({ p_room_id, p_host_token, p_password }) {
      const room = hostRoom(p_room_id, p_host_token);
      if (!room) return false;
      const clean = str(p_password, 200).trim();
      q.setPassword.run(clean ? await hashPassword(clean) : null, now(), room.id);
      emitSettings(room.id);
      return true;
    },

    end_room({ p_room_id, p_host_token }) {
      const room = hostRoom(p_room_id, p_host_token);
      if (!room) return false;
      return Number(q.endRoom.run(room.id, room.host_token).changes) > 0;
    },

    purge_expired_rooms() {
      return purgeExpired();
    },

    touch_participant({ p_room_id, p_client_id, p_nickname }) {
      const room = activeRoom(p_room_id);
      const clientId = str(p_client_id, 100).trim();
      if (!room || !clientId) return "inactive";
      const existing = q.participant.get(room.id, clientId) as ParticipantRow | undefined;
      if (existing?.kicked) return "kicked";
      const seen = now();
      if (!existing) {
        if (room.locked) return "locked";
        const row: ParticipantRow = {
          id: crypto.randomUUID(),
          room_id: room.id,
          client_id: clientId,
          nickname: str(p_nickname, 60),
          last_seen: seen,
          kicked: 0,
        };
        q.insertParticipant.run(row.id, row.room_id, row.client_id, row.nickname, row.last_seen);
        emit({ table: "participants", roomId: room.id, eventType: "INSERT", new: publicParticipant(row), old: null });
      } else {
        const nickname = typeof p_nickname === "string" ? str(p_nickname, 60) : existing.nickname;
        q.touchParticipant.run(nickname, seen, existing.id);
        emit({
          table: "participants",
          roomId: room.id,
          eventType: "UPDATE",
          new: publicParticipant({ ...existing, nickname, last_seen: seen }),
          old: publicParticipant(existing),
        });
      }
      return "ok";
    },

    kick_participant({ p_room_id, p_host_token, p_client_id }) {
      const room = hostRoom(p_room_id, p_host_token);
      if (!room) return false;
      const p = q.participant.get(room.id, str(p_client_id, 100)) as ParticipantRow | undefined;
      if (p) kick(p);
      return true;
    },

    kick_by_nickname({ p_room_id, p_host_token, p_nickname }) {
      const room = hostRoom(p_room_id, p_host_token);
      const nickname = str(p_nickname, 60).trim();
      if (!room || !nickname) return 0;
      const rows = q.byNickname.all(room.id, nickname) as ParticipantRow[];
      for (const p of rows) kick(p);
      return rows.length;
    },

    leave_participant({ p_room_id, p_client_id }) {
      if (!isUuid(p_room_id)) return true;
      const p = q.participant.get(p_room_id, str(p_client_id, 100)) as ParticipantRow | undefined;
      if (p && !p.kicked && Number(q.leave.run(p.id).changes) > 0) {
        emit({ table: "participants", roomId: p.room_id, eventType: "DELETE", new: null, old: publicParticipant(p) });
      }
      return true;
    },
  };

  function kick(p: ParticipantRow) {
    const seen = now();
    q.kick.run(seen, p.id);
    emit({
      table: "participants",
      roomId: p.room_id,
      eventType: "UPDATE",
      new: publicParticipant({ ...p, kicked: 1, last_seen: seen }),
      old: publicParticipant(p),
    });
  }

  // --- Queue ---------------------------------------------------------------

  function listQueue(roomId: string): QueueRow[] {
    if (!activeRoom(roomId)) return [];
    return q.queue.all(roomId) as QueueRow[];
  }

  /**
   * Add a track. The position is picked here, inside one statement, so two
   * guests racing on "Play next" can no longer collide the way they could
   * when each client picked min(position) - 1 itself.
   */
  function addToQueue(roomId: string, input: Record<string, unknown>): QueueRow {
    const room = activeRoom(roomId);
    if (!room) throw new HttpError(404, "This lobby has ended", "room_inactive");
    if (!room.allow_guest_add) {
      throw new HttpError(403, "The host has turned off adding songs", "add_disabled");
    }
    const videoId = str(input.video_id, 64).trim();
    const title = str(input.title).trim();
    if (!videoId || !title) throw new HttpError(400, "video_id and title are required");
    const mode = input.insert_mode === "queue" ? "queue" : "play_next";

    const ends = q.queueEnds.get(roomId) as { lo: number | null; hi: number | null };
    const position = ends.lo == null ? 0 : mode === "queue" ? ends.hi! + 1 : ends.lo - 1;
    const row: QueueRow = {
      id: crypto.randomUUID(),
      room_id: roomId,
      position,
      video_id: videoId,
      title,
      channel_title: str(input.channel_title),
      thumbnail_url: str(input.thumbnail_url, 2000),
      added_by: str(input.added_by, 60),
      insert_mode: mode,
      created_at: now(),
    };
    q.insertQueue.run(
      row.id,
      row.room_id,
      row.position,
      row.video_id,
      row.title,
      row.channel_title,
      row.thumbnail_url,
      row.added_by,
      row.insert_mode,
      row.created_at,
    );
    emit({ table: "queue_items", roomId, eventType: "INSERT", new: row, old: null });
    return row;
  }

  function removeFromQueue(itemId: string): boolean {
    if (!isUuid(itemId)) return false;
    const row = q.queueItem.get(itemId) as QueueRow | undefined;
    if (!row || !activeRoom(row.room_id)) return false;
    if (Number(q.deleteQueue.run(itemId).changes) === 0) return false;
    emit({ table: "queue_items", roomId: row.room_id, eventType: "DELETE", new: null, old: row });
    return true;
  }

  function listParticipants(roomId: string) {
    if (!activeRoom(roomId)) return [];
    return (q.participants.all(roomId) as ParticipantRow[]).map(publicParticipant);
  }

  function counts(roomId: string) {
    if (!activeRoom(roomId)) return { queue: 0, participants: 0 };
    return {
      queue: Number((q.queueCount.get(roomId) as { n: number }).n),
      participants: Number((q.participantCount.get(roomId) as { n: number }).n),
    };
  }

  return {
    rpc,
    isUuid,
    activeRoom: (roomId: string) => activeRoom(roomId) != null,
    listQueue,
    addToQueue,
    removeFromQueue,
    listParticipants,
    counts,
    purgeExpired,
    close: () => db.close(),
  };
}

export type Db = ReturnType<typeof openDb>;

// --- Passwords: PBKDF2-SHA256, stored as pbkdf2$<iterations>$<salt>$<hash> --

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password: unknown, stored: string): Promise<boolean> {
  if (typeof password !== "string") return false;
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const actual = await pbkdf2(password, unb64(salt), Number(iter));
  return timingSafeEqual(b64(actual), hash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
