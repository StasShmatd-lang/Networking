import { readBodyLimited } from "@/lib/auth";
import { guestJoin } from "@/lib/game";
import { err, json } from "@/lib/json";
import { clientIp, rateLimit, requestLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await readBodyLimited(req, 400_000)) as {
      eventId?: string;
      accessKey?: string;
      guestId?: string;
      guestToken?: string;
      name?: string;
      company?: string;
      photoUrl?: string | null;
    };
    const eventId = String(body.eventId || "").trim();
    if (!eventId) return err("Нет события", 400);

    const secret = body.guestToken || body.accessKey || "";
    const key = secret
      ? requestLimitKey(req, `join:${eventId}`, secret)
      : `join:${eventId}:ip:${clientIp(req)}`;
    if (!rateLimit(key, 30, 60_000)) return err("Слишком много попыток", 429);

    const result = await guestJoin(eventId, body);
    return json({ ok: true, ...result });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
