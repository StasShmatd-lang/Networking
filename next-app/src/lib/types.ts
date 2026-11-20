export type Phase = "lobby" | "matching" | "searching" | "networking" | "between" | "done";

export type Guest = {
  id: string;
  token: string;
  /** Stable browser/session key — prevents duplicate profiles on rejoin/double-tap. */
  clientKey?: string;
  name: string;
  company: string;
  /** Photo stored in the `photos` table, served at /api/photo/:id. */
  photoId?: string | null;
  /** Legacy inline data-URL from older events (kept readable, never written). */
  photoUrl?: string | null;
  ready: boolean;
};

export type Group = {
  id: string;
  members: string[];
  askerId: string;
  found: boolean;
  bye: boolean;
};

export type ChatMessage = {
  id: string;
  from: string;
  fromName: string;
  text: string;
  at: number;
};

export type EventData = {
  id: string;
  hostToken: string;
  guestAccessToken: string;
  screenToken: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  searchSec: number;
  networkSec: number;
  questions: string[];
  guests: Guest[];
  pairs: Group[];
  chat: Record<string, ChatMessage[]>;
  timer: { kind: string | null; endsAt: number | null; totalSec: number };
  createdAt: number;
};

export const DEFAULT_QUESTIONS = [
  "Чем я могу быть полезен?",
  "Какой проект сейчас главный?",
  "Кого из зала тебе стоит познакомить с кем?",
  "Какую одну встречу ты хочешь устроить после события?",
  "Что ты ищешь: клиенты, партнёры, люди в команду?",
];
