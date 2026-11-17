import { getState } from "@/lib/game";
import { err, json } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const eventId = u.searchParams.get("eventId") || "";
    const role = (u.searchParams.get("role") || "guest") as "host" | "guest" | "screen";
    const state = await getState(eventId, role, {
      hostToken: u.searchParams.get("hostToken") || undefined,
      screenToken: u.searchParams.get("screenToken") || undefined,
      guestId: u.searchParams.get("guestId") || undefined,
      guestToken: u.searchParams.get("guestToken") || undefined,
    });
    return json(state);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Ошибка", 401);
  }
}
