const INSTAGRAM_URL = "https://instagram.com/st.shmidt";

export function BrandFooter() {
  return (
    <footer className="mt-12 flex justify-center pb-2 pt-6">
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center gap-2 opacity-55 transition hover:opacity-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="Schmidt" width={120} height={40} className="h-7 w-auto" />
        <span className="text-[11px] tracking-[0.08em]" style={{ color: "var(--mute)" }}>
          instagram.com/st.shmidt
        </span>
      </a>
    </footer>
  );
}
