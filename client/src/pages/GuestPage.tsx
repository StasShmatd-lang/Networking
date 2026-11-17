import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { BrandFooter } from "../components/BrandFooter";
import { TimerDisplay } from "../components/TimerDisplay";
import { useEventSocket } from "../hooks/useEventSocket";
import { getSocket } from "../socket";

export function GuestPage() {
  const { eventId = "" } = useParams();
  const storageKey = `guest:${eventId}`;
  const { state, setError, error, chat, setChat, connected } = useEventSocket(eventId, "guest");
  const [guestId, setGuestId] = useState(() => localStorage.getItem(storageKey) || "");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [chatText, setChatText] = useState("");
  const [joined, setJoined] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  useEffect(() => {
    if (!eventId || !guestId) return;
    // Rejoin on refresh with stored id
    const socket = getSocket();
    socket.emit(
      "guest:join",
      { eventId, guestId },
      (ack: { ok: boolean; guestId?: string; error?: string }) => {
        if (ack?.ok && ack.guestId) {
          setGuestId(ack.guestId);
          localStorage.setItem(storageKey, ack.guestId);
          setJoined(true);
        }
      },
    );
  }, [eventId, guestId, storageKey]);

  async function onPhoto(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Загрузка не удалась");
      setPhotoUrl(data.photoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка фото");
    } finally {
      setUploading(false);
    }
  }

  function register(e: FormEvent) {
    e.preventDefault();
    const socket = getSocket();
    socket.emit(
      "guest:join",
      { eventId, guestId: guestId || undefined, name, company, photoUrl },
      (ack: { ok: boolean; guestId?: string; error?: string }) => {
        if (!ack?.ok) {
          setError(ack?.error || "Не удалось войти");
          return;
        }
        if (ack.guestId) {
          setGuestId(ack.guestId);
          localStorage.setItem(storageKey, ack.guestId);
        }
        setJoined(true);
      },
    );
  }

  function markFound() {
    getSocket().emit("guest:found", { eventId, guestId }, (ack: { ok: boolean; error?: string }) => {
      if (!ack?.ok) setError(ack?.error || "Не удалось");
    });
  }

  function sendChat(e: FormEvent) {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    getSocket().emit(
      "guest:chat",
      { eventId, guestId, text },
      (ack: { ok: boolean; message?: { id: string; from: string; text: string; at: number }; error?: string }) => {
        if (!ack?.ok) {
          setError(ack?.error || "Чат недоступен");
          return;
        }
        if (ack.message) setChat((prev) => [...prev, ack.message!].slice(-80));
        setChatText("");
      },
    );
  }

  const me = state?.me;
  const pair = state?.pair;
  const phase = state?.phase || "lobby";

  if (!joined || !me) {
    return (
      <div className="shell flex flex-col">
        <div className="flex flex-1 flex-col justify-center gap-6 animate-reveal">
          <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mx-auto" />
          <div className="text-center">
            <h1 className="display text-3xl font-semibold text-mist">Вход в зал</h1>
            <p className="mt-2 text-mute">Фото, имя и компания — и вы в игре.</p>
          </div>
          <form className="space-y-4" onSubmit={register}>
            <label className="block">
              <span className="label">Фото</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="field file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-ink"
                onChange={(e) => onPhoto(e.target.files?.[0] || null)}
              />
              {uploading && <span className="mt-1 block text-xs text-mute">Загрузка…</span>}
              {photoUrl && (
                <div className="mt-3 flex justify-center">
                  <Avatar guest={{ name: name || "Вы", photoUrl }} size={88} />
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
            {error && <p className="text-sm text-signal">{error}</p>}
            <button type="submit" className="btn-gold w-full" disabled={uploading || !connected}>
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
      <header className="mb-6 flex items-center justify-between gap-3 animate-reveal">
        <img src="/brand/logo.png" alt="Schmidt" className="h-8 w-auto object-contain" />
        <div className="text-right text-xs text-mute">
          <div>{connected ? "в сети" : "…"}</div>
          <div>
            {phase} · р.{state?.round}/{state?.totalRounds}
          </div>
        </div>
      </header>

      {error && <p className="mb-3 text-sm text-signal">{error}</p>}

      {(phase === "lobby" || phase === "between") && (
        <section className="panel animate-reveal text-center">
          <Avatar guest={me} size={96} className="mx-auto mb-4" />
          <h1 className="display text-2xl text-mist">{me.name}</h1>
          <p className="text-mute">{me.company}</p>
          <p className="mt-4 text-sm text-gold-bright">
            {phase === "lobby"
              ? "Ждём старта от ведущего. Держите телефон под рукой."
              : "Пауза. Скоро новый раунд."}
          </p>
          <p className="mt-2 text-xs text-mute">В зале: {state?.guestCount}</p>
        </section>
      )}

      {phase === "matching" && (
        <section className="panel animate-reveal text-center">
          <div className="relative mx-auto mb-4 h-24 w-24">
            <div className="absolute inset-0 animate-pulse-ring rounded-full border border-gold/40" />
            <Avatar guest={me} size={96} />
          </div>
          <h1 className="display text-2xl text-mist">Ищем пару…</h1>
          <p className="mt-2 text-mute">Карусель перемешивает зал</p>
          {state?.timer && <div className="mt-6"><TimerDisplay timer={state.timer} /></div>}
        </section>
      )}

      {(phase === "searching" || phase === "networking") && pair && (
        <section className="space-y-4 animate-reveal">
          {pair.bye ? (
            <div className="panel text-center">
              <h1 className="display text-2xl text-mist">Вы без пары в этом раунде</h1>
              <p className="mt-2 text-mute">Отдохните — в следующем точно попадёте в игру.</p>
            </div>
          ) : (
            <>
              <div className="panel text-center">
                <p className="text-sm uppercase tracking-[0.18em] text-mute">Ваша пара</p>
                <div className="mt-4 flex items-center justify-center gap-4">
                  <Avatar guest={me} size={72} />
                  <span className="display text-2xl text-gold">×</span>
                  <Avatar guest={pair.partner} size={72} />
                </div>
                <h1 className="display mt-4 text-2xl text-mist">{pair.partner?.name}</h1>
                <p className="text-mute">{pair.partner?.company}</p>
              </div>

              {state?.timer && (
                <div className="panel">
                  <TimerDisplay timer={state.timer} />
                </div>
              )}

              {phase === "searching" && (
                <div className="panel space-y-3">
                  <h2 className="display text-lg text-gold-bright">Найдите друг друга</h2>
                  <p className="text-sm text-mute">Напишите ориентир в чат — где стоите, во что одеты.</p>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-lift/60 p-3">
                    {chat.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-lg px-3 py-2 text-sm ${m.from === me.id ? "ml-8 bg-gold/20 text-mist" : "mr-8 bg-panel text-mist"}`}
                      >
                        {m.text}
                      </div>
                    ))}
                    <div ref={chatEnd} />
                  </div>
                  <form className="flex gap-2" onSubmit={sendChat}>
                    <input
                      className="field flex-1"
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="Я у сцены в синем…"
                    />
                    <button type="submit" className="btn-ghost px-4">
                      →
                    </button>
                  </form>
                  <button
                    type="button"
                    className="btn-signal w-full"
                    disabled={pair.found}
                    onClick={markFound}
                  >
                    {pair.found ? "Ждём остальных…" : "Нашли друг друга"}
                  </button>
                </div>
              )}

              {phase === "networking" && (
                <div className="panel space-y-3 text-center">
                  <p className="text-sm uppercase tracking-[0.18em] text-mute">Вопрос раунда</p>
                  <h2 className="display text-xl leading-snug text-gold-bright">{state?.question}</h2>
                  <p className="rounded-xl bg-lift/70 px-4 py-3 text-sm text-mist">
                    {pair.amAsker
                      ? "В первой половине таймера вопрос задаёте вы."
                      : "В первой половине таймера вопрос задаёт партнёр — слушайте, потом ваш ход."}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {phase === "done" && (
        <section className="panel animate-reveal text-center">
          <h1 className="display text-2xl text-mist">Нетворкинг завершён</h1>
          <p className="mt-2 text-mute">Спасибо — обменяйтесь контактами, пока рядом.</p>
        </section>
      )}

      <BrandFooter />
    </div>
  );
}
