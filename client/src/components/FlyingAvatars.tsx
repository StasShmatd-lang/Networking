import { useMemo } from "react";
import type { Guest } from "../types";
import { Avatar } from "./Avatar";

export function FlyingAvatars({ guests }: { guests: Guest[] }) {
  const nodes = useMemo(() => {
    const list = guests.slice(0, 120);
    return list.map((g, i) => {
      const left = ((i * 47) % 90) + 5;
      const top = ((i * 31) % 78) + 8;
      const delay = (i % 12) * 0.35;
      const duration = 10 + (i % 7) * 1.4;
      const size = 48 + (i % 4) * 10;
      return { g, left, top, delay, duration, size };
    });
  }, [guests]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {nodes.map(({ g, left, top, delay, duration, size }) => (
        <div
          key={g.id}
          className="absolute animate-drift opacity-90"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
          }}
        >
          <Avatar guest={g} size={size} className="shadow-glow" />
        </div>
      ))}
    </div>
  );
}
