import type { Guest } from "../types";
import { mediaUrl } from "../lib/mediaUrl";

export function Avatar({
  guest,
  size = 64,
  className = "",
  accessKey,
}: {
  guest: Pick<Guest, "name" | "photoUrl"> | null | undefined;
  size?: number;
  className?: string;
  accessKey?: string | null;
}) {
  const initials = (guest?.name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const src = mediaUrl(guest?.photoUrl, accessKey);

  if (src) {
    return (
      <img
        src={src}
        alt={guest?.name || ""}
        width={size}
        height={size}
        className={`rounded-full object-cover ring-2 ring-gold/40 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-lift font-semibold text-gold ring-2 ring-gold/30 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.28 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
