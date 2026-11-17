"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { BrandFooter } from "@/components/BrandFooter";
import { TimerDisplay } from "@/components/TimerDisplay";
import { readJson } from "@/lib/apiClient";
import { fileToDataUrl } from "@/lib/photo";
import { usePollState } from "@/hooks/usePollState";

type ChatMsg = { id: string; from: string; fromName?: string; text: string; at: number };
type Guest = { id: string; name: string; company: string; photoUrl?: string | null };
type Pair = {
  id: string;
  size: number;
  partners: Guest[];
  partner?: Guest | null;
  askerId: string;
  found: boolean;
  bye: boolean;
  amAsker: boolean;
};

export default function JoinInner() {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const search = useSearchParams();
  const accessKeyFromUrl = search.get("k") || "";
  const accessKeyStorage = `guestAccess:${eventId}`;
  const storageKey = `guest:${eventId}`;
  const tokenKey = `guestToken:${eventId}`;

  const [accessKey, setAccessKey] = useState("");
  const [guestId, setGuestId] = useState("");
  const [guestToken, setGuestToken] = useState("");
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [chatText, setChatText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = accessKeyFromUrl || localStorage.getItem(accessKeyStorage) || "";
    if (accessKeyFromUrl) localStorage.setItem(accessKeyStorage, accessKeyFromUrl);
    setAccessKey(k);
    setGuestId(localStorage.getItem(storageKey) || "");
    setGuestToken(localStorage.getItem(tokenKey) || "");
  }, [accessKeyFromUrl, accessKeyStorage, storageKey, tokenKey]);

  const pollAuth = useMemo(() => {
    if (!joined || !guestId || !guestToken) return null;
    return { eventId, role: "guest" as const, token: guestToken, guestId };
  }, [joined, guestId, guestToken, eventId]);

  const { state, error, setError, setState } = usePollState(pollAuth, joined);

  useEffect(() => {
    const chat = (state?.chat as ChatMsg[] | undefined) || [];
    if (chat.length) chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.chat]);

  useEffect(() => {
    if (!eventId || !guestId || !guestToken || joined) return;
    (async () => {
      try {
        const res = await fetch("/api/guest/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId, guestId, guestToken }),
        });
        const data = await readJson<{
          ok?: boolean;
          guestId?: string;
          guestToken?: string;
          state?: Record<string, unknown>;
          error?: string;
        }>(res);
        if (!res.ok || !data.ok) {
          localStorage.removeItem(storageKey);
          localStorage.removeItem(tokenKey);
          setGuestId("");
          setGuestToken("");
          return;
        }
        if (data.guestId) {
          setGuestId(data.guestId);
          localStorage.setItem(storageKey, data.guestId);
        }
        if (data.guestToken) {
          setGuestToken(data.guestToken);
          localStorage.setItem(tokenKey, data.guestToken);
        }
        if (data.state) setState(data.state);
        setJoined(true);
      } catch {
        /* stay on form */
      }
    })();
  }, [eventId, guestId, guestToken, joined, storageKey, tokenKey, setState]);

  async function onPhoto(file: File | null) {
    if (!file) return;
    if (!accessKey) {
      setFormError("Откройте страницу по QR — без ключа фото не загрузить");
      return;
    }
    setUploading(true);
    setFormError(null);
    try {
      setPhotoUrl(await fileToDataUrl(file));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Ошибка фото");
    } finally {
      setUploading(false);
    }
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    if (!accessKey && !guestToken) {
      setFormError("Откройте ссылку из QR события");
      return;
    }
    setFormError(null);
    try {
      const res = await fetch("/api/guest/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId,
          guestId: guestId || undefined,
          guestToken: guestToken || undefined,
          accessKey: accessKey || undefined,
          name,
          company,
          photoUrl,
        }),
      });
      const data = await readJson<{
        ok?: boolean;
        guestId?: string;
        guestToken?: string;
        state?: Record<string, unknown>;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Не удалось войти");
      if (data.guestId) {
        setGuestId(data.guestId);
        localStorage.setItem(storageKey, data.guestId);
      }
      if (data.guestToken) {
        setGuestToken(data.guestToken);
        localStorage.setItem(tokenKey, data.guestToken);
      }
      if (data.state) setState(data.state);
      setJoined(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Не удалось войти");
    }
  }

  async function markFound() {
    const res = await fetch("/api/guest/found", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${guestToken}`,
        "x-guest-id": guestId,
      },
      body: JSON.stringify({ eventId, guestId }),
    });
    const data = await readJson<{ ok?: boolean; error?: string; state?: Record<string, unknown> }>(res);
    if (!res.ok || data.error) setError(data.error || "Не удалось");
    else if (data.state) setState(data.state);
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    const res = await fetch("/api/guest/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${guestToken}`,
        "x-guest-id": guestId,
      },
      body: JSON.stringify({ eventId, guestId, text }),
    });
    const data = await readJson<{ ok?: boolean; error?: string; state?: Record<string, unknown> }>(res);
    if (!res.ok || data.error) {
      setError(data.error || "Чат недоступен");
      return;
    }
    if (data.state) setState(data.state);
    setChatText("");
  }

  const me = state?.me as Guest | undefined;
  const pair = state?.pair as Pair | null | undefined;
  const partners = pair?.partners?.length ? pair.partners : pair?.partner ? [pair.partner] : [];
  const phase = String(state?.phase || "lobby");
  const isTriple = (pair?.size || partners.length + 1) >= 3;
  const chat = ((state?.chat as ChatMsg[]) || []);
  const timer = state?.timer as { kind: string | null; remainingMs: number; totalSec: number; running: boolean } | undefined;

  if (!joined || !me) {
    return (
      <div className="shell flex flex-col">
        <div className="flex flex-1 flex-col justify-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mx-auto" />
          <div className="text-center">
            <h1 className="display text-3xl font-semibold">Вход в зал</h1>
            <p className="mt-2" style={{ color: "var(--mute)" }}>
              Фото, имя и компания — и вы в игре.
            </p>
          </div>
          {!accessKey && (
            <p className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(232,87,58,0.4)", background: "rgba(232,87,58,0.1)", color: "var(--signal)" }}>
              Откройте эту страницу по QR с экрана зала — иначе вход и фото недоступны.
            </p>
          )}
          <form className="space-y-4" onSubmit={register}>
            <label className="block">
              <span className="label">Фото</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="field file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--gold)] file:px-3 file:py-1.5 file:text-black"
                onChange={(e) => onPhoto(e.target.files?.[0] || null)}
              />
              {uploading && (
                <span className="mt-1 block text-xs" style={{ color: "var(--mute)" }}>
                  Обработка…
                </span>
              )}
              {photoUrl && (
                <div className="mt-3 flex justify-center">
                  <Avatar name={name || "Вы"} photoUrl={photoUrl} size={88} />
                </div>
              )}
            </label>
            <label className="block">
              <span className="label">Имя</span>
              <input className="field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" />
            </label>
            <label className="block">
              <span className="label">Компания</span>
              <input className="field" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Где работаете" />
            </label>
            {formError && (
              <p className="text-sm" style={{ color: "var(--signal)" }}>
                {formError}
              </p>
            )}
            <button type="submit" className="btn-gold w-full" disabled={uploading}>
              Войти
            </button>
          </form>
        </div>
        <BrandFooter />
      </div>
    );
  }

  return (
    <div className="shell flex flex-col">
      <header className="mb-6 flex items-center justify-between gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="Schmidt" className="h-8 w-auto object-contain" />
        <div className="text-right text-xs" style={{ color: "var(--mute)" }}>
          <div>в сети</div>
          <div>
            {phase} · р.{String(state?.round)}/{String(state?.totalRounds)}
          </div>
        </div>
      </header>

      {(error || formError) && (
        <p className="mb-3 text-sm" style={{ color: "var(--signal)" }}>
          {error || formError}
        </p>
      )}

      {(phase === "lobby" || phase === "between") && (
        <section className="panel text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <Avatar name={me.name} photoUrl={me.photoUrl} size={96} />
          </div>
          <h1 className="display text-2xl">{me.name}</h1>
          <p style={{ color: "var(--mute)" }}>{me.company}</p>
          <p className="mt-4 text-sm" style={{ color: "var(--gold-bright)" }}>
            {phase === "lobby" ? "Ждём старта от ведущего. Держите телефон под рукой." : "Пауза. Скоро новый раунд."}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--mute)" }}>
            В зале: {String(state?.guestCount)}
          </p>
        </section>
      )}

      {phase === "matching" && (
        <section className="panel text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <Avatar name={me.name} photoUrl={me.photoUrl} size={96} />
          </div>
          <h1 className="display text-2xl">Ищем пару…</h1>
          <p className="mt-2" style={{ color: "var(--mute)" }}>
            Карусель перемешивает зал
          </p>
          {timer?.kind && (
            <div className="mt-6">
              <TimerDisplay timer={timer} />
            </div>
          )}
        </section>
      )}

      {(phase === "searching" || phase === "networking") && pair && (
        <section className="space-y-4">
          {pair.bye ? (
            <div className="panel text-center">
              <h1 className="display text-2xl">Вы без пары в этом раунде</h1>
              <p className="mt-2" style={{ color: "var(--mute)" }}>
                Отдохните — в следующем точно попадёте в игру.
              </p>
            </div>
          ) : (
            <>
              <div className="panel text-center">
                <p className="text-sm uppercase tracking-[0.18em]" style={{ color: "var(--mute)" }}>
                  {isTriple ? "Ваша тройка" : "Ваша пара"}
                </p>
                <div className="mt-4 flex flex-wrap items-start justify-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <Avatar name={me.name} photoUrl={me.photoUrl} size={72} />
                    <span className="max-w-[5.5rem] truncate text-xs" style={{ color: "var(--mute)" }}>
                      вы
                    </span>
                  </div>
                  {partners.map((p) => (
                    <div key={p.id} className="flex items-start gap-3">
                      <span className="display pt-5 text-2xl" style={{ color: "var(--gold)" }}>
                        ×
                      </span>
                      <div className="flex flex-col items-center gap-1">
                        <Avatar name={p.name} photoUrl={p.photoUrl} size={72} />
                        <span className="max-w-[6.5rem] truncate text-sm font-semibold">{p.name}</span>
                        <span className="max-w-[6.5rem] truncate text-xs" style={{ color: "var(--mute)" }}>
                          {p.company}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {timer?.kind && (
                <div className="panel">
                  <TimerDisplay timer={timer} />
                </div>
              )}

              {phase === "searching" && (
                <div className="panel space-y-3">
                  <h2 className="display text-lg" style={{ color: "var(--gold-bright)" }}>
                    {isTriple ? "Найдите троих" : "Найдите друг друга"}
                  </h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    Чат группы: где стоите, во что одеты.
                  </p>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--lift) 60%, transparent)" }}>
                    {chat.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-lg px-3 py-2 text-sm ${m.from === me.id ? "ml-6" : "mr-6"}`}
                        style={{ background: m.from === me.id ? "rgba(201,166,107,0.2)" : "var(--panel)" }}
                      >
                        {m.from !== me.id && (
                          <div className="mb-0.5 text-[11px] font-semibold" style={{ color: "var(--gold-bright)" }}>
                            {m.fromName || "Партнёр"}
                          </div>
                        )}
                        {m.text}
                      </div>
                    ))}
                    <div ref={chatEnd} />
                  </div>
                  <form className="flex gap-2" onSubmit={sendChat}>
                    <input className="field flex-1" value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Я у сцены в синем…" />
                    <button type="submit" className="btn-ghost px-4">
                      →
                    </button>
                  </form>
                  <button type="button" className="btn-signal w-full" disabled={pair.found} onClick={markFound}>
                    {pair.found ? "Ждём остальные группы…" : isTriple ? "Нашли всех троих" : "Нашли друг друга"}
                  </button>
                </div>
              )}

              {phase === "networking" && (
                <div className="panel space-y-3">
                  <div className="text-center">
                    <p className="text-sm uppercase tracking-[0.18em]" style={{ color: "var(--mute)" }}>
                      Вопрос раунда
                    </p>
                    <h2 className="display mt-2 text-xl leading-snug" style={{ color: "var(--gold-bright)" }}>
                      {String(state?.question || "")}
                    </h2>
                    <p className="mt-3 rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, var(--lift) 70%, transparent)" }}>
                      {pair.amAsker
                        ? "В первой половине таймера вопрос задаёте вы."
                        : "В первой половине таймера вопрос задаёт партнёр из группы — потом ваш ход."}
                    </p>
                  </div>
                  <div className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--gold-bright)" }}>
                      Чат группы
                    </h3>
                    <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--lift) 60%, transparent)" }}>
                      {chat.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-lg px-3 py-2 text-sm ${m.from === me.id ? "ml-6" : "mr-6"}`}
                          style={{ background: m.from === me.id ? "rgba(201,166,107,0.2)" : "var(--panel)" }}
                        >
                          {m.from !== me.id && (
                            <div className="mb-0.5 text-[11px] font-semibold" style={{ color: "var(--gold-bright)" }}>
                              {m.fromName || "Партнёр"}
                            </div>
                          )}
                          {m.text}
                        </div>
                      ))}
                      <div ref={chatEnd} />
                    </div>
                    <form className="mt-2 flex gap-2" onSubmit={sendChat}>
                      <input className="field flex-1" value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Заметка или контакт…" />
                      <button type="submit" className="btn-ghost px-4">
                        →
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {phase === "done" && (
        <section className="panel text-center">
          <h1 className="display text-2xl">Нетворкинг завершён</h1>
          <p className="mt-2" style={{ color: "var(--mute)" }}>
            Спасибо — обменяйтесь контактами, пока рядом.
          </p>
        </section>
      )}

      <BrandFooter />
    </div>
  );
}
