import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { SprachProvider } from "@/components/sprache-kontext";
import { LOCALE, aktuelleSprache, uebersetzer } from "@/lib/i18n";

// Variabler Schnitt: eine Datei deckt alle Staerken ab, die die Oberflaeche
// verwendet. `swap` sorgt dafuer, dass Text sofort steht.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await uebersetzer();
  return {
    title: {
      default: "Wohnwerk",
      template: "%s · Wohnwerk",
    },
    description: t(
      "Verwaltung von Monteurunterkünften: Objekte, Zimmer und Betten, digitale Mietverträge und Buchhaltung.",
    ),
    robots: { index: false, follow: false },
    icons: { icon: "/logo-mark.svg" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#142726",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sprache = await aktuelleSprache();

  return (
    // Das vollstaendige Locale, nicht nur "en": sonst zeigt Chrome in
    // <input type="date"> das US-Format mm/dd/yyyy, waehrend die Anwendung
    // daneben den Tag zuerst schreibt - und jemand tippt den Monat ins
    // Tagesfeld. Vorleseprogramme und die Rechtschreibpruefung richten sich
    // ebenfalls danach.
    <html lang={LOCALE[sprache]} className={inter.variable}>
      <body>
        <SprachProvider sprache={sprache}>{children}</SprachProvider>
      </body>
    </html>
  );
}
