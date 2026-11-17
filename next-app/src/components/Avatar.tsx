export function Avatar({
  name,
  photoUrl,
  size = 64,
}: {
  name?: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials = (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name || ""}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-[rgba(201,166,107,0.4)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold ring-2 ring-[rgba(201,166,107,0.3)]"
      style={{ width: size, height: size, fontSize: size * 0.28, background: "var(--lift)", color: "var(--gold)" }}
    >
      {initials}
    </div>
  );
}
