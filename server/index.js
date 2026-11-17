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
const CLIENT_DIST = path.join(ROOT, "client", "dist");

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
    createdAt: Date.now(),
  };
  events.set(id, ev);
  return ev;
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

function pairKey(a, b) {
  return [a, b].sort().join(":");
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
    const a = ev.guests.get(p.a);
    const b = ev.guests.get(p.b);
    return {
      id: p.id,
      a: a
        ? {
            id: a.id,
            name: a.name,
            company: a.company,
            photoUrl: includePhotos ? a.photoUrl : null,
          }
        : null,
      b: b
        ? {
            id: b.id,
            name: b.name,
            company: b.company,
            photoUrl: includePhotos ? b.photoUrl : null,
          }
        : null,
      askerId: p.askerId,
      found: Boolean(p.found),
      bye: Boolean(p.bye),
    };
  });
}

function publicState(ev, role = "guest") {
  const includePhotos = role !== "screen" || ev.phase === "searching" || ev.phase === "matching" || ev.phase === "lobby";
  const screenPairsNoFaces = role === "screen" && ev.phase === "networking";
  return {
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
}

function guestView(ev, guestId) {
  const base = publicState(ev, "guest");
  const me = ev.guests.get(guestId);
  const pair = ev.pairs.find((p) => p.a === guestId || p.b === guestId) || null;
  const partnerId = pair ? (pair.a === guestId ? pair.b : pair.a) : null;
  const partner = partnerId ? ev.guests.get(partnerId) : null;
  const chat = pair ? ev.chat.get(pair.id) || [] : [];
  return {
    ...base,
    me: me ? guestPublic(me) : null,
    pair: pair
      ? {
          id: pair.id,
          partner: partner ? guestPublic(partner) : null,
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

/** Avoid immediate rematch with same partner when possible */
function buildPairs(ev) {
  const ready = [...ev.guests.values()].filter((g) => g.ready);
  const ids = shuffle(ready.map((g) => g.id));
  const previous = new Set();
  for (const p of ev.pairs) {
    if (p.a && p.b) previous.add(pairKey(p.a, p.b));
  }

  // Try a few shuffles to reduce rematches
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    const order = shuffle(ids);
    const pairs = [];
    let rematches = 0;
    for (let i = 0; i + 1 < order.length; i += 2) {
      const a = order[i];
      const b = order[i + 1];
      if (previous.has(pairKey(a, b))) rematches += 1;
      pairs.push({
        id: nanoid(8),
        a,
        b,
        askerId: Math.random() < 0.5 ? a : b,
        found: false,
        bye: false,
      });
    }
    if (order.length % 2 === 1) {
      const alone = order[order.length - 1];
      pairs.push({
        id: nanoid(8),
        a: alone,
        b: alone,
        askerId: alone,
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
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOADS));
app.use("/brand", express.static(path.join(ROOT, "brand")));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").slice(0, 8) || ".jpg";
    cb(null, `${nanoid(12)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Только изображения"));
      return;
    }
    cb(null, true);
  },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, events: events.size });
});

app.get("/api/link-base", (req, res) => {
  res.json({
    linkBase: linkBase(req),
    lanOrigins: clientLanOrigins(),
  });
});

app.post("/api/events", (_req, res) => {
  const ev = createEvent();
  res.json({
    id: ev.id,
    hostToken: ev.hostToken,
    joinPath: `/join/${ev.id}`,
    hostPath: `/host/${ev.id}`,
    screenPath: `/screen/${ev.id}`,
  });
});

app.get("/api/events/:id", (req, res) => {
  const ev = events.get(req.params.id);
  if (!ev) return res.status(404).json({ error: "Событие не найдено" });
  res.json(publicState(ev, "guest"));
});

app.post("/api/upload", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Нет файла" });
  res.json({ photoUrl: `/uploads/${req.file.filename}` });
});

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
  cors: { origin: true },
  maxHttpBufferSize: 2e6,
  pingInterval: 20000,
  pingTimeout: 25000,
});

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
    if (hostToken && hostToken !== ev.hostToken) {
      return ack?.({ ok: false, error: "Неверный токен ведущего" });
    }
    socket.join(`host:${ev.id}`);
    socket.data.role = "host";
    socket.data.eventId = ev.id;
    ack?.({ ok: true, hostToken: ev.hostToken, state: publicState(ev, "host") });
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

  socket.on("guest:join", ({ eventId, guestId, name, company, photoUrl }, ack) => {
    const ev = events.get(eventId);
    if (!ev) return ack?.({ ok: false, error: "Событие не найдено" });
    if (ev.phase !== "lobby" && ev.phase !== "between" && !guestId) {
      return ack?.({ ok: false, error: "Регистрация закрыта — дождитесь паузы между раундами" });
    }

    let guest = guestId ? ev.guests.get(guestId) : null;
    if (!guest) {
      if (ev.guests.size >= 650) {
        return ack?.({ ok: false, error: "Зал заполнен" });
      }
      const nm = String(name || "").trim().slice(0, 60);
      const co = String(company || "").trim().slice(0, 80);
      if (!nm || !co) return ack?.({ ok: false, error: "Нужны имя и компания" });
      guest = {
        id: nanoid(10),
        name: nm,
        company: co,
        photoUrl: String(photoUrl || "").slice(0, 200) || null,
        ready: true,
        socketId: socket.id,
      };
      ev.guests.set(guest.id, guest);
    } else {
      guest.socketId = socket.id;
      if (name) guest.name = String(name).trim().slice(0, 60);
      if (company) guest.company = String(company).trim().slice(0, 80);
      if (photoUrl) guest.photoUrl = String(photoUrl).slice(0, 200);
      guest.ready = true;
    }

    socket.join(`event:${ev.id}`);
    socket.data.role = "guest";
    socket.data.eventId = ev.id;
    socket.data.guestId = guest.id;
    ack?.({ ok: true, guestId: guest.id, state: guestView(ev, guest.id) });
    emitEvent(io, ev);
  });

  socket.on("host:settings", ({ eventId, hostToken, settings }, ack) => {
    const ev = events.get(eventId);
    if (!ev || ev.hostToken !== hostToken) return ack?.({ ok: false, error: "Нет доступа" });
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
    const ev = events.get(eventId);
    if (!ev || ev.hostToken !== hostToken) return ack?.({ ok: false, error: "Нет доступа" });
    if (ev.phase !== "lobby" && ev.phase !== "between") {
      return ack?.({ ok: false, error: "Сейчас нельзя стартовать раунд" });
    }
    const ready = [...ev.guests.values()].filter((g) => g.ready).length;
    if (ready < 2) return ack?.({ ok: false, error: "Нужно минимум 2 гостя" });
    enterMatching(io, ev);
    ack?.({ ok: true });
  });

  socket.on("host:stop", ({ eventId, hostToken }, ack) => {
    const ev = events.get(eventId);
    if (!ev || ev.hostToken !== hostToken) return ack?.({ ok: false, error: "Нет доступа" });
    clearTimer(ev);
    ev.phase = "lobby";
    ev.round = 0;
    ev.pairs = [];
    ev.chat = new Map();
    emitEvent(io, ev);
    ack?.({ ok: true });
  });

  socket.on("host:skip", ({ eventId, hostToken }, ack) => {
    const ev = events.get(eventId);
    if (!ev || ev.hostToken !== hostToken) return ack?.({ ok: false, error: "Нет доступа" });
    if (ev.phase === "matching") enterSearching(io, ev);
    else if (ev.phase === "searching") {
      for (const p of ev.pairs) if (!p.bye) p.found = true;
      enterNetworking(io, ev);
    } else if (ev.phase === "networking") endRound(io, ev);
    else return ack?.({ ok: false, error: "Нечего пропускать" });
    ack?.({ ok: true });
  });

  socket.on("guest:found", ({ eventId, guestId }, ack) => {
    const ev = events.get(eventId);
    if (!ev) return ack?.({ ok: false, error: "Нет события" });
    const pair = ev.pairs.find((p) => p.a === guestId || p.b === guestId);
    if (!pair || pair.bye) return ack?.({ ok: false, error: "Нет пары" });
    if (ev.phase !== "searching") return ack?.({ ok: false, error: "Не фаза поиска" });
    pair.found = true;
    emitEvent(io, ev);
    const allFound = ev.pairs.every((p) => p.found || p.bye);
    if (allFound) enterNetworking(io, ev);
    ack?.({ ok: true });
  });

  socket.on("guest:chat", ({ eventId, guestId, text }, ack) => {
    const ev = events.get(eventId);
    if (!ev) return ack?.({ ok: false, error: "Нет события" });
    if (ev.phase !== "searching") return ack?.({ ok: false, error: "Чат только в поиске" });
    const pair = ev.pairs.find((p) => p.a === guestId || p.b === guestId);
    if (!pair || pair.bye) return ack?.({ ok: false, error: "Нет пары" });
    const msg = {
      id: nanoid(6),
      from: guestId,
      text: String(text || "").trim().slice(0, 280),
      at: Date.now(),
    };
    if (!msg.text) return ack?.({ ok: false, error: "Пусто" });
    const list = ev.chat.get(pair.id) || [];
    list.push(msg);
    if (list.length > 80) list.splice(0, list.length - 80);
    ev.chat.set(pair.id, list);
    const a = ev.guests.get(pair.a);
    const b = ev.guests.get(pair.b);
    for (const g of [a, b]) {
      if (g?.socketId) io.to(g.socketId).emit("chat", { pairId: pair.id, message: msg });
    }
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
