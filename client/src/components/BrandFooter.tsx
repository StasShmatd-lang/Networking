const INSTAGRAM_URL =
  "https://www.instagram.com/st.shmidt?mdxt=emx1MzR3dmN0MmZx&utm_source=qr";

export function BrandFooter() {
  return (
    <footer className="brand-footer">
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram st.shmidt">
        <img src="/brand/logo.png" alt="Schmidt" width={120} height={40} />
        <span>instagram.com/st.shmidt</span>
      </a>
    </footer>
  );
}
