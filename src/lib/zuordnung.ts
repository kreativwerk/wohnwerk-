/**
 * Welche Forderungen tilgt eine Zahlung? Reine Funktionen ohne Datenbank,
 * damit die Regeln testbar sind.
 *
 * Die Regeln, in dieser Reihenfolge:
 *  1. Nennt der Verwendungszweck "Kaution", geht das Geld zuerst an die
 *     Kaution.
 *  2. Nennt er Monate ("Miete September", "10/26", "Qiraja tetor"), geht es
 *     an genau diese Monate.
 *  3. Sonst der Reihe nach gegen alles schon Faellige, aelteste zuerst -
 *     offene Forderungen und von Hand abgehakte Monate um den Zahlungstag,
 *     zu denen noch kein Geld eingegangen ist. Kommt die Zahlung spaet, ist
 *     sie sehr wahrscheinlich genau das, was abgehakt wurde, und rutscht
 *     nicht auf den naechsten Monat.
 *  4. Dann abgehakte Monate um den Zahlungstag, die noch nicht faellig sind.
 *  5. Erst zuletzt an eine Forderung, die in den naechsten zehn Tagen
 *     faellig wird (Vorauszahlung). Weiter in die Zukunft nie.
 */

export type ZuordnungsForderung = {
  id: string;
  kind: "RENT" | "DEPOSIT" | string;
  jahr: number;
  monat: number;
  dueDate: Date;
  amountCents: number;
  /** Schon zugeordnete Zahlungen. */
  zugeordnetCents: number;
  status: string;
  /** Von Hand als bezahlt abgehakt (Notiz "Manuell bestätigt"). */
  manuell: boolean;
};

export type ZuordnungsPosten = { forderungId: string; cents: number };

const TAG = 86_400_000;
const VORAUS_TAGE = 10;

/** Monatsnamen in den Sprachen der Bewohner - ganze Woerter, kleingeschrieben, ohne Akzente. */
const MONATSWOERTER: Record<number, string[]> = {
  1: ["januar", "january", "jan", "janar", "ianuarie", "januari", "január", "januar", "январь", "януари"],
  2: ["februar", "february", "feb", "shkurt", "februarie", "február", "февруари"],
  3: ["marz", "maerz", "march", "mars", "martie", "marcius", "март"],
  4: ["april", "apr", "prill", "aprilie", "aprilis", "април"],
  5: ["mai", "may", "maj", "majus", "май"],
  6: ["juni", "june", "jun", "qershor", "iunie", "junius", "юни"],
  7: ["juli", "july", "jul", "korrik", "iulie", "julius", "юли"],
  8: ["august", "aug", "gusht", "augusztus", "август"],
  9: ["september", "sept", "sep", "shtator", "septembrie", "szeptember", "semptember", "septemer", "септември"],
  10: ["oktober", "october", "okt", "oct", "tetor", "octombrie", "oktober", "octomber", "октомври"],
  11: ["november", "nov", "nentor", "noiembrie", "ноември"],
  12: ["dezember", "december", "dez", "dec", "dhjetor", "decembrie", "декември"],
};

function ohneAkzente(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Albanisch haengt Endungen an ("shtatorit", "tetorin") - lange Woerter
 * gelten deshalb auch als Wortanfang. Kurze ("mai", "jun") nur als ganzes
 * Wort, sonst wird aus "Maier" ein Mai.
 */
function monatAusWort(wort: string): number | null {
  for (const [monat, woerter] of Object.entries(MONATSWOERTER)) {
    for (const w of woerter) {
      const kandidat = ohneAkzente(w);
      if (wort === kandidat || (kandidat.length >= 6 && wort.startsWith(kandidat))) return Number(monat);
    }
  }
  return null;
}

/** Jahr zu einem Monat ohne Jahresangabe: das, bei dem der Monat dem Zahlungstag am naechsten liegt. */
function naechstesJahr(monat: number, bezug: Date): number {
  const jahr = bezug.getUTCFullYear();
  const index = jahr * 12 + bezug.getUTCMonth();
  let besterJahr = jahr;
  let besterAbstand = Infinity;
  for (const j of [jahr - 1, jahr, jahr + 1]) {
    const abstand = Math.abs(j * 12 + monat - 1 - index);
    if (abstand < besterAbstand) {
      besterAbstand = abstand;
      besterJahr = j;
    }
  }
  return besterJahr;
}

/**
 * Monate, die im Verwendungszweck stehen. "Miete September 2026, Oktober
 * 2026" -> September und Oktober; "Miete 10/26" -> Oktober 2026.
 * Datumsstempel der Bank ("DATUM 14.08.2026") zaehlen nicht.
 */
export function monateAusText(text: string | null | undefined, bezug: Date): Array<{ jahr: number; monat: number }> {
  const roh = ohneAkzente(text ?? "");
  if (!roh.trim()) return [];
  const gefunden = new Map<string, { jahr: number; monat: number }>();
  const merke = (jahr: number, monat: number) => gefunden.set(`${jahr}-${monat}`, { jahr, monat });

  // Zahlen: 10/26, 09/2026, 10.2026 - aber nicht der Monat in 14.08.2026.
  for (const treffer of roh.matchAll(/(?<![\d./-])(0?[1-9]|1[0-2])[./-](20\d{2}|\d{2})(?![\d./])/g)) {
    const monat = Number(treffer[1]);
    const jahrRoh = Number(treffer[2]);
    merke(jahrRoh < 100 ? 2000 + jahrRoh : jahrRoh, monat);
  }

  // Woerter, mit Jahr dahinter, wenn eines steht.
  const woerter = [...roh.matchAll(/[\p{L}]+|\d{4}/gu)].map((m) => m[0]);
  woerter.forEach((wort, i) => {
    const monat = monatAusWort(wort);
    if (!monat) return;
    const danach = woerter[i + 1];
    const jahr = danach && /^20\d{2}$/.test(danach) ? Number(danach) : naechstesJahr(monat, bezug);
    merke(jahr, monat);
  });

  return [...gefunden.values()].sort((a, b) => a.jahr * 12 + a.monat - (b.jahr * 12 + b.monat));
}

export function nenntKaution(text: string | null | undefined): boolean {
  return /kaution|kaucion|kaucjon|kauci|depozit|deposit|garantie|garancia|garantia|garanci/i.test(ohneAkzente(text ?? ""));
}

function rest(f: ZuordnungsForderung): number {
  return Math.max(0, f.amountCents - f.zugeordnetCents);
}

function offen(f: ZuordnungsForderung): boolean {
  return (f.status === "OPEN" || f.status === "PARTIAL") && rest(f) > 0;
}

/** Von Hand abgehakt, aber noch ohne (volle) Zahlung dahinter. */
function unbelegt(f: ZuordnungsForderung): boolean {
  return f.status === "PAID" && f.manuell && rest(f) > 0;
}

function nachDatum(a: ZuordnungsForderung, b: ZuordnungsForderung): number {
  return a.dueDate.getTime() - b.dueDate.getTime() || (a.kind === "DEPOSIT" ? -1 : 1);
}

/**
 * Plant die Verteilung einer Zahlung auf die Forderungen EINES Mieters.
 * Gibt die Posten in Tilgungsreihenfolge zurueck; was nicht passt, bleibt
 * frei und wird in der Oberflaeche von Hand entschieden.
 */
export function zuordnungPlanen(
  zahlung: { bookingDate: Date; freiCents: number; text: string },
  forderungen: ZuordnungsForderung[],
): ZuordnungsPosten[] {
  const kandidaten = forderungen.filter((f) => f.status !== "WAIVED" && (offen(f) || unbelegt(f)));
  const reihenfolge: ZuordnungsForderung[] = [];
  const nimm = (liste: ZuordnungsForderung[]) => {
    for (const f of liste.sort(nachDatum)) if (!reihenfolge.includes(f)) reihenfolge.push(f);
  };

  const tag = zahlung.bookingDate.getTime();
  const monate = monateAusText(zahlung.text, zahlung.bookingDate);
  const zahlungsMonat = zahlung.bookingDate.getUTCFullYear() * 12 + zahlung.bookingDate.getUTCMonth();

  if (nenntKaution(zahlung.text)) nimm(kandidaten.filter((f) => f.kind === "DEPOSIT"));
  if (monate.length > 0) {
    nimm(kandidaten.filter((f) => f.kind === "RENT" && monate.some((m) => m.jahr === f.jahr && m.monat === f.monat)));
  }
  // Von Hand abgehakt, aber das Geld kam erst spaeter: Monate um den
  // Zahlungstag (dieser und der vorige) werden mit der Zahlung belegt.
  const imFenster = (f: ZuordnungsForderung) => {
    const index = f.jahr * 12 + f.monat - 1;
    return index === zahlungsMonat || index === zahlungsMonat - 1;
  };
  // 3. Alles schon Faellige - offen oder abgehakt-ohne-Geld - der Reihe
  //    nach, aelteste zuerst. So wird die Zahlung zuerst gegen den
  //    aeltesten Posten gerechnet, auch wenn sie spaet kommt.
  nimm(kandidaten.filter((f) => f.dueDate.getTime() <= tag && (offen(f) || (unbelegt(f) && imFenster(f)))));
  // 4. Abgehakte Monate im Fenster, die erst nach dem Zahlungstag faellig sind.
  nimm(kandidaten.filter((f) => unbelegt(f) && imFenster(f)));
  // 5. Vorauszahlung fuer bald Faelliges.
  nimm(kandidaten.filter((f) => offen(f) && f.dueDate.getTime() > tag && f.dueDate.getTime() <= tag + VORAUS_TAGE * TAG));

  const posten: ZuordnungsPosten[] = [];
  let frei = zahlung.freiCents;
  for (const f of reihenfolge) {
    if (frei <= 0) break;
    const betrag = Math.min(frei, rest(f));
    if (betrag <= 0) continue;
    posten.push({ forderungId: f.id, cents: betrag });
    frei -= betrag;
  }
  return posten;
}

// ---------------------------------------------------------------------------
// Wer hat gezahlt? Namensabgleich mit Tippfehler-Toleranz
// ---------------------------------------------------------------------------

/** Kleinbuchstaben ohne Akzente, nur a-z und Ziffern. */
export function nameNormal(wert: string | null | undefined): string {
  return ohneAkzente(wert ?? "").replace(/[^a-z0-9]/g, "");
}

/**
 * Editierabstand mit Vertauschung zweier Nachbarbuchstaben als einem
 * Schritt ("Allija" / "Alliaj" = 1).
 */
export function namensAbstand(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + kosten);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Wie viele Abweichungen ein Name dieser Laenge vertraegt. */
function toleranz(laenge: number): number {
  if (laenge >= 7) return 2;
  if (laenge >= 4) return 1;
  return 0;
}

function wortPasst(woerter: string[], gesucht: string, zusammen: string): boolean {
  if (!gesucht) return true;
  if (zusammen.includes(gesucht)) return true;
  const grenze = toleranz(gesucht.length);
  return grenze > 0 && woerter.some((w) => Math.abs(w.length - gesucht.length) <= grenze && namensAbstand(w, gesucht) <= grenze);
}

/**
 * Passt der Zahlungstext zum Mieter? Nachname und Vorname muessen beide
 * vorkommen - genau oder mit kleinen Schreibabweichungen ("Hajdinaj" /
 * "Haradinaj", "Gezim" / "Gzim"). Alternativ der Firmenname.
 */
export function mieterPasst(
  text: string,
  mieter: { firstName: string; lastName: string; company?: string | null },
): boolean {
  const zusammen = nameNormal(text);
  if (!zusammen) return false;
  const woerter = ohneAkzente(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

  const nachname = nameNormal(mieter.lastName);
  const vorname = nameNormal(mieter.firstName);
  const firma = nameNormal(mieter.company);

  if (firma.length >= 4 && zusammen.includes(firma)) return true;
  if (nachname.length < 3) return false;
  if (!wortPasst(woerter, nachname, zusammen)) return false;
  // Vorname: genau, die ersten vier Buchstaben ("Florjan" / "Florijan") oder mit Abweichung.
  return !vorname || (vorname.length >= 4 && zusammen.includes(vorname.slice(0, 4))) || wortPasst(woerter, vorname, zusammen);
}
