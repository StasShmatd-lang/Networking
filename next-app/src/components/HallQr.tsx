"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function HallQr({ joinUrl }: { joinUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);
  if (!joinUrl) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="relative z-20 inline-flex flex-col items-center rounded-[1.35rem] bg-[var(--mist)] p-3 shadow-lg"
        aria-label="Увеличить QR"
      >
        <QRCodeSVG value={joinUrl} size={120} bgColor="#E7ECF4" fgColor="#050608" level="M" />
        <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/65">
          нажмите · крупнее
        </span>
      </button>
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-md">
          <button type="button" className="absolute inset-0" aria-label="Свернуть" onClick={() => setExpanded(false)} />
          <div className="relative z-10 rounded-[2rem] bg-[var(--mist)] p-7">
            <button type="button" onClick={() => setExpanded(false)}>
              <QRCodeSVG
                value={joinUrl}
                size={typeof window !== "undefined" ? Math.min(560, Math.floor(window.innerHeight * 0.64)) : 480}
                bgColor="#E7ECF4"
                fgColor="#050608"
                level="M"
              />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
