/** Append event access key so gated /uploads require auth */
export function mediaUrl(path: string | null | undefined, accessKey?: string | null) {
  if (!path) return "";
  if (!accessKey) return path;
  if (path.includes("?") || !path.startsWith("/uploads/")) return path;
  const q = path.includes("/uploads/") ? "k" : "k";
  return `${path}?${q}=${encodeURIComponent(accessKey)}`;
}
