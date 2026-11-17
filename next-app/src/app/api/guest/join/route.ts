import { guestJoin } from "@/lib/game";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { err, json } from "@/lib/json";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`join:${ip}`, 60, 60_000)) return err("Слишком много попыток", 429);
    const body = await req.json();
    const result = await guestJoin(body.eventId, body);
    return json({ ok: true, ...result });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
