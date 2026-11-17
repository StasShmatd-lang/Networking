"use client";

import { useEffect, useState } from "react";

type Timer = { kind: string | null; remainingMs: number; totalSec: number; running: boolean };

function formatMs(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function TimerDisplay({ timer, large = false }: { timer: Timer; large?: boolean }) {
  const [remaining, setRemaining] = useState(timer.remainingMs);

  useEffect(() => {
    setRemaining(timer.remainingMs);
    if (!timer.running) return;
    const started = Date.now();
    const base = timer.remainingMs;
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, base - (Date.now() - started)));
    }, 200);
    return () => window.clearInterval(id);
  }, [timer.remainingMs, timer.running, timer.kind, timer.totalSec]);

  const pct = timer.totalSec > 0 ? Math.max(0, Math.min(1, remaining / (timer.totalSec * 1000))) : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={large ? "timer-big" : "display text-4xl font-semibold tabular-nums"} style={{ color: "var(--gold-bright)" }}>
        {formatMs(remaining)}
      </div>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full" style={{ background: "var(--lift)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{ width: `${pct * 100}%`, background: "linear-gradient(90deg, #2A9D8F, #C9A66B)" }}
        />
      </div>
    </div>
  );
}
