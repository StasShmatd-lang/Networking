import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { FlyingAvatars } from "../components/FlyingAvatars";
import { HallQr } from "../components/HallQr";
import { PairBoard } from "../components/PairBoard";
import { TimerDisplay } from "../components/TimerDisplay";
import { useEventSocket } from "../hooks/useEventSocket";
import { useLinkBase } from "../hooks/useLinkBase";
import { getSocket } from "../socket";

const PHASE_TITLE: Record<string, string> = {
  lobby: "Сканируйте QR и входите в зал",
  matching: "Перемешиваем знакомства",
  searching: "Найдите свою пару",
  networking: "Говорите по вопросу раунда",
  between: "Пауза — готовьтесь к следующему раунду",
  done: "Спасибо за нетворкинг",
};

export function ScreenPage() {
  const { eventId = "" } = useParams();
  const base = useLinkBase();
  const { state, connected } = useEventSocket(eventId, "screen");
  const joinUrl = useMemo(() => (eventId ? `${base}/join/${eventId}` : ""), [base, eventId]);

  useEffect(() => {
    if (!eventId) return;
    getSocket().emit("screen:join", { eventId });
  }, [eventId]);

  const phase = state?.phase || "lobby";
  const waiting = phase === "lobby" || phase === "between" || phase === "done";
  const showFly = phase === "lobby" || phase === "matching" || phase === "searching" || phase === "between";
  const showPairs = phase === "networking";

  return (
    <div className="shell-hall">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(201,166,107,0.12),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(42,157,143,0.14),transparent_35%)]" />

      {showFly && <FlyingAvatars guests={state?.guests || []} />}

      <header className="relative z-10 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mb-4 h-14 md:h-16" />
          <h1 className="display max-w-3xl text-4xl font-semibold leading-tight text-mist md:text-6xl">
            {PHASE_TITLE[phase] || phase}
          </h1>
          {state?.question && phase === "networking" && (
            <p className="mt-4 max-w-3xl text-2xl text-gold-bright md:text-3xl">{state.question}</p>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-panel/70 px-5 py-4 text-right backdrop-blur">
          <div className="text-sm uppercase tracking-[0.2em] text-mute">Гостей</div>
          <div className="display text-5xl text-mist">{state?.guestCount ?? 0}</div>
          <div className="mt-1 text-sm text-mute">
            {connected ? "live" : "…"} · р.{state?.round ?? 0}/{state?.totalRounds ?? "—"}
          </div>
        </div>
      </header>

      <main className="relative z-10 mt-10">
        {waiting && joinUrl && (
          <div className="mb-12 flex flex-col items-center gap-5 text-center animate-reveal">
            <HallQr joinUrl={joinUrl} />
            <p className="max-w-2xl text-xl text-mute md:text-2xl">
              {phase === "lobby"
                ? "Транслируйте этот экран гостям. Нажмите QR — он станет крупным для скана с зала."
                : "QR снова здесь: опоздавшие могут войти в паузу."}
            </p>
          </div>
        )}

        {state?.timer?.kind && (phase === "searching" || phase === "networking" || phase === "matching") && (
          <div className="mb-10 flex justify-center">
            <div className="rounded-3xl border border-[var(--line)] bg-panel/60 px-10 py-6 backdrop-blur">
              <TimerDisplay timer={state.timer} large />
            </div>
          </div>
        )}

        {showPairs && state?.pairs && <PairBoard pairs={state.pairs} />}
      </main>

      <footer className="absolute bottom-6 left-8 z-10 opacity-60">
        <img src="/brand/logo.png" alt="" className="h-7 w-auto" />
      </footer>
    </div>
  );
}
