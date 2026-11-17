"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FlyingAvatars } from "@/components/FlyingAvatars";
import { HallQr } from "@/components/HallQr";
import { PairBoard } from "@/components/PairBoard";
import { TimerDisplay } from "@/components/TimerDisplay";
import { readJson } from "@/lib/apiClient";
import { usePollState } from "@/hooks/usePollState";

const PHASE_TITLE: Record<string, string> = {
  lobby: "Сканируйте QR и входите в зал",
  matching: "Перемешиваем знакомства",
  searching: "Найдите свою пару",
  networking: "Говорите по вопросу раунда",
  between: "Пауза — готовьтесь к следующему раунду",
  done: "Спасибо за нетворкинг",
};

export default function ScreenInner() {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const search = useSearchParams();
  const [screenToken, setScreenToken] = useState("");
  const [base, setBase] = useState("");

  useEffect(() => {
    const s = search.get("s") || sessionStorage.getItem(`screenToken:${eventId}`) || "";
    if (s) sessionStorage.setItem(`screenToken:${eventId}`, s);
    setScreenToken(s);
  }, [eventId, search]);

  useEffect(() => {
    fetch("/api/link-base")
      .then((r) => readJson<{ linkBase: string }>(r))
      .then((d) => setBase(d.linkBase))
      .catch(() => setBase(window.location.origin));
  }, []);

  const q = screenToken
    ? `eventId=${encodeURIComponent(eventId)}&role=screen&screenToken=${encodeURIComponent(screenToken)}`
    : null;
  const { state, error } = usePollState(q, Boolean(screenToken));

  const joinUrl = useMemo(() => {
    const k = state?.guestAccessToken;
    return k ? `${base}/join/${eventId}?k=${encodeURIComponent(String(k))}` : "";
  }, [base, eventId, state?.guestAccessToken]);

  const phase = String(state?.phase || "lobby");
  const waiting = phase === "lobby" || phase === "between" || phase === "done";
  const showFly = phase === "lobby" || phase === "matching" || phase === "searching" || phase === "between";
  const showPairs = phase === "networking";
  const timer = state?.timer as { kind: string | null; remainingMs: number; totalSec: number; running: boolean } | undefined;
  const guests = (state?.guests as { id: string; name: string; photoUrl?: string | null }[]) || [];
  const pairs = (state?.pairs as Parameters<typeof PairBoard>[0]["pairs"]) || [];

  if (!screenToken || (!state && error)) {
    return (
      <div className="shell-hall flex items-center justify-center">
        <p className="max-w-md text-center text-xl" style={{ color: "var(--mute)" }}>
          {error || (!screenToken ? "Откройте экран по ссылке из панели ведущего" : "Подключаем экран зала…")}
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="shell-hall flex items-center justify-center">
        <p className="text-xl" style={{ color: "var(--mute)" }}>
          Подключаем экран зала…
        </p>
      </div>
    );
  }

  return (
    <div className="shell-hall">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(201,166,107,0.12),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(42,157,143,0.14),transparent_35%)]" />
      {showFly && <FlyingAvatars guests={guests} />}
      <header className="relative z-10 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mb-4 h-14 md:h-16" />
          <h1 className="display max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            {PHASE_TITLE[phase] || phase}
          </h1>
          {typeof state.question === "string" && phase === "networking" && (
            <p className="mt-4 max-w-3xl text-2xl md:text-3xl" style={{ color: "var(--gold-bright)" }}>
              {state.question}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-4">
          {waiting && joinUrl && <HallQr joinUrl={joinUrl} />}
          <div className="rounded-2xl border px-5 py-4 text-right backdrop-blur" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--panel) 70%, transparent)" }}>
            <div className="text-sm uppercase tracking-[0.2em]" style={{ color: "var(--mute)" }}>
              Гостей
            </div>
            <div className="display text-5xl">{String(state.guestCount ?? 0)}</div>
            <div className="mt-1 text-sm" style={{ color: "var(--mute)" }}>
              live · р.{String(state.round ?? 0)}/{String(state.totalRounds ?? "—")}
            </div>
          </div>
        </div>
      </header>
      <main className="relative z-10 mt-10">
        {timer?.kind && (phase === "searching" || phase === "networking" || phase === "matching") && (
          <div className="mb-10 flex justify-center">
            <div className="rounded-3xl border px-10 py-6 backdrop-blur" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--panel) 60%, transparent)" }}>
              <TimerDisplay timer={timer} large />
            </div>
          </div>
        )}
        {showPairs && <PairBoard pairs={pairs} />}
      </main>
      <footer className="absolute bottom-6 left-8 z-10 opacity-60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="" className="h-7 w-auto" />
      </footer>
    </div>
  );
}
