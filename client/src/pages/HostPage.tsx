import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import { BrandFooter } from "../components/BrandFooter";
import { TimerDisplay } from "../components/TimerDisplay";
import { useEventSocket } from "../hooks/useEventSocket";
import { useLinkBase } from "../hooks/useLinkBase";
import { getSocket } from "../socket";

const PHASE_LABEL: Record<string, string> = {
  lobby: "Лобби",
  matching: "Перемешивание",
  searching: "Поиск пар",
  networking: "Нетворкинг",
  between: "Пауза между раундами",
  done: "Завершено",
};

export function HostPage() {
  const { eventId = "" } = useParams();
  const base = useLinkBase();
  const { state, setError, error, connected } = useEventSocket(eventId, "host");
  const [hostToken, setHostToken] = useState(() => sessionStorage.getItem(`hostToken:${eventId}`) || "");
  const [questionsText, setQuestionsText] = useState("");
  const [totalRounds, setTotalRounds] = useState(5);
  const [searchSec, setSearchSec] = useState(90);
  const [networkSec, setNetworkSec] = useState(180);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    if (!hostToken) {
      setError("Нет ключа ведущего. Создайте событие с главной страницы.");
      return;
    }
    const socket = getSocket();
    socket.emit(
      "host:join",
      { eventId, hostToken },
      (ack: { ok: boolean; error?: string; state?: unknown }) => {
        if (!ack?.ok) {
          setError(ack?.error || "Не удалось войти как ведущий");
          return;
        }
        setError(null);
      },
    );
  }, [eventId, hostToken, setError]);

  useEffect(() => {
    if (!state) return;
    setQuestionsText(state.questions.join("\n"));
    setTotalRounds(state.totalRounds);
    setSearchSec(state.searchSec);
    setNetworkSec(state.networkSec);
  }, [state?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinUrl = useMemo(() => {
    const k = state?.guestAccessToken;
    return k ? `${base}/join/${eventId}?k=${encodeURIComponent(k)}` : `${base}/join/${eventId}`;
  }, [base, eventId, state?.guestAccessToken]);
  const screenUrl = useMemo(() => `${base}/screen/${eventId}`, [base, eventId]);

  function saveSettings() {
    const socket = getSocket();
    const questions = questionsText
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);
    socket.emit(
      "host:settings",
      {
        eventId,
        hostToken,
        settings: { totalRounds, searchSec, networkSec, questions },
      },
      (ack: { ok: boolean; error?: string }) => {
        setMsg(ack?.ok ? "Настройки сохранены" : ack?.error || "Ошибка");
      },
    );
  }

  function start() {
    getSocket().emit("host:start", { eventId, hostToken }, (ack: { ok: boolean; error?: string }) => {
      setMsg(ack?.ok ? "Раунд запущен" : ack?.error || "Ошибка");
    });
  }

  function stop() {
    getSocket().emit("host:stop", { eventId, hostToken }, (ack: { ok: boolean; error?: string }) => {
      setMsg(ack?.ok ? "Сброшено в лобби" : ack?.error || "Ошибка");
    });
  }

  function skip() {
    getSocket().emit("host:skip", { eventId, hostToken }, (ack: { ok: boolean; error?: string }) => {
      setMsg(ack?.ok ? "Фаза пропущена" : ack?.error || "Ошибка");
    });
  }

  return (
    <div className="shell-wide">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-reveal">
        <div>
          <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mb-5 h-14 md:h-16" />
          <h1 className="display text-3xl font-semibold text-mist md:text-4xl">Панель ведущего</h1>
          <p className="mt-1 text-mute">
            {connected ? "онлайн" : "подключение…"} · событие {eventId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to={screenUrl} target="_blank" rel="noreferrer">
            Экран зала
          </Link>
          <Link className="btn-ghost" to="/">
            На главную
          </Link>
        </div>
      </header>

      {(error || msg) && (
        <p className={`mb-4 text-sm ${error ? "text-signal" : "text-teal"}`}>{error || msg}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="panel animate-reveal space-y-4">
          <h2 className="display text-lg text-gold-bright">QR гостя</h2>
          <div className="mx-auto w-fit rounded-2xl bg-mist p-3">
            <QRCodeSVG value={joinUrl} size={200} bgColor="#F2EDE4" fgColor="#0B0A09" />
          </div>
          <p className="break-all text-center text-xs text-mute">{joinUrl}</p>
          <div className="rounded-xl bg-lift/80 px-4 py-3 text-sm">
            <div className="text-mute">Гостей</div>
            <div className="display text-3xl text-mist">{state?.guestCount ?? 0}</div>
          </div>
          <div className="rounded-xl bg-lift/80 px-4 py-3 text-sm">
            <div className="text-mute">Фаза</div>
            <div className="text-lg font-semibold text-gold-bright">
              {PHASE_LABEL[state?.phase || "lobby"] || state?.phase}
            </div>
            <div className="text-mute">
              Раунд {state?.round ?? 0} / {state?.totalRounds ?? totalRounds}
            </div>
          </div>
          {state?.timer?.kind && <TimerDisplay timer={state.timer} />}
        </aside>

        <section className="space-y-6">
          <div className="panel animate-reveal space-y-4" style={{ animationDelay: "0.08s" }}>
            <h2 className="display text-lg text-gold-bright">Управление</h2>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-gold"
                onClick={start}
                disabled={state?.phase !== "lobby" && state?.phase !== "between"}
              >
                Старт раунда
              </button>
              <button type="button" className="btn-ghost" onClick={skip}>
                Следующая фаза
              </button>
              <button type="button" className="btn-signal" onClick={stop}>
                Стоп / сброс
              </button>
            </div>
            {state?.question && (
              <p className="rounded-xl border border-[var(--line)] bg-lift/60 px-4 py-3 text-mist">
                Вопрос раунда: <span className="font-semibold text-gold-bright">{state.question}</span>
              </p>
            )}
          </div>

          <div className="panel animate-reveal space-y-4" style={{ animationDelay: "0.14s" }}>
            <h2 className="display text-lg text-gold-bright">Настройки</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label>
                <span className="label">Раундов</span>
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={20}
                  value={totalRounds}
                  onChange={(e) => setTotalRounds(Number(e.target.value))}
                />
              </label>
              <label>
                <span className="label">Поиск, сек</span>
                <input
                  className="field"
                  type="number"
                  min={15}
                  max={600}
                  value={searchSec}
                  onChange={(e) => setSearchSec(Number(e.target.value))}
                />
              </label>
              <label>
                <span className="label">Нетворкинг, сек</span>
                <input
                  className="field"
                  type="number"
                  min={30}
                  max={900}
                  value={networkSec}
                  onChange={(e) => setNetworkSec(Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              <span className="label">Вопросы (по одному на строку, по кругу на раунды)</span>
              <textarea
                className="field min-h-[160px] font-medium"
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
              />
            </label>
            <button type="button" className="btn-ghost" onClick={saveSettings}>
              Сохранить настройки
            </button>
          </div>

          <div className="panel animate-reveal" style={{ animationDelay: "0.2s" }}>
            <h2 className="display mb-3 text-lg text-gold-bright">Гости в зале</h2>
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {(state?.guests || []).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2">
                  <span className="font-medium text-mist">{g.name}</span>
                  <span className="text-mute">{g.company}</span>
                </li>
              ))}
              {!state?.guests?.length && <li className="text-mute">Пока никого — пусть сканируют QR</li>}
            </ul>
          </div>
        </section>
      </div>
      <BrandFooter />
    </div>
  );
}
