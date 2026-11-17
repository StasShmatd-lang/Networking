"use client";

import { useEffect, useState } from "react";
import { readJson } from "@/lib/apiClient";

export function usePollState(query: string | null, enabled = true) {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !query) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(`/api/state?${query}`);
        const data = await readJson<Record<string, unknown>>(res);
        if (!res.ok) throw new Error((data as { error?: string }).error || `Ошибка ${res.status}`);
        if (!cancelled) {
          setState(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка связи");
      }
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [query, enabled]);

  return { state, setState, error, setError };
}
