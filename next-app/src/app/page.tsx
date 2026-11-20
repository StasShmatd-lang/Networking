"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandFooter } from "@/components/BrandFooter";
import { readJson } from "@/lib/apiClient";

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createEvent() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/events", { method: "POST" });
      const data = await readJson<{
        id: string;
        hostToken: string;
        screenToken?: string;
        guestAccessToken?: string;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Ошибка");
      sessionStorage.setItem(`hostToken:${data.id}`, data.hostToken);
      if (data.screenToken) sessionStorage.setItem(`screenToken:${data.id}`, data.screenToken);
      if (data.guestAccessToken) sessionStorage.setItem(`guestAccess:${data.id}`, data.guestAccessToken);
      router.push(`/host/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать");
      setBusy(false);
    }
  }

  return (
    <div className="shell flex flex-col">
      <div className="flex flex-1 flex-col justify-center gap-8 animate-rise">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mx-auto" />
        <div className="text-center">
          <h1 className="display text-4xl font-semibold sm:text-5xl">Нетворкинг</h1>
          <p className="mt-3 text-base text-balance" style={{ color: "var(--mute)" }}>
            QR → профиль → пара → поиск → разговор с одним вопросом.
          </p>
        </div>
        <button type="button" className="btn-gold w-full" disabled={busy} onClick={createEvent}>
          {busy ? "Создаём…" : "Создать событие"}
        </button>
        {err && (
          <p className="text-center text-sm" style={{ color: "var(--signal)" }}>
            {err}
          </p>
        )}
      </div>
      <BrandFooter />
    </div>
  );
}
