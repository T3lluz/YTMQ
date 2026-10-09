// YTMQ on t3lluz.com/ytmq: the app, its API and its realtime hub in one
// process. See deploy/server/README.md.
//
//   /ytmq/                 the built app (SPA; unknown paths get index.html)
//   /ytmq/api/rpc/<name>   room, password and participant calls
//   /ytmq/api/rooms/<id>/queue          GET list, POST add
//   /ytmq/api/rooms/<id>/participants   GET list
//   /ytmq/api/rooms/<id>/counts         GET { queue, participants }
//   /ytmq/api/queue/<itemId>            DELETE
//   /ytmq/api/broadcast    POST { topic, event, payload } (socket fallback)
//   /ytmq/api/realtime     WebSocket
//   /ytmq/api/functions/search | lyrics
//   /ytmq/api/health
//
// The prefix is matched in any case; /YTMQ/... redirects to /ytmq/....

import { extname, join, normalize } from "node:path";
import { HttpError, openDb } from "./db.ts";
import { createHub } from "./realtime.ts";
import { handler as searchHandler } from "./functions/search/index.ts";
import { handler as lyricsHandler } from "./functions/lyrics/index.ts";

const PORT = Number(Deno.env.get("PORT") ?? 8080);
const SITE_DIR = Deno.env.get("SITE_DIR") ?? "./dist";
const DATA_DIR = Deno.env.get("DATA_DIR") ?? "./data";
const PREFIX = "/ytmq";

const hub = createHub();
await Deno.mkdir(DATA_DIR, { recursive: true });
const db = openDb(join(DATA_DIR, "ytmq.db"), hub.publishChange);
setInterval(() => db.purgeExpired(), 60 * 60 * 1000);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 256 * 1024) throw new HttpError(413, "Body too large");
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : {};
  } catch {
    throw new HttpError(400, "Body is not JSON");
  }
}

/** The search and lyrics handlers answer their own CORS; keep theirs. */
async function runFunction(fn: (req: Request) => Promise<Response>, req: Request) {
  const res = await fn(req);
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers });
}

async function api(req: Request, path: string): Promise<Response> {
  const method = req.method;
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const parts = path.split("/").filter(Boolean);
  const [head, id, sub] = parts;

  if (head === "health") return json({ ok: true, ...hub.stats() });
  if (head === "realtime") {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WebSocket expected" }, 426);
    }
    return hub.upgrade(req);
  }

  if (head === "rpc" && id && method === "POST") {
    const fn = db.rpc[id];
    if (!fn || parts.length !== 2) return json({ error: `Unknown function ${id}` }, 404);
    return json(await fn(await readBody(req)));
  }

  if (head === "functions" && method === "POST") {
    if (id === "search") return runFunction(searchHandler, req);
    if (id === "lyrics") return runFunction(lyricsHandler, req);
  }

  if (head === "rooms" && id && db.isUuid(id) && parts.length === 3) {
    if (sub === "queue" && method === "GET") return json(db.listQueue(id));
    if (sub === "queue" && method === "POST") return json(db.addToQueue(id, await readBody(req)), 201);
    if (sub === "participants" && method === "GET") return json(db.listParticipants(id));
    if (sub === "counts" && method === "GET") return json(db.counts(id));
  }

  if (head === "queue" && id && parts.length === 2 && method === "DELETE") {
    return json({ deleted: db.removeFromQueue(id) });
  }

  if (head === "broadcast" && method === "POST") {
    const body = await readBody(req);
    const ok = hub.httpBroadcast(String(body.topic ?? ""), String(body.event ?? ""), body.payload);
    return json({ ok }, ok ? 202 : 400);
  }

  return json({ error: "Not found" }, 404);
}

// --- Static site -------------------------------------------------------------

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};

async function fileResponse(file: string, req: Request, cache: string): Promise<Response | null> {
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(file);
  } catch {
    return null;
  }
  if (!stat.isFile) return null;
  const etag = `W/"${stat.size.toString(36)}-${(stat.mtime?.getTime() ?? 0).toString(36)}"`;
  const headers = {
    ...CORS,
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Cache-Control": cache,
    ETag: etag,
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  if (req.method === "HEAD") return new Response(null, { headers });
  return new Response((await Deno.open(file)).readable, { headers });
}

async function site(req: Request, path: string): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
  const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.(\/|$))+/, "");
  const file = join(SITE_DIR, rel);
  if (!file.startsWith(normalize(SITE_DIR))) return json({ error: "Not found" }, 404);

  // Hashed bundles never change; everything else is checked every load so a
  // deploy shows up on the next refresh.
  const cache = rel.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
  const hit = rel !== "/" && (await fileResponse(file, req, cache));
  if (hit) return hit;
  if (extname(rel) && rel.startsWith("/assets/")) return json({ error: "Not found" }, 404);
  return (await fileResponse(join(SITE_DIR, "index.html"), req, "no-cache")) ??
    new Response("YTMQ is building, try again in a minute.", { status: 503 });
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lower = url.pathname.toLowerCase();
  if (lower !== PREFIX && !lower.startsWith(PREFIX + "/")) {
    return json({ error: "Not found" }, 404);
  }

  // One canonical spelling, so the router, assets and Spotify's redirect
  // URI all see /ytmq/ however the link was typed.
  const rest = url.pathname.slice(PREFIX.length);
  if (url.pathname.slice(0, PREFIX.length) !== PREFIX || rest === "") {
    if (req.method === "GET" || req.method === "HEAD") {
      return new Response(null, {
        status: 301,
        headers: { Location: `${PREFIX}${rest || "/"}${url.search}` },
      });
    }
  }

  try {
    if (rest.toLowerCase().startsWith("/api/") || rest.toLowerCase() === "/api") {
      return await api(req, rest.slice(4));
    }
    return await site(req, rest || "/");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
    console.error(req.method, url.pathname, err);
    return json({ error: "Server error" }, 500);
  }
}

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, handle);
