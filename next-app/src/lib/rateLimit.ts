type Bucket = { n: number; reset: number };
const g = globalThis as unknown as { __rate?: Map<string, Bucket> };
g.__rate ??= new Map();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  let b = g.__rate!.get(key);
  if (!b || now > b.reset) b = { n: 0, reset: now + windowMs };
  b.n += 1;
  g.__rate!.set(key, b);
  return b.n <= max;
}

export function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || "unknown";
}
