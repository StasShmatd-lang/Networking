"use client";

import { useMemo } from "react";
import { Avatar } from "./Avatar";

type Guest = { id: string; name: string; photoUrl?: string | null };

export function FlyingAvatars({ guests }: { guests: Guest[] }) {
  const nodes = useMemo(() => {
    return guests.slice(0, 120).map((g, i) => ({
      g,
      left: ((i * 47) % 90) + 5,
      top: ((i * 31) % 78) + 8,
      delay: (i % 12) * 0.35,
      duration: 10 + (i % 7) * 1.4,
      size: 48 + (i % 4) * 10,
    }));
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
          <Avatar name={g.name} photoUrl={g.photoUrl} size={size} />
        </div>
      ))}
    </div>
  );
}
