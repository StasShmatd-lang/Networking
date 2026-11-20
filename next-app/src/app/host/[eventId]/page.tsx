"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useParams } from "next/navigation";
import { BrandFooter } from "@/components/BrandFooter";
import { readJson } from "@/lib/apiClient";
import { usePollState } from "@/hooks/usePollState";

export default function HostPage() {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const [hostToken] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(`hostToken:${eventId}`) || "" : "",
  );
  const pollAuth = hostToken ? { eventId, role: "host" as const, token: hostToken } : null;
  const { state, error, setError } = usePollState(pollAuth, Boolean(hostToken));
  const [msg, setMsg] = useState<string | null>(null);
  const [questionsText, setQuestionsText] = useState("");
  const [totalRounds, setTotalRounds] = useState(5);
  const [searchSec, setSearchSec] = useState(90);
  const [networkSec, setNetworkSec] = useState(180);
  const [base, setBase] = useState("");

  useEffect(() => {
    if (!hostToken) setError("Нет ключа ведущего. Создайте событие с главной.");
  }, [hostToken, setError]);

  useEffect(() => {
    // Same-origin only — never invent an external host (avoids wrong CDN/Vercel URLs).
    setBase(window.location.origin);
  }, []);

  useEffect(() => {
    if (!state) return;
    setQuestionsText(((state.questions as string[]) || []).join("\n"));
    setTotalRounds(Number(state.totalRounds) || 5);
    setSearchSec(Number(state.searchSec) || 90);
    setNetworkSec(Number(state.networkSec) || 180);
    if (state.screenToken) sessionStorage.setItem(`screenToken:${eventId}`, String(state.screenToken));
  }, [state?.id, eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinUrl = useMemo(() => {
    const k = state?.guestAccessToken;
    return k ? `${base}/join/${eventId}?k=${encodeURIComponent(String(k))}` : "";
  }, [base, eventId, state?.guestAccessToken]);

  const screenToken = String(
    state?.screenToken ||
      (typeof window !== "undefined" ? sessionStorage.getItem(`screenToken:${eventId}`) : "") ||
      "",
  );

  /** Relative path + hash; plain <a> keeps the hash (Next <Link> drops it). */
  const screenHref = screenToken
    ? `/screen/${eventId}#s=${encodeURIComponent(screenToken)}`
    : `/screen/${eventId}`;

  function openHallScreen() {
    if (screenToken) sessionStorage.setItem(`screenToken:${eventId}`, screenToken);
  }

  async function act(action: string, settings?: object) {
    const res = await fetch("/api/host", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({ eventId, action, settings }),
    });
    const data = await readJson<{ ok?: boolean; error?: string }>(res);
    setMsg(data.ok ? "Готово" : data.error || "Ошибка");
  }

  return (
    <div className="shell-wide">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mb-5 h-14" />
          <h1 className="display text-3xl font-semibold">Нетворкинг · ведущий</h1>
          <p style={{ color: "var(--mute)" }}>событие {eventId}</p>
        </div>
        <div className="flex gap-2">
          <a
            className="btn-ghost"
            href={screenHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={openHallScreen}
          >
            Экран зала
          </a>
          <Link className="btn-ghost" href="/">
            На главную
          </Link>
        </div>
      </header>
      {(error || msg) && (
        <p className="mb-4 text-sm" style={{ color: error ? "var(--signal)" : "var(--teal)" }}>
          {error || msg}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="panel space-y-4">
          <h2 className="display text-lg" style={{ color: "var(--gold-bright)" }}>
            QR гостя
          </h2>
          {joinUrl && (
            <div className="mx-auto w-fit rounded-2xl bg-[var(--mist)] p-3">
              <QRCodeSVG value={joinUrl} size={200} bgColor="#E7ECF4" fgColor="#050608" />
            </div>
          )}
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--lift)" }}>
            <div style={{ color: "var(--mute)" }}>Гостей</div>
            <div className="display text-3xl">{String(state?.guestCount ?? 0)}</div>
            <div style={{ color: "var(--mute)" }}>
              {String(state?.phase || "…")} · р.{String(state?.round ?? 0)}/{String(state?.totalRounds ?? "—")}
            </div>
          </div>
        </aside>
        <section className="space-y-6">
          <div className="panel space-y-4">
            <h2 className="display text-lg" style={{ color: "var(--gold-bright)" }}>
              Управление
            </h2>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-gold" onClick={() => act("start")}>
                Старт раунда
              </button>
              <button type="button" className="btn-ghost" onClick={() => act("skip")}>
                Следующая фаза
              </button>
              <button type="button" className="btn-signal" onClick={() => act("stop")}>
                Стоп / сброс
              </button>
            </div>
          </div>
          <div className="panel space-y-4">
            <h2 className="display text-lg" style={{ color: "var(--gold-bright)" }}>
              Настройки
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label>
                <span className="label">Раундов</span>
                <input className="field" type="number" value={totalRounds} onChange={(e) => setTotalRounds(Number(e.target.value))} />
              </label>
              <label>
                <span className="label">Поиск, сек</span>
                <input className="field" type="number" value={searchSec} onChange={(e) => setSearchSec(Number(e.target.value))} />
              </label>
              <label>
                <span className="label">Нетворкинг, сек</span>
                <input className="field" type="number" value={networkSec} onChange={(e) => setNetworkSec(Number(e.target.value))} />
              </label>
            </div>
            <label>
              <span className="label">Вопросы</span>
              <textarea className="field min-h-[140px]" value={questionsText} onChange={(e) => setQuestionsText(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                act("settings", {
                  totalRounds,
                  searchSec,
                  networkSec,
                  questions: questionsText.split("\n").map((q) => q.trim()).filter(Boolean),
                })
              }
            >
              Сохранить настройки
            </button>
          </div>
        </section>
      </div>
      <BrandFooter />
    </div>
  );
}
