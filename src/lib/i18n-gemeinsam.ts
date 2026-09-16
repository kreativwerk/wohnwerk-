import { formatCents } from "./money";
import { formatDate, formatDateTime, formatMonth, formatMonthShort, type Locale } from "./dates";
import { WOERTERBUCH_EN } from "./woerterbuch-en";

/**
 * Der Teil der Zweisprachigkeit, den auch Client-Komponenten brauchen
 * (Navigation, Menueleiste). Ohne "server-only", sonst laesst er sich
 * dort nicht einbinden. Alles, was Cookies liest, steht in i18n.ts.
 *
 * Als Schluessel dient der deutsche Text selbst: der Aufrufort bleibt
 * lesbar, und eine fehlende Uebersetzung faellt still auf das Deutsche
 * zurueck statt einen Schluessel anzuzeigen.
 */

export const SPRACHEN = ["de", "en"] as const;
export type Sprache = (typeof SPRACHEN)[number];

export const SPRACH_COOKIE = "ww_sprache";

export const SPRACH_NAME: Record<Sprache, string> = {
  de: "Deutsch",
  en: "English",
};

export function istSprache(wert: string | undefined | null): wert is Sprache {
  return wert === "de" || wert === "en";
}

/** Zahlen und Namen, die in einen Satz eingesetzt werden. */
export type Werte = Record<string, string | number>;

export type Uebersetzen = (text: string, werte?: Werte) => string;

/**
 * Setzt {platzhalter} ein. So bleibt der Satzbau in der Hand der
 * Uebersetzung: "Ticket {nummer} wurde angelegt." darf auf Englisch
 * "Ticket {nummer} has been created." heissen, ohne dass der Aufrufer
 * Bruchstuecke zusammenkleben muss.
 */
function einsetzen(text: string, werte?: Werte): string {
  if (!werte) return text;
  return text.replace(/\{(\w+)\}/g, (ganz, name) =>
    name in werte ? String(werte[name]) : ganz,
  );
}

/** Uebersetzt einen deutschen Text in die angegebene Sprache. */
export function uebersetzeIn(sprache: Sprache): Uebersetzen {
  if (sprache === "de") return (text, werte) => einsetzen(text, werte);
  return (text, werte) => einsetzen(WOERTERBUCH_EN[text] ?? text, werte);
}

export const LOCALE: Record<Sprache, Locale> = {
  de: "de-DE",
  en: "en-GB",
};

/**
 * Alles, was eine Seite zum Anzeigen braucht, an einer Stelle:
 *
 *   const { t, datum, geld } = oberflaecheIn(sprache);
 *   <p>{t("Eingegangen am")} {datum(zahlung.datum)} · {geld(zahlung.cents)}</p>
 *
 * Die Formate haengen an derselben Sprache wie die Texte - sonst steht
 * unter einer englischen Ueberschrift ein deutsches Datum.
 */
export function oberflaecheIn(sprache: Sprache) {
  const locale = LOCALE[sprache];
  return {
    sprache,
    locale,
    t: uebersetzeIn(sprache),
    datum: (d: Date | string | null | undefined) => formatDate(d, locale),
    datumZeit: (d: Date | string | null | undefined) => formatDateTime(d, locale),
    monat: (jahr: number, monat: number) => formatMonth(jahr, monat, locale),
    monatKurz: (d: Date) => formatMonthShort(d, locale),
    geld: (cents: number | null | undefined) => formatCents(cents, locale),
  };
}

export type Oberflaeche = ReturnType<typeof oberflaecheIn>;
