import { nanoid } from "nanoid";
import { sql, withTx, type Query } from "./db";
import { DEFAULT_QUESTIONS, type ChatMessage, type EventData, type Guest, type Group } from "./types";

const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 80;

/** Public URL of a guest photo (small path, browser caches it). */
function photoSrc(g: Guest): string | null {
  if (g.photoId) return `/api/photo/${g.photoId}`;
  return g.photoUrl || null;
}

function guestPublic(g: Guest, withPhoto = true) {
  const src = photoSrc(g);
  return {
    id: g.id,
    name: g.name,
    company: g.company,
    photoUrl: withPhoto ? src : null,
    hasPhoto: Boolean(src),
    ready: g.ready,
  };
}

/** "  Анна  Иванова " / "ООО «Ромашка»" → stable comparison key. */
function personKey(name: string, company: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[«»"'`.,()]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(name)}|${norm(company)}`;
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
/** One avatar after client compression is ~20–40 KB; this is a hard safety cap. */
const MAX_PHOTO_BYTES = 150_000;

const MATCHING_SEC = 8;
const DEFAULT_BREAK_SEC = 20;

function readyGuests(ev: EventData) {
  return ev.guests.filter((g) => g.ready);
}

function breakSecOf(ev: EventData) {
  return ev.breakSec ?? DEFAULT_BREAK_SEC;
}

/** New round: shuffle everyone who is in the game into pairs (or a triple). */
function startRound(ev: EventData) {
  ev.round += 1;
  buildPairs(ev);
  ev.phase = "matching";
  ev.timer = { kind: "matching", endsAt: Date.now() + MATCHING_SEC * 1000, totalSec: MATCHING_SEC };
}

function startNetworking(ev: EventData) {
  for (const p of ev.pairs) if (!p.bye) p.found = true;
  ev.phase = "networking";
  ev.timer = { kind: "network", endsAt: Date.now() + ev.networkSec * 1000, totalSec: ev.networkSec };
}

/** Round over → final screen, or a break that starts the next round by itself. */
function endRound(ev: EventData) {
  ev.pairs = [];
  ev.chat = {};
  if (ev.round >= ev.totalRounds) {
    ev.phase = "done";
    ev.timer = { kind: null, endsAt: null, totalSec: 0 };
    return;
  }
  ev.phase = "between";
  if (ev.autoNext !== false) {
    const sec = breakSecOf(ev);
    ev.timer = { kind: "break", endsAt: Date.now() + sec * 1000, totalSec: sec };
  } else {
    ev.timer = { kind: null, endsAt: null, totalSec: 0 };
  }
}

/** Returns true when phase/timer actually changed. */
function advanceTimers(ev: EventData): boolean {
  if (!ev.timer.endsAt || Date.now() < ev.timer.endsAt) return false;
  if (ev.phase === "matching") {
    ev.phase = "searching";
    ev.timer = { kind: "search", endsAt: Date.now() + ev.searchSec * 1000, totalSec: ev.searchSec };
    return true;
  }
  if (ev.phase === "searching") {
    startNetworking(ev);
    return true;
  }
  if (ev.phase === "networking") {
    endRound(ev);
    return true;
  }
  if (ev.phase === "between") {
    // Break is over: next round starts by itself (needs at least 2 people still in the game).
    if (readyGuests(ev).length >= 2) startRound(ev);
    else ev.timer = { kind: null, endsAt: null, totalSec: 0 };
    return true;
  }
  return false;
}

/** All groups found each other (or are waiting alone) → straight to the conversation. */
function maybeAllFound(ev: EventData) {
  if (ev.phase !== "searching") return;
  if (ev.pairs.length && ev.pairs.every((p) => p.found || p.bye)) startNetworking(ev);
}

/**
 * Put a guest who is not in a group into the running round:
 * first to someone whose partner left, otherwise turn an unfound pair into a triple.
 * During the conversation phase only a lone guest can be joined; else they wait for the next round.
 */
function placeIntoRound(ev: EventData, guestId: string) {
  if (findGroup(ev, guestId)) return;
  if (ev.phase !== "matching" && ev.phase !== "searching" && ev.phase !== "networking") return;
  const lone = ev.pairs.find((p) => p.members.length === 1);
  if (lone) {
    lone.members.push(guestId);
    lone.bye = false;
    lone.partnerLeft = false;
    lone.found = ev.phase === "networking";
    ev.chat[lone.id] ??= [];
    return;
  }
  if (ev.phase === "networking") return;
  const open = shuffle(ev.pairs.filter((p) => !p.bye && !p.found && p.members.length === 2))[0];
  if (open) open.members.push(guestId);
}

/** Take a guest out of their group; a partner left alone is re-homed or waits. */
function removeFromRound(ev: EventData, guestId: string) {
  const group = findGroup(ev, guestId);
  if (!group) return;
  group.members = group.members.filter((id) => id !== guestId);
  if (group.askerId === guestId && group.members[0]) group.askerId = group.members[0];
  if (group.members.length === 0) {
    ev.pairs = ev.pairs.filter((p) => p.id !== group.id);
    delete ev.chat[group.id];
  } else if (group.members.length === 1) {
    const alone = group.members[0];
    const target =
      ev.phase === "matching" || ev.phase === "searching"
        ? ev.pairs.find((p) => p.id !== group.id && !p.bye && !p.found && p.members.length === 2)
        : undefined;
    if (target) {
      target.members.push(alone);
      ev.pairs = ev.pairs.filter((p) => p.id !== group.id);
      delete ev.chat[group.id];
    } else {
      group.bye = true;
      group.partnerLeft = true;
    }
  }
  maybeAllFound(ev);
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

export async function saveEvent(ev: EventData, q: Query = sql) {
  const raw = JSON.stringify(ev);
  if (raw.length > MAX_EVENT_JSON_BYTES) throw new Error("Событие слишком большое");
  await q(
    `insert into events (id, data, updated_at) values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [ev.id, raw],
  );
}

/**
 * Load → change → save under a row lock.
 * Two guests joining (or tapping «нашёл») at the same moment now wait
 * for each other instead of the later save wiping the earlier one.
 */
export async function mutateEvent<T>(
  id: string,
  change: (ev: EventData, q: Query) => Promise<T> | T,
): Promise<T> {
  return withTx(async (q) => {
    const rows = await q<{ data: EventData | string }>("select data from events where id = $1 for update", [id]);
    if (!rows[0]) throw new Error("Событие не найдено");
    const data = rows[0].data;
    const ev = (typeof data === "string" ? JSON.parse(data) : data) as EventData;
    advanceTimers(ev);
    const result = await change(ev, q);
    await saveEvent(ev, q);
    return result;
  });
}

function decodePhoto(dataUrl: string): Buffer | null {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return null;
  return bytes;
}

/** Store a photo in its own row; returns the new id (old one is deleted). */
async function storePhoto(q: Query, ev: EventData, guest: Guest, dataUrl: string) {
  const bytes = decodePhoto(dataUrl);
  if (!bytes) return false;
  const id = nanoid(16);
  await q("insert into photos (id, event_id, data) values ($1, $2, $3)", [id, ev.id, bytes]);
  if (guest.photoId) await q("delete from photos where id = $1", [guest.photoId]);
  guest.photoId = id;
  guest.photoUrl = null;
  return true;
}

export async function loadPhoto(id: string): Promise<Uint8Array | null> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  const rows = await sql<{ data: Uint8Array }>("select data from photos where id = $1", [id]);
  return rows[0]?.data ?? null;
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
    autoNext: true,
    breakSec: DEFAULT_BREAK_SEC,
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
  await sql("delete from photos where event_id not in (select id from events)");
}

function findGroup(ev: EventData, guestId: string) {
  return ev.pairs.find((p) => p.members.includes(guestId)) || null;
}

export function publicState(ev: EventData, role: "host" | "guest" | "screen", guestId?: string) {
  // Screen needs faces for flying avatars (except networking board); host/guest polls strip bulk photos.
  const screenPhotos = role === "screen" && ev.phase !== "networking";
  const inGame = readyGuests(ev);
  const guests =
    role === "guest"
      ? []
      : role === "host"
        ? ev.guests.map((g) => guestPublic(g, false))
        : inGame.map((g) => guestPublic(g, screenPhotos));

  const pairs = ev.pairs.map((p) => {
    const members = p.members
      .map((id) => ev.guests.find((g) => g.id === id))
      .filter(Boolean)
      .map((g) => ({
        id: g!.id,
        name: g!.name,
        company: g!.company,
        photoUrl: screenPhotos ? photoSrc(g!) : null,
        hasPhoto: Boolean(photoSrc(g!)),
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
      partnerLeft: Boolean(p.partnerLeft),
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
    guestCount: inGame.length,
    leftCount: ev.guests.length - inGame.length,
    autoNext: ev.autoNext !== false,
    breakSec: breakSecOf(ev),
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
          partnerLeft: Boolean(pair.partnerLeft),
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

type HostSettings = Partial<{
  totalRounds: number;
  searchSec: number;
  networkSec: number;
  questions: string[];
  autoNext: boolean;
  breakSec: number;
}>;

export async function hostAction(
  eventId: string,
  hostToken: string,
  action: string,
  settings?: HostSettings,
) {
  return mutateEvent(eventId, (ev) => {
    if (ev.hostToken !== hostToken) throw new Error("Нет доступа");
    applyHostAction(ev, action, settings);
    return publicState(ev, "host");
  });
}

function applyHostAction(
  ev: EventData,
  action: string,
  settings?: HostSettings,
) {
  if (action === "settings" && settings) {
    if (settings.totalRounds != null) ev.totalRounds = Math.min(20, Math.max(1, Number(settings.totalRounds) || 5));
    if (settings.searchSec != null) ev.searchSec = Math.min(600, Math.max(15, Number(settings.searchSec) || 90));
    if (settings.networkSec != null) ev.networkSec = Math.min(900, Math.max(30, Number(settings.networkSec) || 180));
    if (settings.autoNext != null) {
      ev.autoNext = Boolean(settings.autoNext);
      // Switching auto on during a break starts the countdown; off stops it.
      if (ev.phase === "between") {
        const sec = breakSecOf(ev);
        ev.timer = ev.autoNext
          ? { kind: "break", endsAt: Date.now() + sec * 1000, totalSec: sec }
          : { kind: null, endsAt: null, totalSec: 0 };
      }
    }
    if (settings.breakSec != null) ev.breakSec = Math.min(300, Math.max(5, Number(settings.breakSec) || DEFAULT_BREAK_SEC));
    if (Array.isArray(settings.questions)) {
      ev.questions = settings.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 20);
      if (!ev.questions.length) ev.questions = [...DEFAULT_QUESTIONS];
    }
  } else if (action === "start") {
    if (ev.phase !== "lobby" && ev.phase !== "between") throw new Error("Сейчас нельзя стартовать");
    if (readyGuests(ev).length < 2) throw new Error("Нужно минимум 2 гостя");
    startRound(ev);
  } else if (action === "skip") {
    if (ev.phase === "matching") {
      ev.phase = "searching";
      ev.timer = { kind: "search", endsAt: Date.now() + ev.searchSec * 1000, totalSec: ev.searchSec };
    } else if (ev.phase === "searching") {
      startNetworking(ev);
    } else if (ev.phase === "networking") {
      endRound(ev);
    } else if (ev.phase === "between") {
      if (readyGuests(ev).length < 2) throw new Error("Нужно минимум 2 гостя");
      startRound(ev);
    } else throw new Error("Нечего пропускать");
  } else if (action === "stop") {
    ev.phase = "lobby";
    ev.round = 0;
    ev.pairs = [];
    ev.chat = {};
    ev.timer = { kind: null, endsAt: null, totalSec: 0 };
  } else throw new Error("Неизвестное действие");
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
  const clientKey = normalizeClientKey(input.clientKey);
  return mutateEvent(eventId, async (ev, q) => {
    let guest = input.guestId ? ev.guests.find((g) => g.id === input.guestId) : undefined;

    // Token mismatch → treat as unknown (do not create a second profile blindly).
    if (guest && input.guestToken && input.guestToken !== guest.token) {
      guest = undefined;
    }

    // Stable device/session key wins over a missing/stale guestId (rejoin + double-tap).
    if (!guest && clientKey) {
      guest = ev.guests.find((g) => g.clientKey === clientKey);
    }

    const accessOk = Boolean(input.accessKey && input.accessKey === ev.guestAccessToken);
    const name = String(input.name || "").trim().slice(0, 60);
    const company = String(input.company || "").trim().slice(0, 80);

    // Same person from another browser (Telegram/Instagram in-app browser → Safari),
    // incognito or a cleared phone: same name + company in this event = same profile.
    if (!guest && accessOk && name && company) {
      const key = personKey(name, company);
      guest = ev.guests.find((g) => personKey(g.name, g.company) === key);
      if (guest && clientKey) guest.clientKey = clientKey;
    }

    if (guest) {
      const tokenOk = Boolean(input.guestToken && input.guestToken === guest.token);
      const keyOk = Boolean(clientKey && guest.clientKey && guest.clientKey === clientKey);
      if (!tokenOk && !keyOk && !accessOk) throw new Error("Нет доступа к профилю");
      if (clientKey) guest.clientKey = clientKey;
      if (name) guest.name = name;
      if (company) guest.company = company;
      if (typeof input.photoUrl === "string") {
        const photo = safeDataPhoto(input.photoUrl);
        if (photo) {
          await storePhoto(q, ev, guest, photo);
        } else if (input.photoUrl === "") {
          if (guest.photoId) await q("delete from photos where id = $1", [guest.photoId]);
          guest.photoId = null;
          guest.photoUrl = null;
        }
      }
      // Only the explicit «Войти» form brings someone who pressed «Выйти» back;
      // page reloads and photo updates leave their status as it is.
      if (name && !guest.ready) {
        guest.ready = true;
        placeIntoRound(ev, guest.id);
      }
    } else {
      if (!accessOk) throw new Error("Откройте ссылку из QR");
      if (ev.guests.length >= 650) throw new Error("Зал заполнен");
      if (!name || !company) throw new Error("Нужны имя и компания");
      guest = {
        id: nanoid(10),
        token: nanoid(18),
        clientKey: clientKey || undefined,
        name,
        company,
        photoId: null,
        ready: true,
      };
      ev.guests.push(guest);
      const photo = safeDataPhoto(input.photoUrl);
      if (photo) await storePhoto(q, ev, guest, photo);
      // Joined while a round is running → straight into a group if there is room.
      placeIntoRound(ev, guest.id);
    }
    return {
      guestId: guest.id,
      guestToken: guest.token,
      state: publicState(ev, "guest", guest.id),
    };
  });
}

export async function guestFound(eventId: string, guestId: string, guestToken: string) {
  return mutateEvent(eventId, (ev) => {
    const guest = ev.guests.find((g) => g.id === guestId);
    if (!guest || guest.token !== guestToken) throw new Error("Нет сессии");
    if (ev.phase !== "searching") throw new Error("Не фаза поиска");
    const pair = findGroup(ev, guestId);
    if (!pair || pair.bye) throw new Error("Нет группы");
    pair.found = true;
    maybeAllFound(ev);
    return publicState(ev, "guest", guestId);
  });
}

/** «Выйти» / «Вернуться в игру» — the profile stays, only the participation changes. */
export async function guestPresence(
  eventId: string,
  guestId: string,
  guestToken: string,
  action: "leave" | "return",
) {
  return mutateEvent(eventId, (ev) => {
    const guest = ev.guests.find((g) => g.id === guestId);
    if (!guest || guest.token !== guestToken) throw new Error("Нет сессии");
    if (action === "leave") {
      guest.ready = false;
      removeFromRound(ev, guest.id);
    } else {
      guest.ready = true;
      placeIntoRound(ev, guest.id);
    }
    return publicState(ev, "guest", guestId);
  });
}

export async function guestChat(eventId: string, guestId: string, guestToken: string, text: string) {
  return mutateEvent(eventId, (ev) => {
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
    return { message: msg, state: publicState(ev, "guest", guestId) };
  });
}

function stateFor(
  ev: EventData,
  role: "host" | "guest" | "screen",
  tokens: { hostToken?: string; screenToken?: string; guestId?: string; guestToken?: string },
) {
  if (role === "host") {
    if (!tokens.hostToken || tokens.hostToken !== ev.hostToken) throw new Error("Нет доступа");
    return publicState(ev, "host");
  }
  if (role === "screen") {
    if (!tokens.screenToken || tokens.screenToken !== ev.screenToken) throw new Error("Нет доступа");
    return publicState(ev, "screen");
  }
  if (!tokens.guestId || !tokens.guestToken) throw new Error("Нет сессии");
  const guest = ev.guests.find((g) => g.id === tokens.guestId);
  if (!guest || guest.token !== tokens.guestToken) throw new Error("Нет доступа");
  return publicState(ev, "guest", guest.id);
}

export async function getState(
  eventId: string,
  role: "host" | "guest" | "screen",
  tokens: { hostToken?: string; screenToken?: string; guestId?: string; guestToken?: string },
) {
  // Polls are read-only and lock-free; only a due timer switch takes the lock.
  const loaded = await loadEventTicked(eventId);
  if (!loaded) throw new Error("Событие не найдено");
  if (!loaded.dirty) return stateFor(loaded.ev, role, tokens);
  return mutateEvent(eventId, (ev) => stateFor(ev, role, tokens));
}
