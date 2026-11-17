import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandFooter } from "../components/BrandFooter";

export function HomePage() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createEvent() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/events", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      sessionStorage.setItem(`hostToken:${data.id}`, data.hostToken);
      nav(`/host/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell flex flex-col">
      <div className="flex flex-1 flex-col justify-center gap-8 animate-reveal">
        <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mx-auto" />
        <div className="text-center">
          <h1 className="display text-3xl font-semibold leading-tight text-mist sm:text-4xl">
            Нетворкинг знакомств
          </h1>
          <p className="mt-3 text-base text-mute">
            QR → профиль → пара → поиск → разговор с одним вопросом.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button type="button" className="btn-gold w-full" disabled={busy} onClick={createEvent}>
            {busy ? "Создаём…" : "Создать событие"}
          </button>
          {err && <p className="text-center text-sm text-signal">{err}</p>}
        </div>
        <div
          className="relative mx-auto h-44 w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--line)]"
          aria-hidden
        >
          <div className="absolute inset-0 bg-gradient-to-br from-gold/20 via-transparent to-teal/25" />
          <div className="absolute left-[12%] top-[22%] h-16 w-16 animate-float rounded-full bg-gold/30 blur-[1px]" />
          <div
            className="absolute right-[18%] top-[38%] h-12 w-12 animate-float rounded-full bg-teal/40"
            style={{ animationDelay: "1.2s" }}
          />
          <div
            className="absolute bottom-[18%] left-[40%] h-14 w-14 animate-float rounded-full bg-signal/35"
            style={{ animationDelay: "0.6s" }}
          />
        </div>
      </div>
      <BrandFooter />
    </div>
  );
}
