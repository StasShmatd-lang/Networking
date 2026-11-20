import type { CSSProperties } from "react";
import type { Metadata } from "next";
import "./globals.css";

// Fonts load in the guest's browser from Google Fonts.
// (next/font/google downloaded them during the build and sometimes broke the deploy.)
const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&family=Syne:wght@500;600;700;800&display=swap";

const fontVars = {
  "--font-syne": '"Syne"',
  "--font-sora": '"Sora"',
} as CSSProperties;

export const metadata: Metadata = {
  title: "Нетворкинг — Schmidt",
  description: "Нетворкинг знакомств на зале",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" style={fontVars}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS_CSS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
