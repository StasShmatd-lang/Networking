import { bearerToken, readBodyLimited } from "@/lib/auth";
import { hostAction } from "@/lib/game";
import { err, json } from "@/lib/json";
import { rateLimit, requestLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await readBodyLimited(req, 32_768)) as {
      eventId?: string;
      hostToken?: string;
      action?: string;
      settings?: Partial<{ totalRounds: number; searchSec: number; networkSec: number; questions: string[] }>;
    };
    const hostToken = bearerToken(req) || String(body.hostToken || "");
    const eventId = String(body.eventId || "").trim();
    if (!eventId || !hostToken) return err("Нет доступа", 401);

    const key = requestLimitKey(req, `host:${eventId}`, hostToken);
    if (!rateLimit(key, 60, 60_000)) return err("Слишком часто", 429);

    const state = await hostAction(eventId, hostToken, String(body.action || ""), body.settings);
    return json({ ok: true, state });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
