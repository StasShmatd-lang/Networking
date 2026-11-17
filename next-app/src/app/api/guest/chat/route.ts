import { bearerToken, readBodyLimited } from "@/lib/auth";
import { guestChat } from "@/lib/game";
import { err, json } from "@/lib/json";
import { rateLimit, requestLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await readBodyLimited(req, 8_192)) as {
      eventId?: string;
      guestId?: string;
      guestToken?: string;
      text?: string;
    };
    const guestToken = bearerToken(req) || String(body.guestToken || "");
    const eventId = String(body.eventId || "").trim();
    const guestId = String(body.guestId || req.headers.get("x-guest-id") || "").trim();
    if (!eventId || !guestId || !guestToken) return err("Нет сессии", 401);

    if (!rateLimit(requestLimitKey(req, `chat:${eventId}`, guestToken), 60, 60_000)) {
      return err("Слишком часто", 429);
    }

    const result = await guestChat(eventId, guestId, guestToken, String(body.text || ""));
    return json({ ok: true, ...result });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
