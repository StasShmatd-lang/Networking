import { hostAction } from "@/lib/game";
import { err, json } from "@/lib/json";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const state = await hostAction(body.eventId, body.hostToken, body.action, body.settings);
    return json({ ok: true, state });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
