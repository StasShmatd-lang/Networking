import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const UPLOADS = path.join(ROOT, "uploads");
const CLIENT_DIST = fs.existsSync(path.join(ROOT, "public", "index.html"))
  ? path.join(ROOT, "public")
  : path.join(ROOT, "client", "dist");

fs.mkdirSync(UPLOADS, { recursive: true });

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_PORT = Number(process.env.CLIENT_PORT) || 5173;
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || "").replace(/\/$/, "");

const DEFAULT_QUESTIONS = [
  "Чем я могу быть полезен?",
  "Какой проект сейчас главный?",
  "Кого из зала тебе стоит познакомить с кем?",
  "Какую одну встречу ты хочешь устроить после события?",
  "Что ты ищешь: клиенты, партнёры, люди в команду?",
];

/** @typedef {'lobby'|'matching'|'searching'|'networking'|'between'|'done'} Phase */

/**
 * @typedef {{
 *   id: string,
 *   hostToken: string,
 *   phase: Phase,
 *   round: number,
 *   totalRounds: number,
 *   searchSec: number,
 *   networkSec: number,
 *   questions: string[],
 *   guests: Map<string, object>,
 *   pairs: Array<object>,
 *   chat: Map<string, Array<object>>,
 *   timer: { kind: string|null, endsAt: number|null, totalSec: number },
 *   createdAt: number,
 * }} Event
 */

/** @type {Map<string, Event>} */
const events = new Map();

/** @type {Map<string, { n: number, reset: number }>} */
const rateBuckets = new Map();

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now > b.reset) b = { n: 0, reset: now + windowMs };
  b.n += 1;
  rateBuckets.set(key, b);
  return b.n <= max;
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xf || req.socket?.remoteAddress || "unknown";
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (PUBLIC_ORIGIN && origin.replace(/\/$/, "") === PUBLIC_ORIGIN) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return true;
    if (u.hostname.endsWith(".cursor.app") || u.hostname.endsWith(".cursor.so")) return true;
    return false;
  } catch {
    return false;
  }
}

const ALLOWED_IMAGE_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function safePhotoUrl(url, eventId) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  // Prefer event-scoped paths; allow legacy flat uploads only in same event folder form
  const scoped = new RegExp(`^/uploads/${eventId}/[A-Za-z0-9_-]+\\.(jpe?g|png|webp)$`, "i");
  if (eventId && scoped.test(trimmed)) return trimmed;
  return null;
}

const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_UPLOADS_PER_EVENT = 80;
const MAX_EVENTS = 80;

function clientLanOrigins() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        out.push(`http://${addr.address}:${CLIENT_PORT}`);
      }
    }
  }
  return out;
}

function linkBase(req) {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (host && !String(host).includes(`:${PORT}`)) {
    return `${proto}://${host}`;
  }
  return `http://127.0.0.1:${CLIENT_PORT}`;
}

function createEvent() {
  const id = nanoid(8);
  /** @type {Event} */
  const ev = {
    id,
    hostToken: nanoid(16),
    guestAccessToken: nanoid(18),
    phase: "lobby",
    round: 0,
    totalRounds: 5,
    searchSec: 90,
    networkSec: 180,
    questions: [...DEFAULT_QUESTIONS],
    guests: new Map(),
    pairs: [],
    chat: new Map(),
    timer: { kind: null, endsAt: null, totalSec: 0 },
    uploadCount: 0,
    createdAt: Date.now(),
  };
  fs.mkdirSync(path.join(UPLOADS, id), { recursive: true });
  events.set(id, ev);
  return ev;
}

function purgeEventFiles(eventId) {
  const dir = path.join(UPLOADS, eventId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function pruneExpiredEvents() {
  const now = Date.now();
  for (const [id, ev] of events) {
    if (now - ev.createdAt > EVENT_TTL_MS) {
      events.delete(id);
      purgeEventFiles(id);
    }
  }
}

function guestPublic(g) {
  return {
    id: g.id,
    name: g.name,
    company: g.company,
    photoUrl: g.photoUrl,
    ready: Boolean(g.ready),
  };
}

function groupKey(memberIds) {
  return [...memberIds].sort().join(":");
}

function pairMembers(p) {
  if (Array.isArray(p.members) && p.members.length) return p.members;
  const ids = [p.a, p.b, p.c].filter(Boolean);
  return [...new Set(ids)];
}

function findGroupForGuest(ev, guestId) {
  return ev.pairs.find((p) => pairMembers(p).includes(guestId)) || null;
}

function serializeMember(ev, id, includePhotos) {
  const g = ev.guests.get(id);
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    company: g.company,
    photoUrl: includePhotos ? g.photoUrl : null,
  };
}

function questionForRound(ev) {
  const qs = ev.questions.filter((q) => String(q).trim());
  if (!qs.length) return DEFAULT_QUESTIONS[0];
  return qs[(ev.round - 1) % qs.length];
}

function clearTimer(ev) {
  ev.timer = { kind: null, endsAt: null, totalSec: 0 };
}

function startTimer(ev, kind, sec) {
  ev.timer = {
    kind,
    endsAt: Date.now() + sec * 1000,
    totalSec: sec,
  };
}

function serializeTimer(ev) {
  const { kind, endsAt, totalSec } = ev.timer;
  if (!kind || !endsAt) {
    return { kind: null, remainingMs: 0, totalSec: 0, running: false };
  }
  return {
    kind,
    remainingMs: Math.max(0, endsAt - Date.now()),
    totalSec,
    running: endsAt > Date.now(),
  };
}

function serializePairs(ev, { includePhotos = true } = {}) {
  return ev.pairs.map((p) => {
    const members = pairMembers(p)
      .map((id) => serializeMember(ev, id, includePhotos))
      .filter(Boolean);
    return {
      id: p.id,
      members,
      // legacy fields for older clients / screenshots
      a: members[0] || null,
      b: members[1] || null,
      c: members[2] || null,
      size: members.length,
      askerId: p.askerId,
      found: Boolean(p.found),
      bye: Boolean(p.bye),
    };
  });
}

function publicState(ev, role = "guest") {
  const includePhotos = role !== "screen" || ev.phase === "searching" || ev.phase === "matching" || ev.phase === "lobby";
  const screenPairsNoFaces = role === "screen" && ev.phase === "networking";
  const base = {
    id: ev.id,
    phase: ev.phase,
    round: ev.round,
    totalRounds: ev.totalRounds,
    searchSec: ev.searchSec,
    networkSec: ev.networkSec,
    questions: ev.questions,
    question: ev.round > 0 ? questionForRound(ev) : null,
    guestCount: ev.guests.size,
    guests: [...ev.guests.values()].map(guestPublic),
    pairs: serializePairs(ev, { includePhotos: !screenPairsNoFaces && includePhotos }),
    timer: serializeTimer(ev),
    role,
  };
  // Join key is already on the projected QR; host/screen need it to build links
  if (role === "host" || role === "screen") {
    base.guestAccessToken = ev.guestAccessToken;
  }
  return base;
}

function guestView(ev, guestId) {
  const base = publicState(ev, "guest");
  const me = ev.guests.get(guestId);
  const pair = findGroupForGuest(ev, guestId);
  const memberIds = pair ? pairMembers(pair) : [];
  const partners = memberIds
    .filter((id) => id !== guestId)
    .map((id) => ev.guests.get(id))
    .filter(Boolean)
    .map(guestPublic);
  const chat = pair ? ev.chat.get(pair.id) || [] : [];
  return {
    ...base,
    me: me ? guestPublic(me) : null,
    pair: pair
      ? {
          id: pair.id,
          size: memberIds.length,
          partner: partners[0] || null,
          partners,
          askerId: pair.askerId,
          found: Boolean(pair.found),
          bye: Boolean(pair.bye),
          amAsker: pair.askerId === guestId,
        }
      : null,
    chat,
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeGroup(memberIds) {
  const members = [...memberIds];
  return {
    id: nanoid(8),
    members,
    a: members[0],
    b: members[1] || members[0],
    c: members[2] || null,
    askerId: members[Math.floor(Math.random() * members.length)],
    found: false,
    bye: false,
  };
}

/**
 * Match into pairs; if guest count is odd (≥3), last leftover becomes a triple
 * instead of sitting out alone.
 */
function buildPairs(ev) {
  const ready = [...ev.guests.values()].filter((g) => g.ready);
  const ids = ready.map((g) => g.id);
  const previous = new Set();
  for (const p of ev.pairs) {
    previous.add(groupKey(pairMembers(p)));
  }

  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 16; attempt++) {
    const order = shuffle(ids);
    const pairs = [];
    let rematches = 0;
    let i = 0;

    // Odd count → one triple at the end so nobody sits out
    const useTriple = order.length >= 3 && order.length % 2 === 1;
    const pairLimit = useTriple ? order.length - 3 : order.length;

    while (i + 1 < pairLimit) {
      const members = [order[i], order[i + 1]];
      if (previous.has(groupKey(members))) rematches += 1;
      pairs.push(makeGroup(members));
      i += 2;
    }
    if (useTriple) {
      const members = order.slice(-3);
      if (previous.has(groupKey(members))) rematches += 1;
      pairs.push(makeGroup(members));
    } else if (order.length === 1) {
      // Only possible if host started with <2 somehow
      pairs.push({
        ...makeGroup([order[0], order[0]]),
        found: true,
        bye: true,
      });
    }

    if (rematches < bestScore) {
      bestScore = rematches;
      best = pairs;
      if (rematches === 0) break;
    }
  }

  ev.pairs = best || [];
  ev.chat = new Map();
  for (const p of ev.pairs) {
    ev.chat.set(p.id, []);
  }
}

function emitChatToGroup(io, ev, pair, message) {
  for (const id of pairMembers(pair)) {
    const g = ev.guests.get(id);
    if (g?.socketId) io.to(g.socketId).emit("chat", { pairId: pair.id, message });
  }
}

function emitEvent(io, ev) {
  io.to(`host:${ev.id}`).emit("state", publicState(ev, "host"));
  io.to(`screen:${ev.id}`).emit("state", publicState(ev, "screen"));
  for (const g of ev.guests.values()) {
    if (g.socketId) {
      io.to(g.socketId).emit("state", guestView(ev, g.id));
    }
  }
}

function advanceIfTimerDone(io, ev) {
  if (!ev.timer.endsAt || Date.now() < ev.timer.endsAt) return;
  if (ev.phase === "searching") {
    // Auto-mark remaining pairs found and enter networking
    for (const p of ev.pairs) {
      if (!p.bye) p.found = true;
    }
    enterNetworking(io, ev);
  } else if (ev.phase === "networking") {
    endRound(io, ev);
  } else if (ev.phase === "matching") {
    enterSearching(io, ev);
  }
}

function enterMatching(io, ev) {
  ev.phase = "matching";
  ev.round += 1;
  buildPairs(ev);
  startTimer(ev, "matching", 8);
  emitEvent(io, ev);
}

function enterSearching(io, ev) {
  ev.phase = "searching";
  startTimer(ev, "search", ev.searchSec);
  emitEvent(io, ev);
}

function enterNetworking(io, ev) {
  ev.phase = "networking";
  startTimer(ev, "network", ev.networkSec);
  emitEvent(io, ev);
}

function endRound(io, ev) {
  clearTimer(ev);
  if (ev.round >= ev.totalRounds) {
    ev.phase = "done";
    ev.pairs = [];
  } else {
    ev.phase = "between";
    ev.pairs = [];
  }
  emitEvent(io, ev);
}

const app = express();
app.use(
  cors({
    origin(origin, cb) {
      cb(null, isAllowedOrigin(origin));
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(
  "/uploads",
  express.static(UPLOADS, {
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }),
);
app.use("/brand", express.static(path.join(ROOT, "brand")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, events: events.size });
});

app.get("/api/link-base", (req, res) => {
  res.json({
    linkBase: linkBase(req),
    lanOrigins: clientLanOrigins(),
  });
});

app.post("/api/events", (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit(`event:${ip}`, 5, 60_000)) {
    return res.status(429).json({ error: "Слишком много событий, подождите минуту" });
  }
  pruneExpiredEvents();
  if (events.size >= MAX_EVENTS) {
    return res.status(503).json({ error: "Сервер занят, попробуйте позже" });
  }
  const ev = createEvent();
  res.json({
    id: ev.id,
    hostToken: ev.hostToken,
    guestAccessToken: ev.guestAccessToken,
    joinPath: `/join/${ev.id}?k=${ev.guestAccessToken}`,
    hostPath: `/host/${ev.id}`,
    screenPath: `/screen/${ev.id}`,
  });
});

/** Public REST: no guest PII — sockets carry live details after auth */
app.get("/api/events/:id", (req, res) => {
  const ev = events.get(req.params.id);
  if (!ev) return res.status(404).json({ error: "Событие не найдено" });
  res.json({
    id: ev.id,
    phase: ev.phase,
    round: ev.round,
    totalRounds: ev.totalRounds,
    guestCount: ev.guests.size,
  });
});

app.post("/api/upload", (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit(`upload:${ip}`, 20, 60_000)) {
    return res.status(429).json({ error: "Слишком много загрузок" });
  }

  const eventId = String(req.query.eventId || "");
  const accessKey = String(req.query.accessKey || "");
  const ev = events.get(eventId);
  if (!ev || !accessKey || accessKey !== ev.guestAccessToken) {
    return res.status(401).json({ error: "Нужен ключ события из QR" });
  }
  if (ev.phase !== "lobby" && ev.phase !== "between") {
    return res.status(403).json({ error: "Загрузка только до старта или в паузе" });
  }
  if (ev.uploadCount >= MAX_UPLOADS_PER_EVENT) {
    return res.status(429).json({ error: "Лимит фото для события" });
  }

  const dir = path.join(UPLOADS, eventId);
  fs.mkdirSync(dir, { recursive: true });
  const up = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => {
        const ext = ALLOWED_IMAGE_MIME[file.mimetype] || ".jpg";
        cb(null, `${nanoid(12)}${ext}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_IMAGE_MIME[file.mimetype]) {
        cb(new Error("Только JPEG, PNG или WebP"));
        return;
      }
      cb(null, true);
    },
  }).single("photo");

  up(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Ошибка загрузки" });
    if (!req.file) return res.status(400).json({ error: "Нет файла" });
    ev.uploadCount += 1;
    res.json({ photoUrl: `/uploads/${eventId}/${req.file.filename}` });
  });
});

// Periodic retention
setInterval(pruneExpiredEvents, 15 * 60 * 1000);

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path.startsWith("/uploads")) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin(origin, cb) {
      cb(null, isAllowedOrigin(origin));
    },
  },
  maxHttpBufferSize: 1e6,
  pingInterval: 20000,
  pingTimeout: 25000,
});

function requireHost(socket, eventId, hostToken) {
  const ev = events.get(eventId);
  if (!ev) return { error: "Событие не найдено" };
  if (!hostToken || hostToken !== ev.hostToken) return { error: "Нет доступа" };
  if (socket.data.role !== "host" || socket.data.eventId !== eventId) {
    return { error: "Сначала войдите как ведущий" };
  }
  return { ev };
}

function requireGuestSession(socket, eventId) {
  const ev = events.get(eventId);
  if (!ev) return { error: "Событие не найдено" };
  if (socket.data.role !== "guest" || socket.data.eventId !== eventId || !socket.data.guestId) {
    return { error: "Нет сессии гостя" };
  }
  const guestId = socket.data.guestId;
  if (!ev.guests.has(guestId)) return { error: "Гость не найден" };
  return { ev, guestId };
}

// Global timer tick for all events
setInterval(() => {
  for (const ev of events.values()) {
    if (ev.timer.endsAt && Date.now() >= ev.timer.endsAt) {
      advanceIfTimerDone(io, ev);
    }
  }
}, 500);

io.on("connection", (socket) => {
  socket.on("host:join", ({ eventId, hostToken }, ack) => {
    const ev = events.get(eventId);
    if (!ev) return ack?.({ ok: false, error: "Событие не найдено" });
    if (!hostToken || hostToken !== ev.hostToken) {
      return ack?.({ ok: false, error: "Нужен ключ ведущего. Создайте событие заново." });
    }
    socket.join(`host:${ev.id}`);
    socket.data.role = "host";
    socket.data.eventId = ev.id;
    // Do not echo hostToken — client already has it from create
    ack?.({ ok: true, state: publicState(ev, "host") });
    socket.emit("state", publicState(ev, "host"));
  });

  socket.on("screen:join", ({ eventId }, ack) => {
    const ev = events.get(eventId);
    if (!ev) return ack?.({ ok: false, error: "Событие не найдено" });
    socket.join(`screen:${ev.id}`);
    socket.data.role = "screen";
    socket.data.eventId = ev.id;
    ack?.({ ok: true, state: publicState(ev, "screen") });
    socket.emit("state", publicState(ev, "screen"));
  });

  socket.on("guest:join", ({ eventId, guestId, guestToken, accessKey, name, company, photoUrl }, ack) => {
    const ev = events.get(eventId);
    if (!ev) return ack?.({ ok: false, error: "Событие не найдено" });

    let guest = guestId ? ev.guests.get(guestId) : null;
    if (guest) {
      if (!guestToken || guestToken !== guest.token) {
        return ack?.({ ok: false, error: "Нет доступа к профилю гостя" });
      }
      guest.socketId = socket.id;
      if (name) guest.name = String(name).trim().slice(0, 60);
      if (company) guest.company = String(company).trim().slice(0, 80);
      const photo = safePhotoUrl(photoUrl, eventId);
      if (photo) guest.photoUrl = photo;
      guest.ready = true;
    } else {
      if (!accessKey || accessKey !== ev.guestAccessToken) {
        return ack?.({ ok: false, error: "Откройте ссылку из QR события" });
      }
      if (ev.phase !== "lobby" && ev.phase !== "between") {
        return ack?.({ ok: false, error: "Регистрация закрыта — дождитесь паузы между раундами" });
      }
      if (ev.guests.size >= 650) {
        return ack?.({ ok: false, error: "Зал заполнен" });
      }
      const nm = String(name || "").trim().slice(0, 60);
      const co = String(company || "").trim().slice(0, 80);
      if (!nm || !co) return ack?.({ ok: false, error: "Нужны имя и компания" });
      guest = {
        id: nanoid(10),
        token: nanoid(18),
        name: nm,
        company: co,
        photoUrl: safePhotoUrl(photoUrl, eventId),
        ready: true,
        socketId: socket.id,
      };
      ev.guests.set(guest.id, guest);
    }

    socket.join(`event:${ev.id}`);
    socket.data.role = "guest";
    socket.data.eventId = ev.id;
    socket.data.guestId = guest.id;
    ack?.({
      ok: true,
      guestId: guest.id,
      guestToken: guest.token,
      state: guestView(ev, guest.id),
    });
    emitEvent(io, ev);
  });

  socket.on("host:settings", ({ eventId, hostToken, settings }, ack) => {
    const { ev, error } = requireHost(socket, eventId, hostToken);
    if (!ev) return ack?.({ ok: false, error });
    if (settings?.totalRounds != null) {
      ev.totalRounds = Math.min(20, Math.max(1, Number(settings.totalRounds) || 5));
    }
    if (settings?.searchSec != null) {
      ev.searchSec = Math.min(600, Math.max(15, Number(settings.searchSec) || 90));
    }
    if (settings?.networkSec != null) {
      ev.networkSec = Math.min(900, Math.max(30, Number(settings.networkSec) || 180));
    }
    if (Array.isArray(settings?.questions)) {
      ev.questions = settings.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 20);
      if (!ev.questions.length) ev.questions = [...DEFAULT_QUESTIONS];
    }
    emitEvent(io, ev);
    ack?.({ ok: true });
  });

  socket.on("host:start", ({ eventId, hostToken }, ack) => {
    const { ev, error } = requireHost(socket, eventId, hostToken);
    if (!ev) return ack?.({ ok: false, error });
    if (ev.phase !== "lobby" && ev.phase !== "between") {
      return ack?.({ ok: false, error: "Сейчас нельзя стартовать раунд" });
    }
    const ready = [...ev.guests.values()].filter((g) => g.ready).length;
    if (ready < 2) return ack?.({ ok: false, error: "Нужно минимум 2 гостя" });
    enterMatching(io, ev);
    ack?.({ ok: true });
  });

  socket.on("host:stop", ({ eventId, hostToken }, ack) => {
    const { ev, error } = requireHost(socket, eventId, hostToken);
    if (!ev) return ack?.({ ok: false, error });
    clearTimer(ev);
    ev.phase = "lobby";
    ev.round = 0;
    ev.pairs = [];
    ev.chat = new Map();
    emitEvent(io, ev);
    ack?.({ ok: true });
  });

  socket.on("host:skip", ({ eventId, hostToken }, ack) => {
    const { ev, error } = requireHost(socket, eventId, hostToken);
    if (!ev) return ack?.({ ok: false, error });
    if (ev.phase === "matching") enterSearching(io, ev);
    else if (ev.phase === "searching") {
      for (const p of ev.pairs) if (!p.bye) p.found = true;
      enterNetworking(io, ev);
    } else if (ev.phase === "networking") endRound(io, ev);
    else return ack?.({ ok: false, error: "Нечего пропускать" });
    ack?.({ ok: true });
  });

  socket.on("guest:found", ({ eventId }, ack) => {
    const { ev, guestId, error } = requireGuestSession(socket, eventId);
    if (!ev) return ack?.({ ok: false, error });
    const pair = findGroupForGuest(ev, guestId);
    if (!pair || pair.bye) return ack?.({ ok: false, error: "Нет группы" });
    if (ev.phase !== "searching") return ack?.({ ok: false, error: "Не фаза поиска" });
    pair.found = true;
    emitEvent(io, ev);
    const allFound = ev.pairs.every((p) => p.found || p.bye);
    if (allFound) enterNetworking(io, ev);
    ack?.({ ok: true });
  });

  socket.on("guest:chat", ({ eventId, text }, ack) => {
    const { ev, guestId, error } = requireGuestSession(socket, eventId);
    if (!ev) return ack?.({ ok: false, error });
    if (ev.phase !== "searching" && ev.phase !== "networking") {
      return ack?.({ ok: false, error: "Чат доступен в поиске и нетворкинге" });
    }
    const pair = findGroupForGuest(ev, guestId);
    if (!pair || pair.bye) return ack?.({ ok: false, error: "Нет группы" });
    const fromGuest = ev.guests.get(guestId);
    const msg = {
      id: nanoid(6),
      from: guestId,
      fromName: fromGuest?.name || "Гость",
      text: String(text || "").trim().slice(0, 280),
      at: Date.now(),
    };
    if (!msg.text) return ack?.({ ok: false, error: "Пусто" });
    const list = ev.chat.get(pair.id) || [];
    list.push(msg);
    if (list.length > 80) list.splice(0, list.length - 80);
    ev.chat.set(pair.id, list);
    emitChatToGroup(io, ev, pair, msg);
    ack?.({ ok: true, message: msg });
  });

  socket.on("disconnect", () => {
    const { eventId, guestId, role } = socket.data || {};
    if (role === "guest" && eventId && guestId) {
      const ev = events.get(eventId);
      const g = ev?.guests.get(guestId);
      if (g && g.socketId === socket.id) {
        g.socketId = null;
        // Keep profile for rejoin; mark presence loosely
        emitEvent(io, ev);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Networking server on :${PORT}`);
});
