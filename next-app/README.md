# Нетворкинг (Next.js)

Guest QR join → pairs/triples → search chat → networking question. Host panel + hall screen.

## Run

```bash
cd next-app
npm install
env -u DATABASE_URL npm run dev    # local PGlite
env -u DATABASE_URL npm run build
env -u DATABASE_URL npm start
```

Publish folder: `next-app/` (slug `networking-684f`). Needs Postgres in production (`cursor-app.json`).

## Field fixes (2026-11)

- Stable guest `clientKey` — no duplicate profiles on rejoin / double-tap
- Photo CTA on join + add/change photo after registration from profile
- Smaller JPEG photos, slim poll payloads, optimistic chat/found, adaptive poll interval
- Hall visual lift: Syne + Sora, night atmosphere, motions, brand logo, IG footer
