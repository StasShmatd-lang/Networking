import { readBodyLimited } from "@/lib/auth";
import { guestJoin } from "@/lib/game";
import { err, json } from "@/lib/json";
import { clientIp, rateLimit, requestLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await readBodyLimited(req, 200_000)) as {
      eventId?: string;
      accessKey?: string;
      guestId?: string;
      guestToken?: string;
      clientKey?: string;
      name?: string;
      company?: string;
      photoUrl?: string | null;
    };
    const eventId = String(body.eventId || "").trim();
    if (!eventId) return err("Нет события", 400);

    // The whole hall scans one QR at the same moment, so the shared QR key must NOT be
    // the bucket (that let only 30 people in per minute). Limit per guest / per phone instead,
    // plus a generous cap for the whole event.
    const deviceKey = String(body.clientKey || "").trim().slice(0, 64);
    const key = body.guestToken
      ? requestLimitKey(req, `join:${eventId}`, body.guestToken)
      : deviceKey
        ? `join:${eventId}:dev:${deviceKey}`
        : `join:${eventId}:ip:${clientIp(req)}`;
    if (!rateLimit(key, 30, 60_000)) return err("Слишком много попыток", 429);
    if (!body.guestToken && !rateLimit(`join:${eventId}:all`, 900, 60_000)) {
      return err("Сейчас входит слишком много людей — попробуйте через несколько секунд", 429);
    }

    const result = await guestJoin(eventId, body);
    return json({ ok: true, ...result });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
