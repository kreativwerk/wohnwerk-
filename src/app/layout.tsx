import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Wohnwerk",
    template: "%s · Wohnwerk",
  },
  description:
    "Verwaltung von Monteurunterkünften: Objekte, Zimmer und Betten, digitale Mietverträge und Buchhaltung.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
