import { guestChat } from "@/lib/game";
import { err, json } from "@/lib/json";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await guestChat(body.eventId, body.guestId, body.guestToken, body.text);
    return json({ ok: true, ...result });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 400);
  }
}
