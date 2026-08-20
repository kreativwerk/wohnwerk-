import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

// Variabler Schnitt: eine Datei deckt alle Staerken ab, die die Oberflaeche
// verwendet. `swap` sorgt dafuer, dass Text sofort steht.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Wohnwerk",
    template: "%s · Wohnwerk",
  },
  description:
    "Verwaltung von Monteurunterkünften: Objekte, Zimmer und Betten, digitale Mietverträge und Buchhaltung.",
  robots: { index: false, follow: false },
  icons: { icon: "/logo-mark.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#142726",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
