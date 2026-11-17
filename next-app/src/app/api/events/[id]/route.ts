import { loadEvent } from "@/lib/game";
import { err, json } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ev = await loadEvent(id);
  if (!ev) return err("Событие не найдено", 404);
  return json({
    id: ev.id,
    phase: ev.phase,
    round: ev.round,
    totalRounds: ev.totalRounds,
    guestCount: ev.guests.length,
  });
}
