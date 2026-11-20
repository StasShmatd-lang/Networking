import { nanoid } from "nanoid";
import { sql } from "./db";
import { DEFAULT_QUESTIONS, type ChatMessage, type EventData, type Guest, type Group } from "./types";

const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 80;

function guestPublic(g: Guest, withPhoto = true) {
  return {
    id: g.id,
    name: g.name,
    company: g.company,
    photoUrl: withPhoto ? g.photoUrl : null,
    hasPhoto: Boolean(g.photoUrl),
    ready: g.ready,
  };
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function questionForRound(ev: EventData) {
  const qs = ev.questions.filter((q) => q.trim());
  const list = qs.length ? qs : DEFAULT_QUESTIONS;
  return list[(ev.round - 1) % list.length];
}

function serializeTimer(ev: EventData) {
  const { kind, endsAt, totalSec } = ev.timer;
  if (!kind || !endsAt) return { kind: null, remainingMs: 0, totalSec: 0, running: false };
  return {
    kind,
    remainingMs: Math.max(0, endsAt - Date.now()),
    totalSec,
    running: endsAt > Date.now(),
  };
}

function makeGroup(members: string[]): Group {
  return {
    id: nanoid(8),
    members,
    askerId: members[Math.floor(Math.random() * members.length)],
    found: false,
    bye: false,
  };
}

function buildPairs(ev: EventData) {
  const ids = shuffle(ev.guests.filter((g) => g.ready).map((g) => g.id));
  const pairs: Group[] = [];
  const useTriple = ids.length >= 3 && ids.length % 2 === 1;
  const pairLimit = useTriple ? ids.length - 3 : ids.length;
  for (let i = 0; i + 1 < pairLimit; i += 2) pairs.push(makeGroup([ids[i], ids[i + 1]]));
  if (useTriple) pairs.push(makeGroup(ids.slice(-3)));
  ev.pairs = pairs;
  ev.chat = {};
  for (const p of pairs) ev.chat[p.id] = [];
}

const MAX_EVENT_JSON_BYTES = 6_000_000;

/** Returns true when phase/timer actually changed. */
function advanceTimers(ev: EventData): boolean {
  if (!ev.timer.endsAt || Date.now() < ev.timer.endsAt) return false;
  if (ev.phase === "matching") {
    ev.phase = "searching";
    ev.timer = { kind: "search", endsAt: Date.now() + ev.searchSec * 1000, totalSec: ev.searchSec };
    return true;
  }
  if (ev.phase === "searching") {
    for (const p of ev.pairs) if (!p.bye) p.found = true;
    ev.phase = "networking";
    ev.timer = { kind: "network", endsAt: Date.now() + ev.networkSec * 1000, totalSec: ev.networkSec };
    return true;
  }
  if (ev.phase === "networking") {
    ev.timer = { kind: null, endsAt: null, totalSec: 0 };
    if (ev.round >= ev.totalRounds) {
      ev.phase = "done";
      ev.pairs = [];
    } else {
      ev.phase = "between";
      ev.pairs = [];
    }
    return true;
  }
  return false;
}

export async function loadEvent(id: string): Promise<EventData | null> {
  const rows = await sql<{ data: EventData }>("select data from events where id = $1", [id]);
  if (!rows[0]) return null;
  return rows[0].data;
}

export async function loadEventTicked(id: string): Promise<{ ev: EventData; dirty: boolean } | null> {
  const ev = await loadEvent(id);
  if (!ev) return null;
  return { ev, dirty: advanceTimers(ev) };
}

export async function saveEvent(ev: EventData) {
  const raw = JSON.stringify(ev);
  if (raw.length > MAX_EVENT_JSON_BYTES) throw new Error("Событие слишком большое");
  await sql(
    `insert into events (id, data, updated_at) values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [ev.id, raw],
  );
}

export async function createEvent() {
  const count = await sql<{ c: string }>("select count(*)::text as c from events");
  if (Number(count[0]?.c || 0) >= MAX_EVENTS) throw new Error("Сервер занят");
  const ev: EventData = {
    id: nanoid(8),
    hostToken: nanoid(16),
    guestAccessToken: nanoid(18),
    screenToken: nanoid(18),
    phase: "lobby",
    round: 0,
    totalRounds: 5,
    searchSec: 90,
    networkSec: 180,
    questions: [...DEFAULT_QUESTIONS],
    guests: [],
    pairs: [],
    chat: {},
    timer: { kind: null, endsAt: null, totalSec: 0 },
    createdAt: Date.now(),
  };
  await saveEvent(ev);
  return ev;
}

export async function pruneOld() {
  const cutoff = Date.now() - EVENT_TTL_MS;
  await sql("delete from events where (data->>'createdAt')::bigint < $1", [cutoff]);
}

function findGroup(ev: EventData, guestId: string) {
  return ev.pairs.find((p) => p.members.includes(guestId)) || null;
}

export function publicState(ev: EventData, role: "host" | "guest" | "screen", guestId?: string) {
  // Screen needs faces for flying avatars (except networking board); host/guest polls strip bulk photos.
  const screenPhotos = role === "screen" && ev.phase !== "networking";
  const guests =
    role === "guest"
      ? []
      : role === "host"
        ? ev.guests.map((g) => guestPublic(g, false))
        : ev.guests.map((g) => guestPublic(g, screenPhotos));

  const pairs = ev.pairs.map((p) => {
    const members = p.members
      .map((id) => ev.guests.find((g) => g.id === id))
      .filter(Boolean)
      .map((g) => ({
        id: g!.id,
        name: g!.name,
        company: g!.company,
        photoUrl: screenPhotos ? g!.photoUrl : null,
        hasPhoto: Boolean(g!.photoUrl),
      }));
    return {
      id: p.id,
      members,
      a: members[0] || null,
      b: members[1] || null,
      c: members[2] || null,
      size: members.length,
      askerId: p.askerId,
      found: p.found,
      bye: p.bye,
    };
  });

  const base: Record<string, unknown> = {
    id: ev.id,
    phase: ev.phase,
    round: ev.round,
    totalRounds: ev.totalRounds,
    searchSec: ev.searchSec,
    networkSec: ev.networkSec,
    question: ev.round > 0 ? questionForRound(ev) : null,
    guestCount: ev.guests.length,
    guests,
    pairs: role === "guest" ? [] : pairs,
    timer: serializeTimer(ev),
    role,
  };

  if (role === "host") {
    base.questions = ev.questions;
    base.guestAccessToken = ev.guestAccessToken;
    base.screenToken = ev.screenToken;
  }
  if (role === "screen") base.guestAccessToken = ev.guestAccessToken;

  if (role === "guest" && guestId) {
    const me = ev.guests.find((g) => g.id === guestId);
    const pair = findGroup(ev, guestId);
    const partners = pair
      ? pair.members
          .filter((id) => id !== guestId)
          .map((id) => ev.guests.find((g) => g.id === id))
          .filter(Boolean)
          .map((g) => guestPublic(g!, true))
      : [];
    base.me = me ? guestPublic(me, true) : null;
    base.pair = pair
      ? {
          id: pair.id,
          size: pair.members.length,
          partner: partners[0] || null,
          partners,
          askerId: pair.askerId,
          found: pair.found,
          bye: pair.bye,
          amAsker: pair.askerId === guestId,
        }
      : null;
    base.chat = pair ? ev.chat[pair.id] || [] : [];
  }

  return base;
}

function safeDataPhoto(url: unknown) {
  if (typeof url !== "string") return null;
  if (!url.startsWith("data:image/jpeg") && !url.startsWith("data:image/png") && !url.startsWith("data:image/webp")) {
    return null;
  }
  if (url.length > 160_000) return null;
  return url;
}

function normalizeClientKey(raw: unknown) {
  const key = String(raw || "")
    .trim()
    .slice(0, 64);
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(key)) return "";
  return key;
}

export async function hostAction(
  eventId: string,
  hostToken: string,
  action: string,
  settings?: Partial<{ totalRounds: number; searchSec: number; networkSec: number; questions: string[] }>,
) {
  const loaded = await loadEventTicked(eventId);
  if (!loaded || loaded.ev.hostToken !== hostToken) throw new Error("Нет доступа");
  const ev = loaded.ev;
  if (action === "settings" && settings) {
    if (settings.totalRounds != null) ev.totalRounds = Math.min(20, Math.max(1, Number(settings.totalRounds) || 5));
    if (settings.searchSec != null) ev.searchSec = Math.min(600, Math.max(15, Number(settings.searchSec) || 90));
    if (settings.networkSec != null) ev.networkSec = Math.min(900, Math.max(30, Number(settings.networkSec) || 180));
    if (Array.isArray(settings.questions)) {
      ev.questions = settings.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 20);
      if (!ev.questions.length) ev.questions = [...DEFAULT_QUESTIONS];
    }
  } else if (action === "start") {
    if (ev.phase !== "lobby" && ev.phase !== "between") throw new Error("Сейчас нельзя стартовать");
    if (ev.guests.filter((g) => g.ready).length < 2) throw new Error("Нужно минимум 2 гостя");
    ev.round += 1;
    buildPairs(ev);
    ev.phase = "matching";
    ev.timer = { kind: "matching", endsAt: Date.now() + 8_000, totalSec: 8 };
  } else if (action === "skip") {
    if (ev.phase === "matching") {
      ev.phase = "searching";
      ev.timer = { kind: "search", endsAt: Date.now() + ev.searchSec * 1000, totalSec: ev.searchSec };
    } else if (ev.phase === "searching") {
      for (const p of ev.pairs) if (!p.bye) p.found = true;
      ev.phase = "networking";
      ev.timer = { kind: "network", endsAt: Date.now() + ev.networkSec * 1000, totalSec: ev.networkSec };
    } else if (ev.phase === "networking") {
      ev.timer = { kind: null, endsAt: null, totalSec: 0 };
      if (ev.round >= ev.totalRounds) {
        ev.phase = "done";
        ev.pairs = [];
      } else {
        ev.phase = "between";
        ev.pairs = [];
      }
    } else throw new Error("Нечего пропускать");
  } else if (action === "stop") {
    ev.phase = "lobby";
    ev.round = 0;
    ev.pairs = [];
    ev.chat = {};
    ev.timer = { kind: null, endsAt: null, totalSec: 0 };
  } else throw new Error("Неизвестное действие");
  await saveEvent(ev);
  return publicState(ev, "host");
}

const joinLocks = new Map<string, Promise<void>>();

async function withJoinLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = joinLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chain = prev.then(() => gate);
  joinLocks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (joinLocks.get(key) === chain) joinLocks.delete(key);
  }
}

export async function guestJoin(
  eventId: string,
  input: {
    accessKey?: string;
    guestId?: string;
    guestToken?: string;
    clientKey?: string;
    name?: string;
    company?: string;
    photoUrl?: string | null;
  },
) {
  const clientKey = normalizeClientKey(input.clientKey);
  const lockKey = `${eventId}:${clientKey || input.guestId || "anon"}`;
  return withJoinLock(lockKey, () => guestJoinUnlocked(eventId, { ...input, clientKey }));
}

async function guestJoinUnlocked(
  eventId: string,
  input: {
    accessKey?: string;
    guestId?: string;
    guestToken?: string;
    clientKey?: string;
    name?: string;
    company?: string;
    photoUrl?: string | null;
  },
) {
  const loaded = await loadEventTicked(eventId);
  if (!loaded) throw new Error("Событие не найдено");
  const ev = loaded.ev;
  const clientKey = normalizeClientKey(input.clientKey);

  let guest = input.guestId ? ev.guests.find((g) => g.id === input.guestId) : undefined;

  // Token mismatch → treat as unknown (do not create a second profile blindly).
  if (guest && input.guestToken && input.guestToken !== guest.token) {
    guest = undefined;
  }

  // Stable device/session key wins over a missing/stale guestId (rejoin + double-tap).
  if (!guest && clientKey) {
    guest = ev.guests.find((g) => g.clientKey === clientKey);
  }

  if (guest) {
    const tokenOk = Boolean(input.guestToken && input.guestToken === guest.token);
    const keyOk = Boolean(clientKey && guest.clientKey && guest.clientKey === clientKey);
    const accessOk = Boolean(input.accessKey && input.accessKey === ev.guestAccessToken);
    if (!tokenOk && !keyOk && !accessOk) throw new Error("Нет доступа к профилю");
    if (clientKey) guest.clientKey = clientKey;
    if (input.name) guest.name = String(input.name).trim().slice(0, 60);
    if (input.company) guest.company = String(input.company).trim().slice(0, 80);
    if (input.photoUrl === null) {
      /* keep existing */
    } else if (input.photoUrl !== undefined) {
      const photo = safeDataPhoto(input.photoUrl);
      if (photo) guest.photoUrl = photo;
      else if (input.photoUrl === "") guest.photoUrl = null;
    }
    guest.ready = true;
  } else {
    if (!input.accessKey || input.accessKey !== ev.guestAccessToken) throw new Error("Откройте ссылку из QR");
    if (ev.phase !== "lobby" && ev.phase !== "between") throw new Error("Регистрация закрыта");
    if (ev.guests.length >= 650) throw new Error("Зал заполнен");
    const name = String(input.name || "").trim().slice(0, 60);
    const company = String(input.company || "").trim().slice(0, 80);
    if (!name || !company) throw new Error("Нужны имя и компания");
    guest = {
      id: nanoid(10),
      token: nanoid(18),
      clientKey: clientKey || undefined,
      name,
      company,
      photoUrl: safeDataPhoto(input.photoUrl),
      ready: true,
    };
    ev.guests.push(guest);
  }
  await saveEvent(ev);
  return {
    guestId: guest.id,
    guestToken: guest.token,
    state: publicState(ev, "guest", guest.id),
  };
}

export async function guestFound(eventId: string, guestId: string, guestToken: string) {
  const loaded = await loadEventTicked(eventId);
  if (!loaded) throw new Error("Событие не найдено");
  const ev = loaded.ev;
  const guest = ev.guests.find((g) => g.id === guestId);
  if (!guest || guest.token !== guestToken) throw new Error("Нет сессии");
  if (ev.phase !== "searching") throw new Error("Не фаза поиска");
  const pair = findGroup(ev, guestId);
  if (!pair || pair.bye) throw new Error("Нет группы");
  pair.found = true;
  if (ev.pairs.every((p) => p.found || p.bye)) {
    ev.phase = "networking";
    ev.timer = { kind: "network", endsAt: Date.now() + ev.networkSec * 1000, totalSec: ev.networkSec };
  }
  await saveEvent(ev);
  return publicState(ev, "guest", guestId);
}

export async function guestChat(eventId: string, guestId: string, guestToken: string, text: string) {
  const loaded = await loadEventTicked(eventId);
  if (!loaded) throw new Error("Событие не найдено");
  const ev = loaded.ev;
  const guest = ev.guests.find((g) => g.id === guestId);
  if (!guest || guest.token !== guestToken) throw new Error("Нет сессии");
  if (ev.phase !== "searching" && ev.phase !== "networking") throw new Error("Чат недоступен");
  const pair = findGroup(ev, guestId);
  if (!pair || pair.bye) throw new Error("Нет группы");
  const msg: ChatMessage = {
    id: nanoid(6),
    from: guestId,
    fromName: guest.name,
    text: String(text || "").trim().slice(0, 280),
    at: Date.now(),
  };
  if (!msg.text) throw new Error("Пусто");
  const list = ev.chat[pair.id] || [];
  list.push(msg);
  if (list.length > 80) list.splice(0, list.length - 80);
  ev.chat[pair.id] = list;
  await saveEvent(ev);
  return { message: msg, state: publicState(ev, "guest", guestId) };
}

export async function getState(
  eventId: string,
  role: "host" | "guest" | "screen",
  tokens: { hostToken?: string; screenToken?: string; guestId?: string; guestToken?: string },
) {
  const loaded = await loadEventTicked(eventId);
  if (!loaded) throw new Error("Событие не найдено");
  const { ev, dirty } = loaded;
  if (role === "host") {
    if (!tokens.hostToken || tokens.hostToken !== ev.hostToken) throw new Error("Нет доступа");
    if (dirty) await saveEvent(ev);
    return publicState(ev, "host");
  }
  if (role === "screen") {
    if (!tokens.screenToken || tokens.screenToken !== ev.screenToken) throw new Error("Нет доступа");
    if (dirty) await saveEvent(ev);
    return publicState(ev, "screen");
  }
  if (!tokens.guestId || !tokens.guestToken) throw new Error("Нет сессии");
  const guest = ev.guests.find((g) => g.id === tokens.guestId);
  if (!guest || guest.token !== tokens.guestToken) throw new Error("Нет доступа");
  if (dirty) await saveEvent(ev);
  return publicState(ev, "guest", guest.id);
}
