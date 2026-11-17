type Member = { id: string; name: string; company: string };
type PairView = {
  id: string;
  bye?: boolean;
  members?: Member[];
  a?: Member | null;
  b?: Member | null;
  c?: Member | null;
};

function membersOf(p: PairView) {
  if (Array.isArray(p.members) && p.members.length) return p.members;
  return [p.a, p.b, p.c].filter(Boolean) as Member[];
}

export function PairBoard({ pairs }: { pairs: PairView[] }) {
  const real = pairs.filter((p) => !p.bye && membersOf(p).length >= 2);
  return (
    <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {real.map((p) => {
        const members = membersOf(p);
        return (
          <div key={p.id} className="rounded-2xl border px-4 py-4 text-center backdrop-blur" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--panel) 70%, transparent)" }}>
            {members.length === 3 && (
              <div className="mb-2 text-xs uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>
                тройка
              </div>
            )}
            {members.map((m, idx) => (
              <div key={m.id}>
                {idx > 0 && (
                  <div className="my-2" style={{ color: "var(--gold)" }}>
                    ×
                  </div>
                )}
                <div className="display text-lg font-semibold">{m.name}</div>
                <div className="text-sm" style={{ color: "var(--mute)" }}>
                  {m.company}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
