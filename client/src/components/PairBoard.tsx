import type { PairView } from "../types";

export function PairBoard({ pairs }: { pairs: PairView[] }) {
  const real = pairs.filter((p) => !p.bye && p.a && p.b && p.a.id !== p.b.id);

  return (
    <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {real.map((p) => (
        <div
          key={p.id}
          className="animate-reveal rounded-2xl border border-[var(--line)] bg-panel/70 px-4 py-4 text-center backdrop-blur"
        >
          <div className="display text-lg font-semibold text-mist">{p.a?.name}</div>
          <div className="text-sm text-mute">{p.a?.company}</div>
          <div className="my-2 text-gold">×</div>
          <div className="display text-lg font-semibold text-mist">{p.b?.name}</div>
          <div className="text-sm text-mute">{p.b?.company}</div>
        </div>
      ))}
    </div>
  );
}
