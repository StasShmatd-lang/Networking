export type Phase = "lobby" | "matching" | "searching" | "networking" | "between" | "done";

export type Guest = {
  id: string;
  name: string;
  company: string;
  photoUrl: string | null;
  ready?: boolean;
};

export type PairView = {
  id: string;
  a: Guest | null;
  b: Guest | null;
  askerId: string;
  found: boolean;
  bye: boolean;
};

export type TimerState = {
  kind: string | null;
  remainingMs: number;
  totalSec: number;
  running: boolean;
};

export type ChatMessage = {
  id: string;
  from: string;
  text: string;
  at: number;
};

export type EventState = {
  id: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  searchSec: number;
  networkSec: number;
  questions: string[];
  question: string | null;
  guestCount: number;
  guests: Guest[];
  pairs: PairView[];
  timer: TimerState;
  role?: string;
  me?: Guest | null;
  pair?: {
    id: string;
    partner: Guest | null;
    askerId: string;
    found: boolean;
    bye: boolean;
    amAsker: boolean;
  } | null;
  chat?: ChatMessage[];
};
