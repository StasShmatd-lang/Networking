"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

export function HallQr({ joinUrl }: { joinUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
      {/* Portal to <body>: the header's rise animation (transform) made `fixed`
          position relative to the header, so the big QR slid off the top. */}
      {expanded &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-md">
            <button type="button" className="absolute inset-0" aria-label="Свернуть" onClick={() => setExpanded(false)} />
            <div className="relative z-10 rounded-[2rem] bg-[var(--mist)] p-5 md:p-7">
              <button type="button" className="block" onClick={() => setExpanded(false)}>
                <QRCodeSVG
                  value={joinUrl}
                  size={560}
                  bgColor="#E7ECF4"
                  fgColor="#050608"
                  level="M"
                  style={{ display: "block", width: "min(560px, 72vh, 80vw)", height: "auto" }}
                />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
