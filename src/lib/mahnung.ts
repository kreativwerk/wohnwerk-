/**
 * Zahlungserinnerung in der Sprache des Mieters - zum Kopieren oder direkt
 * fuer WhatsApp.
 *
 * Die Monteure kommen aus Albanien, dem Kosovo, Bulgarien, Rumaenien und
 * Ungarn; manche lesen Englisch. Eine Erinnerung, die sie ohne Umweg
 * verstehen, wird bezahlt; eine deutsche wird weitergereicht und
 * vergessen. Deshalb entsteht der Text hier fertig, mit Betrag, Monat und
 * Bankverbindung - die Hausverwaltung waehlt die Sprache und drueckt
 * Kopieren.
 *
 * Zwei Texte: die Erinnerung fuer einen Monat und die Gesamtaufstellung
 * aller Rueckstaende samt Kaution. Reine Funktionen ohne Datenbank, damit
 * sie sich testen lassen.
 */

/**
 * Bis zu diesem Tag des Monats muss die Miete da sein.
 *
 * Fest verdrahtet, weil die Hausverwaltung es so handhabt - unabhaengig
 * davon, was als Faelligkeit im Mietverhaeltnis steht (dort ist ueberall
 * der 1. hinterlegt). Wer den Tag aendert, aendert ihn hier.
 */
export const ZAHLTAG = 15;

export const MAHN_SPRACHEN = ["sq", "bg", "ro", "hu", "en"] as const;
export type MahnSprache = (typeof MAHN_SPRACHEN)[number];

/** Deutsche Namen fuer die Auswahl - werden ueber t() uebersetzt. */
export const MAHN_SPRACHE_NAME: Record<MahnSprache, string> = {
  sq: "Albanisch",
  bg: "Bulgarisch",
  ro: "Rumänisch",
  hu: "Ungarisch",
  en: "Englisch",
};

export function istMahnSprache(wert: string | undefined | null): wert is MahnSprache {
  return MAHN_SPRACHEN.includes(wert as MahnSprache);
}

export type MahnungAngaben = {
  vorname: string;
  jahr: number;
  monat: number;
  offenCents: number;
  kontoinhaber: string;
  iban: string;
  bank?: string | null;
};

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

/**
 * Der Verwendungszweck steht auf dem deutschen Kontoauszug - deshalb
 * deutsch, in jeder Sprache: "Miete September 2026". Immer nach diesem
 * Muster, unabhaengig von der Vertragsnummer; so erkennt die Buchhaltung
 * auf einen Blick, welcher Monat gezahlt wurde.
 */
export function verwendungszweck(jahr: number, monat: number): string {
  const name = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(Date.UTC(jahr, monat - 1, 1)));
  return `Miete ${name} ${jahr}`;
}

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

// ---------------------------------------------------------------------------
// Sprachpakete
// ---------------------------------------------------------------------------

/** Alles, was sich zwischen den Sprachen unterscheidet - je Sprache ein Paket. */
type Sprachpaket = {
  /** Intl-Locale fuer Betrag und Monatsname. */
  locale: string;
  /** "September 2026" bzw. "2026. szeptember" - Reihenfolge ist Sache der Sprache. */
  monatJahr: (monat: string, jahr: number) => string;
  anrede: (vorname: string) => string;
  /** Die Monatsmiete fuer X in Hoehe von Y ist noch offen. */
  einzelOffen: (monatJahr: string, betrag: string) => string;
  /** Bitte bis zum 15. X zahlen. Die Miete ist immer bis zum 15. faellig. */
  einzelFrist: (tag: number, monat: string) => string;
  gesamtEinleitung: string;
  gesamtMiete: (monatJahr: string, betrag: string) => string;
  gesamtKaution: (betrag: string) => string;
  gesamtSumme: (betrag: string) => string;
  gesamtFrist: (tag: number) => string;
  bankUeberschrift: string;
  kontoinhaber: string;
  bank: string;
  zweck: string;
  /** Wer neu ist und noch nicht genug verdient hat, soll den Arbeitgeber um Vorschuss bitten - steht unten in jeder Nachricht. */
  vorschuss: string;
  dank: string;
};

const PAKETE: Record<MahnSprache, Sprachpaket> = {
  sq: {
    locale: "sq",
    monatJahr: (m, j) => `${m} ${j}`,
    anrede: (v) => `Përshëndetje ${v},`,
    einzelOffen: (mj, b) => `qiraja për ${mj} në shumën prej ${b} është ende e papaguar.`,
    einzelFrist: (tag, m) =>
      `Ju lutemi ta paguani deri më ${tag} ${m}. Qiraja duhet të paguhet gjithmonë deri më ${tag} të çdo muaji.`,
    gesamtEinleitung: "sipas të dhënave tona janë ende të papaguara:",
    gesamtMiete: (mj, b) => `- Qiraja për ${mj}: ${b}`,
    gesamtKaution: (b) => `- Depozita (kaucioni): ${b}`,
    gesamtSumme: (b) => `Gjithsej për t'u paguar: ${b}`,
    gesamtFrist: (tag) =>
      `Ju lutemi ta paguani shumën e plotë sa më shpejt. Qiraja duhet të paguhet gjithmonë deri më ${tag} të çdo muaji.`,
    bankUeberschrift: "Të dhënat e bankës:",
    kontoinhaber: "Mbajtësi i llogarisë:",
    bank: "Banka:",
    zweck: "Qëllimi i pagesës:",
    vorschuss: "Nëse jeni të rinj dhe ende nuk keni fituar para të mjaftueshme, mund të kërkoni një paradhënie nga firma juaj.",
    dank: "Faleminderit!",
  },
  bg: {
    locale: "bg",
    monatJahr: (m, j) => `${m} ${j} г.`,
    anrede: (v) => `Здравейте, ${v},`,
    einzelOffen: (mj, b) => `наемът за ${mj} в размер на ${b} все още не е платен.`,
    einzelFrist: (tag, m) =>
      `Моля, платете до ${tag} ${m}. Наемът трябва винаги да се плаща до ${tag}-о число на всеки месец.`,
    gesamtEinleitung: "според нашите данни все още не са платени:",
    gesamtMiete: (mj, b) => `- Наем за ${mj}: ${b}`,
    gesamtKaution: (b) => `- Депозит (гаранция): ${b}`,
    gesamtSumme: (b) => `Общо за плащане: ${b}`,
    gesamtFrist: (tag) =>
      `Моля, платете цялата сума възможно най-скоро. Наемът трябва винаги да се плаща до ${tag}-о число на всеки месец.`,
    bankUeberschrift: "Банкови данни:",
    kontoinhaber: "Титуляр на сметката:",
    bank: "Банка:",
    zweck: "Основание за плащане:",
    vorschuss: "Ако сте нови и още не сте изкарали достатъчно пари, можете да поискате аванс от вашата фирма.",
    dank: "Благодарим!",
  },
  ro: {
    locale: "ro",
    monatJahr: (m, j) => `${m} ${j}`,
    anrede: (v) => `Bună ziua, ${v},`,
    einzelOffen: (mj, b) => `chiria pentru ${mj} în valoare de ${b} este încă neplătită.`,
    einzelFrist: (tag, m) =>
      `Vă rugăm să plătiți până la ${tag} ${m}. Chiria trebuie plătită întotdeauna până pe data de ${tag} a fiecărei luni.`,
    gesamtEinleitung: "conform evidențelor noastre, sunt încă neplătite:",
    gesamtMiete: (mj, b) => `- Chiria pentru ${mj}: ${b}`,
    gesamtKaution: (b) => `- Garanția (depozitul): ${b}`,
    gesamtSumme: (b) => `Total de plată: ${b}`,
    gesamtFrist: (tag) =>
      `Vă rugăm să plătiți întreaga sumă cât mai curând. Chiria trebuie plătită întotdeauna până pe data de ${tag} a fiecărei luni.`,
    bankUeberschrift: "Date bancare:",
    kontoinhaber: "Titularul contului:",
    bank: "Banca:",
    zweck: "Detalii plată:",
    vorschuss: "Dacă sunteți noi și încă nu ați câștigat destui bani, puteți cere un avans de la firma dumneavoastră.",
    dank: "Mulțumim!",
  },
  hu: {
    locale: "hu",
    monatJahr: (m, j) => `${j}. ${m}`,
    anrede: (v) => `Kedves ${v}!`,
    einzelOffen: (mj, b) => `A ${mj} havi bérleti díj (${b}) még nincs kifizetve.`,
    // "15-éig": bis zum 15. - die Endung passt zum Zahltag 15; wer den
    // Zahltag aendert, prueft die ungarische Endung mit.
    einzelFrist: (tag, m) =>
      `Kérjük, fizesse be ${m} ${tag}-éig. A bérleti díjat mindig minden hónap ${tag}-éig kell befizetni.`,
    gesamtEinleitung: "Nyilvántartásunk szerint még nincs kifizetve:",
    gesamtMiete: (mj, b) => `- ${mj} havi bérleti díj: ${b}`,
    gesamtKaution: (b) => `- Kaució (letét): ${b}`,
    gesamtSumme: (b) => `Fizetendő összesen: ${b}`,
    gesamtFrist: (tag) =>
      `Kérjük, a teljes összeget mielőbb fizesse be. A bérleti díjat mindig minden hónap ${tag}-éig kell befizetni.`,
    bankUeberschrift: "Banki adatok:",
    kontoinhaber: "Számlatulajdonos:",
    bank: "Bank:",
    zweck: "Közlemény:",
    vorschuss: "Ha új és még nem keresett elég pénzt, kérhet előleget a cégétől.",
    dank: "Köszönjük!",
  },
  en: {
    locale: "en-GB",
    monatJahr: (m, j) => `${m} ${j}`,
    anrede: (v) => `Hello ${v},`,
    einzelOffen: (mj, b) => `the rent for ${mj} of ${b} is still unpaid.`,
    einzelFrist: (tag, m) =>
      `Please pay by ${ordinalEn(tag)} ${m}. Rent must always be paid by the ${ordinalEn(tag)} of each month.`,
    gesamtEinleitung: "according to our records, the following is still outstanding:",
    gesamtMiete: (mj, b) => `- Rent for ${mj}: ${b}`,
    gesamtKaution: (b) => `- Deposit: ${b}`,
    gesamtSumme: (b) => `Total due: ${b}`,
    gesamtFrist: (tag) =>
      `Please pay the full amount as soon as possible. Rent must always be paid by the ${ordinalEn(tag)} of each month.`,
    bankUeberschrift: "Bank details:",
    kontoinhaber: "Account holder:",
    bank: "Bank:",
    zweck: "Payment reference:",
    vorschuss: "If you are new and have not earned enough money yet, you can ask your company for an advance.",
    dank: "Thank you!",
  },
};

function ordinalEn(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Albanische Monatsnamen von Hand: Intl liefert sie je nach ICU-Stand nicht immer. */
const MONATE_SQ = [
  "janar", "shkurt", "mars", "prill", "maj", "qershor",
  "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor",
];

function monatsname(sprache: MahnSprache, monat: number): string {
  if (sprache === "sq") return MONATE_SQ[monat - 1] ?? String(monat);
  return new Intl.DateTimeFormat(PAKETE[sprache].locale, { month: "long" }).format(new Date(Date.UTC(2026, monat - 1, 1)));
}

/** "350,00 €" bzw. "€350.00" - so, wie die Sprache es gewohnt ist. */
function betrag(sprache: MahnSprache, cents: number): string {
  return new Intl.NumberFormat(PAKETE[sprache].locale, {
    style: "currency",
    currency: "EUR",
    // Rumaenisch und Ungarisch schreiben sonst "EUR" statt "€" - das
    // Zeichen versteht jeder.
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function bankblock(p: Sprachpaket, kontoinhaber: string, iban: string, bank?: string | null): string[] {
  const sauber = iban.trim();
  if (!sauber) return [];
  const zeilen = ["", p.bankUeberschrift, `${p.kontoinhaber} ${kontoinhaber.trim()}`, `IBAN: ${ibanLesbar(sauber)}`];
  if (bank?.trim()) zeilen.push(`${p.bank} ${bank.trim()}`);
  return zeilen;
}

/** Erinnerung fuer einen Monat in der gewaehlten Sprache. */
export function mahnungText(sprache: MahnSprache, a: MahnungAngaben): string {
  const p = PAKETE[sprache];
  const monat = monatsname(sprache, a.monat);
  const zeilen = [
    p.anrede(a.vorname.trim()),
    "",
    p.einzelOffen(p.monatJahr(monat, a.jahr), betrag(sprache, a.offenCents)),
    "",
    p.einzelFrist(ZAHLTAG, monat),
    ...bankblock(p, a.kontoinhaber, a.iban, a.bank),
    "",
    `${p.zweck} ${verwendungszweck(a.jahr, a.monat)}`,
    "",
    p.vorschuss,
    "",
    p.dank,
    "Wohnwerk",
  ];
  return zeilen.join("\n");
}

/**
 * Gesamtaufstellung aller Rueckstaende - jede offene Miete einzeln, die
 * Kaution dazu, darunter die Summe. Fuer Mieter, die mehr als einen Monat
 * hinterher sind: Eine Nachricht statt drei, und der Gesamtbetrag steht
 * schwarz auf weiss.
 */
export function rueckstandText(sprache: MahnSprache, a: RueckstandAngaben): string {
  const p = PAKETE[sprache];
  const posten = sortierePosten(a.posten).filter((x) => x.offenCents > 0);
  const summe = posten.reduce((sum, x) => sum + x.offenCents, 0);

  const zeilen = [p.anrede(a.vorname.trim()), "", p.gesamtEinleitung];
  for (const x of posten) {
    zeilen.push(
      x.art === "DEPOSIT"
        ? p.gesamtKaution(betrag(sprache, x.offenCents))
        : p.gesamtMiete(p.monatJahr(monatsname(sprache, x.monat), x.jahr), betrag(sprache, x.offenCents)),
    );
  }
  zeilen.push(
    "",
    p.gesamtSumme(betrag(sprache, summe)),
    "",
    p.gesamtFrist(ZAHLTAG),
    ...bankblock(p, a.kontoinhaber, a.iban, a.bank),
    "",
    `${p.zweck} ${verwendungszweckGesamt(posten)}`,
    "",
    p.vorschuss,
    "",
    p.dank,
    "Wohnwerk",
  );
  return zeilen.join("\n");
}

/** Albanisch ist die Vorgabe - die meisten Bewohner kommen aus dem Kosovo und Albanien. */
export function mahnungAlbanisch(a: MahnungAngaben): string {
  return mahnungText("sq", a);
}

export function rueckstandAlbanisch(a: RueckstandAngaben): string {
  return rueckstandText("sq", a);
}
