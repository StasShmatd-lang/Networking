import { bearerToken, readBodyLimited } from "@/lib/auth";
import { guestFound } from "@/lib/game";
import { err, json } from "@/lib/json";
import { rateLimit, requestLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await readBodyLimited(req, 8_192)) as {
      eventId?: string;
      guestId?: string;
      guestToken?: string;
    };
    const guestToken = bearerToken(req) || String(body.guestToken || "");
    const eventId = String(body.eventId || "").trim();
    const guestId = String(body.guestId || req.headers.get("x-guest-id") || "").trim();
    if (!eventId || !guestId || !guestToken) return err("Нет сессии", 401);

    if (!rateLimit(requestLimitKey(req, `found:${eventId}`, guestToken), 30, 60_000)) {
      return err("Слишком часто", 429);
    }

    const state = await guestFound(eventId, guestId, guestToken);
    return json({ ok: true, state });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
