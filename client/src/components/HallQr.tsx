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
        aria-expanded={expanded}
        aria-label="Увеличить QR для зала"
        onClick={() => setExpanded(true)}
        className="group relative z-20 inline-flex flex-col items-center rounded-[1.35rem] bg-mist p-3 shadow-glow transition duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <QRCodeSVG value={joinUrl} size={120} bgColor="#F2EDE4" fgColor="#0B0A09" level="M" />
        <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/65">
          нажмите · крупнее
        </span>
      </button>

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6 backdrop-blur-md">
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label="Свернуть QR"
            onClick={() => setExpanded(false)}
          />
          <div className="relative z-10 animate-reveal rounded-[2rem] bg-mist p-7 shadow-glow">
            <button type="button" onClick={() => setExpanded(false)} aria-label="Свернуть QR" className="block">
              <QRCodeSVG
                value={joinUrl}
                size={typeof window !== "undefined" ? Math.min(560, Math.floor(window.innerHeight * 0.64)) : 480}
                bgColor="#F2EDE4"
                fgColor="#0B0A09"
                level="M"
              />
            </button>
            <p className="mt-4 text-center text-sm font-medium text-ink/70">Нажмите, чтобы свернуть</p>
          </div>
        </div>
      )}
    </>
  );
}
