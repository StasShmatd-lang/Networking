import { json } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin = process.env.PUBLIC_ORIGIN?.replace(/\/$/, "") || new URL(req.url).origin;
  return json({ linkBase: origin });
}
