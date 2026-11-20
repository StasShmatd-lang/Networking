import { bearerToken, readBodyLimited } from "@/lib/auth";
import { guestPresence } from "@/lib/game";
import { err, json } from "@/lib/json";
import { rateLimit, requestLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Guest leaves the networking (profile kept) or comes back into the game. */
export async function POST(req: Request) {
  try {
    const body = (await readBodyLimited(req, 8_192)) as {
      eventId?: string;
      guestId?: string;
      action?: string;
    };
    const guestToken = bearerToken(req) || "";
    const eventId = String(body.eventId || "").trim();
    const guestId = String(body.guestId || req.headers.get("x-guest-id") || "").trim();
    if (!eventId || !guestId || !guestToken) return err("Нет сессии", 401);
    if (!rateLimit(requestLimitKey(req, `leave:${eventId}`, guestToken), 20, 60_000)) {
      return err("Слишком часто", 429);
    }
    const action = body.action === "return" ? "return" : "leave";
    const state = await guestPresence(eventId, guestId, guestToken, action);
    return json({ ok: true, state });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
