import type { Metadata } from "next";
import { Syne, Sora } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin", "latin-ext"],
  variable: "--font-syne",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const sora = Sora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sora",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Нетворкинг — Schmidt",
  description: "Нетворкинг знакомств на зале",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${syne.variable} ${sora.variable}`}>
      <body className={sora.className}>{children}</body>
    </html>
  );
}
