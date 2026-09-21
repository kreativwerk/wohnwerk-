/**
 * Zahlungserinnerung auf Albanisch - zum Kopieren in WhatsApp.
 *
 * Die meisten Monteure schreiben und lesen Albanisch. Eine Erinnerung, die
 * sie ohne Umweg verstehen, wird bezahlt; eine deutsche wird weitergereicht
 * und vergessen. Deshalb entsteht der Text hier fertig, mit Betrag,
 * Monat und Bankverbindung - die Hausverwaltung drückt nur noch Kopieren.
 *
 * Reine Funktion ohne Datenbank, damit sie sich testen laesst.
 */

/**
 * Bis zu diesem Tag des Monats muss die Miete da sein.
 *
 * Fest verdrahtet, weil die Hausverwaltung es so handhabt - unabhaengig
 * davon, was als Faelligkeit im Mietverhaeltnis steht (dort ist ueberall
 * der 1. hinterlegt). Wer den Tag aendert, aendert ihn hier.
 */
export const ZAHLTAG = 15;

export type MahnungAngaben = {
  vorname: string;
  jahr: number;
  monat: number;
  offenCents: number;
  kontoinhaber: string;
  iban: string;
  bank?: string | null;
};

/**
 * Der Verwendungszweck steht auf dem deutschen Kontoauszug - deshalb
 * deutsch, auch wenn die Nachricht albanisch ist: "Miete September 2026".
 * Immer nach diesem Muster, unabhaengig von der Vertragsnummer; so
 * erkennt die Buchhaltung auf einen Blick, welcher Monat gezahlt wurde.
 */
export function verwendungszweck(jahr: number, monat: number): string {
  const name = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(Date.UTC(jahr, monat - 1, 1)));
  return `Miete ${name} ${jahr}`;
}

const MONATE_SQ = [
  "janar", "shkurt", "mars", "prill", "maj", "qershor",
  "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor",
];

/** "350,00 €" - Komma als Dezimaltrenner ist auch im Albanischen ueblich. */
function betragSq(cents: number): string {
  return new Intl.NumberFormat("sq", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** IBAN in Vierergruppen: vom Handybildschirm liest sich DE62 1001 … leichter. */
export function ibanLesbar(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Telefonnummer in die Form, die wa.me versteht: nur Ziffern, mit
 * Landesvorwahl, ohne Plus und ohne fuehrende Nullen.
 *
 *   "+49 151 234 5678"  -> "491512345678"
 *   "0049 151 2345678"  -> "491512345678"
 *   "0151 2345678"      -> "491512345678"   (ohne Vorwahl: Deutschland)
 *   "+383 44 123 456"   -> "38344123456"    (Kosovo bleibt Kosovo)
 *
 * Zu kurze oder leere Eingaben ergeben null - dann gibt es keinen Link,
 * statt eines Links, der ins Leere fuehrt.
 */
export function whatsappNummer(telefon: string | null | undefined): string | null {
  const roh = (telefon ?? "").trim();
  if (!roh) return null;
  let ziffern = roh.replace(/[^\d+]/g, "");
  if (ziffern.startsWith("+")) ziffern = ziffern.slice(1);
  else if (ziffern.startsWith("00")) ziffern = ziffern.slice(2);
  else if (ziffern.startsWith("0")) ziffern = "49" + ziffern.slice(1);
  ziffern = ziffern.replace(/\D/g, "");
  return ziffern.length >= 8 ? ziffern : null;
}

/** Oeffnet WhatsApp mit dem Text schon im Eingabefeld - nur noch Senden. */
export function whatsappLink(telefon: string | null | undefined, text: string): string | null {
  const nummer = whatsappNummer(telefon);
  if (!nummer) return null;
  return `https://wa.me/${nummer}?text=${encodeURIComponent(text)}`;
}

/** Ein offener Posten fuer die Gesamtaufstellung: Monatsmiete oder Kaution. */
export type OffenerPosten = {
  art: "RENT" | "DEPOSIT";
  jahr: number;
  monat: number;
  offenCents: number;
};

export type RueckstandAngaben = {
  vorname: string;
  posten: OffenerPosten[];
  kontoinhaber: string;
  iban: string;
  bank?: string | null;
};

/** Mieten nach Zeit, die Kaution zuletzt - so liest sich die Liste als Verlauf. */
function sortierePosten(posten: OffenerPosten[]): OffenerPosten[] {
  return [...posten].sort((a, b) => {
    if (a.art !== b.art) return a.art === "RENT" ? -1 : 1;
    return a.jahr * 12 + a.monat - (b.jahr * 12 + b.monat);
  });
}

/**
 * Verwendungszweck fuer mehrere Posten, wieder deutsch fuer den Kontoauszug:
 * "Miete August 2026, September 2026 + Kaution". Nur Kaution: "Kaution".
 */
export function verwendungszweckGesamt(posten: OffenerPosten[]): string {
  const sortiert = sortierePosten(posten);
  const monate = sortiert
    .filter((p) => p.art === "RENT")
    .map((p) => verwendungszweck(p.jahr, p.monat).replace(/^Miete /, ""));
  const kaution = sortiert.some((p) => p.art === "DEPOSIT");
  const teile: string[] = [];
  if (monate.length > 0) teile.push(`Miete ${monate.join(", ")}`);
  if (kaution) teile.push("Kaution");
  return teile.join(" + ");
}

/**
 * Gesamtaufstellung aller Rueckstaende - jede offene Miete einzeln, die
 * Kaution dazu, darunter die Summe. Fuer Mieter, die mehr als einen Monat
 * hinterher sind: Eine Nachricht statt drei, und der Gesamtbetrag steht
 * schwarz auf weiss.
 */
export function rueckstandAlbanisch(a: RueckstandAngaben): string {
  const posten = sortierePosten(a.posten).filter((p) => p.offenCents > 0);
  const summe = posten.reduce((sum, p) => sum + p.offenCents, 0);

  const zeilen = [
    `Përshëndetje ${a.vorname.trim()},`,
    "",
    "sipas të dhënave tona janë ende të papaguara:",
  ];
  for (const p of posten) {
    const monat = MONATE_SQ[p.monat - 1] ?? String(p.monat);
    zeilen.push(
      p.art === "DEPOSIT"
        ? `- Depozita (kaucioni): ${betragSq(p.offenCents)}`
        : `- Qiraja për ${monat} ${p.jahr}: ${betragSq(p.offenCents)}`,
    );
  }
  zeilen.push(
    "",
    `Gjithsej për t'u paguar: ${betragSq(summe)}`,
    "",
    `Ju lutemi ta paguani shumën e plotë sa më shpejt. Qiraja duhet të paguhet gjithmonë deri më ${ZAHLTAG} të çdo muaji.`,
  );

  const iban = a.iban.trim();
  if (iban) {
    zeilen.push(
      "",
      "Të dhënat e bankës:",
      `Mbajtësi i llogarisë: ${a.kontoinhaber.trim()}`,
      `IBAN: ${ibanLesbar(iban)}`,
    );
    if (a.bank?.trim()) zeilen.push(`Banka: ${a.bank.trim()}`);
  }
  zeilen.push("", `Qëllimi i pagesës: ${verwendungszweckGesamt(posten)}`);

  zeilen.push("", "Faleminderit!", "Wohnwerk");
  return zeilen.join("\n");
}

export function mahnungAlbanisch(a: MahnungAngaben): string {
  const monat = MONATE_SQ[a.monat - 1] ?? String(a.monat);
  const zeilen = [
    `Përshëndetje ${a.vorname.trim()},`,
    "",
    `qiraja për ${monat} ${a.jahr} në shumën prej ${betragSq(a.offenCents)} është ende e papaguar.`,
    "",
    `Ju lutemi ta paguani deri më ${ZAHLTAG} ${monat}. Qiraja duhet të paguhet gjithmonë deri më ${ZAHLTAG} të çdo muaji.`,
  ];

  const iban = a.iban.trim();
  if (iban) {
    zeilen.push(
      "",
      "Të dhënat e bankës:",
      `Mbajtësi i llogarisë: ${a.kontoinhaber.trim()}`,
      `IBAN: ${ibanLesbar(iban)}`,
    );
    if (a.bank?.trim()) zeilen.push(`Banka: ${a.bank.trim()}`);
  }
  zeilen.push("", `Qëllimi i pagesës: ${verwendungszweck(a.jahr, a.monat)}`);

  zeilen.push("", "Faleminderit!", "Wohnwerk");
  return zeilen.join("\n");
}
