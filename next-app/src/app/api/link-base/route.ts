import { json } from "@/lib/json";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const fromEnv = process.env.PUBLIC_ORIGIN?.replace(/\/$/, "");
  if (fromEnv) return json({ linkBase: fromEnv });

  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host")?.split(",")[0]?.trim();
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  if (host && !host.includes("localhost") && !host.startsWith("127.")) {
    return json({ linkBase: `${proto}://${host}` });
  }
  return json({ linkBase: new URL(req.url).origin });
}
