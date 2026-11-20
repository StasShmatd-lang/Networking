"use client";

import { useEffect, useRef, useState } from "react";
import { readJson } from "@/lib/apiClient";

export type PollAuth = {
  eventId: string;
  role: "host" | "guest" | "screen";
  token: string;
  guestId?: string;
};

/** Lobby can poll slower; live rounds stay near 1s. */
function intervalForPhase(phase: unknown, role: string) {
  if (role === "screen") return 1000;
  if (phase === "lobby" || phase === "between" || phase === "done") return 2000;
  return 1000;
}

export function usePollState(auth: PollAuth | null, enabled = true) {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const eventId = auth?.eventId ?? "";
  const role = auth?.role;
  const token = auth?.token ?? "";
  const guestId = auth?.guestId;

  useEffect(() => {
    if (!enabled || !eventId || !role || !token) return;
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-event-id": eventId,
          "x-event-role": role!,
        };
        if (guestId) headers["x-guest-id"] = guestId;

        const res = await fetch("/api/state", {
          method: "POST",
          headers,
          body: JSON.stringify({
            eventId,
            role,
            ...(guestId ? { guestId } : {}),
          }),
        });
        const data = await readJson<Record<string, unknown>>(res);
        if (!res.ok) throw new Error((data as { error?: string }).error || `Ошибка ${res.status}`);
        if (!cancelled) {
          setState(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка связи");
      } finally {
        if (!cancelled) {
          const ms = intervalForPhase(stateRef.current?.phase, role!);
          timer = window.setTimeout(tick, ms);
        }
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [eventId, role, token, guestId, enabled]);

  return { state, setState, error, setError };
}
