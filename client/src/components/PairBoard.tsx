import type { PairView } from "../types";

function membersOf(p: PairView) {
  if (Array.isArray(p.members) && p.members.length) return p.members;
  return [p.a, p.b, p.c].filter(Boolean);
}

export function PairBoard({ pairs }: { pairs: PairView[] }) {
  const real = pairs.filter((p) => !p.bye && membersOf(p).length >= 2);

  return (
    <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {real.map((p) => {
        const members = membersOf(p);
        return (
          <div
            key={p.id}
            className="animate-reveal rounded-2xl border border-[var(--line)] bg-panel/70 px-4 py-4 text-center backdrop-blur"
          >
            {members.length === 3 && (
              <div className="mb-2 text-xs uppercase tracking-[0.18em] text-gold">тройка</div>
            )}
            {members.map((m, idx) => (
              <div key={m!.id}>
                {idx > 0 && <div className="my-2 text-gold">×</div>}
                <div className="display text-lg font-semibold text-mist">{m!.name}</div>
                <div className="text-sm text-mute">{m!.company}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
