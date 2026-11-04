/**
 * Mieten, die WIR zahlen: an die Vermieter der angemieteten Objekte.
 *
 * Reine Funktionen ohne Datenbank - Faelligkeit nach Vertrag ("am 3.
 * Werktag", "zum 1."), anteilige Monate und welche Ueberweisung welchen
 * Monat bezahlt hat. So laesst es sich testen und rechnet auf Seite und
 * Dashboard gleich.
 */

import { monatsanteil } from "./mietanteil";
import { monateAusText } from "./zuordnung";

/** TAG = fester Kalendertag ("zum 1."), WERKTAG = n-ter Werktag des Monats. */
export type FaelligArt = "TAG" | "WERKTAG";

export type Mietvertrag = {
  id: string;
  betragCents: number;
  faelligTag: number;
  faelligArt: string;
  beginn: Date;
  ende: Date | null;
};

export type MietZahlung = {
  id: string;
  datum: Date;
  /** positiv: was abgeflossen ist */
  betragCents: number;
  zweck: string | null;
};

export type MonatsStatus = "BEZAHLT" | "TEILWEISE" | "OFFEN" | "UEBERFAELLIG";

export type Mietmonat = {
  jahr: number;
  monat: number;
  faellig: Date;
  sollCents: number;
  bezahltCents: number;
  zahlungen: string[];
  status: MonatsStatus;
  anteilig: boolean;
};

const TAG = 24 * 60 * 60 * 1000;

function utc(jahr: number, monat: number, tag: number): Date {
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

function schluessel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Ostersonntag (Gauss/Meeus) als UTC-Mitternacht. */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(jahr, monat, tag);
}

/**
 * Gesetzliche Feiertage in ganz Bayern. Mariae Himmelfahrt und das
 * Augsburger Friedensfest gelten nur oertlich und fehlen bewusst: lieber
 * einen Tag zu frueh zahlen als zu spaet.
 */
export function feiertageBayern(jahr: number): Set<string> {
  const ostern = ostersonntag(jahr).getTime();
  const relativ = (tage: number) => schluessel(new Date(ostern + tage * TAG));
  return new Set([
    schluessel(utc(jahr, 1, 1)),
    schluessel(utc(jahr, 1, 6)),
    relativ(-2), // Karfreitag
    relativ(1), // Ostermontag
    schluessel(utc(jahr, 5, 1)),
    relativ(39), // Christi Himmelfahrt
    relativ(50), // Pfingstmontag
    relativ(60), // Fronleichnam
    schluessel(utc(jahr, 10, 3)),
    schluessel(utc(jahr, 11, 1)),
    schluessel(utc(jahr, 12, 25)),
    schluessel(utc(jahr, 12, 26)),
  ]);
}

/**
 * Werktag fuer die Mietzahlung: Montag bis Freitag ohne Feiertag. Der
 * Samstag zaehlt nach BGH (VIII ZR 222/15) bei der Mietzahlung nicht mit.
 */
export function istWerktag(d: Date): boolean {
  const wochentag = d.getUTCDay();
  if (wochentag === 0 || wochentag === 6) return false;
  return !feiertageBayern(d.getUTCFullYear()).has(schluessel(d));
}

/** Der n-te Werktag eines Monats. */
export function nterWerktag(jahr: number, monat: number, n: number): Date {
  let gezaehlt = 0;
  for (let tag = 1; tag <= 31; tag += 1) {
    const d = utc(jahr, monat, tag);
    if (d.getUTCMonth() !== monat - 1) break;
    if (istWerktag(d)) {
      gezaehlt += 1;
      if (gezaehlt >= Math.max(1, n)) return d;
    }
  }
  return utc(jahr, monat + 1, 0);
}

/** Faelligkeit des Monats laut Vertrag. */
export function faelligAm(v: Pick<Mietvertrag, "faelligTag" | "faelligArt">, jahr: number, monat: number): Date {
  if (v.faelligArt === "WERKTAG") return nterWerktag(jahr, monat, v.faelligTag);
  const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return utc(jahr, monat, Math.min(Math.max(v.faelligTag, 1), tageImMonat));
}

/** "3. Werktag" / "zum 1." - fuer die Anzeige. */
export function faelligkeitsRegel(v: Pick<Mietvertrag, "faelligTag" | "faelligArt">): string {
  return v.faelligArt === "WERKTAG" ? `${v.faelligTag}. Werktag` : `zum ${v.faelligTag}.`;
}

/**
 * Alle Monate eines Vertrags zwischen `von` und `bis` (je einschliesslich)
 * mit Soll und Faelligkeit. Erster und letzter Monat anteilig; beginnt der
 * Vertrag nach dem Stichtag, ist die erste Miete zum Beginn faellig.
 */
export function vertragsMonate(v: Mietvertrag, von: Date, bis: Date): Array<Omit<Mietmonat, "bezahltCents" | "zahlungen" | "status">> {
  const ergebnis: Array<Omit<Mietmonat, "bezahltCents" | "zahlungen" | "status">> = [];
  const start = new Date(Math.max(von.getTime(), v.beginn.getTime()));
  const ende = v.ende && v.ende < bis ? v.ende : bis;
  let jahr = start.getUTCFullYear();
  let monat = start.getUTCMonth() + 1;
  for (let i = 0; i < 240; i += 1) {
    const monatsanfang = utc(jahr, monat, 1);
    if (monatsanfang > ende) break;
    const anteil = monatsanteil({ startDate: v.beginn, endDate: v.ende, monthlyRentCents: v.betragCents }, jahr, monat);
    let faellig = faelligAm(v, jahr, monat);
    const beginnTag = utc(v.beginn.getUTCFullYear(), v.beginn.getUTCMonth() + 1, v.beginn.getUTCDate());
    if (beginnTag > faellig && beginnTag.getUTCMonth() === monat - 1 && beginnTag.getUTCFullYear() === jahr) faellig = beginnTag;
    if (anteil.amountCents > 0) {
      ergebnis.push({ jahr, monat, faellig, sollCents: anteil.amountCents, anteilig: anteil.partial });
    }
    monat += 1;
    if (monat > 12) {
      monat = 1;
      jahr += 1;
    }
  }
  return ergebnis;
}

/**
 * Ordnet die Zahlungen an einen Vermieter den Monaten zu: zuerst ueber den
 * Monat im Verwendungszweck ("Miete 10/2026"), sonst an den offenen Monat,
 * dessen Faelligkeit am naechsten liegt (bis 25 Tage vorher, 45 danach).
 * Eine Zahlung zaehlt nur einmal.
 */
export function monateMitZahlungen(
  monate: Array<Omit<Mietmonat, "bezahltCents" | "zahlungen" | "status">>,
  zahlungen: MietZahlung[],
  heute: Date,
): Mietmonat[] {
  const liste: Mietmonat[] = monate.map((m) => ({ ...m, bezahltCents: 0, zahlungen: [], status: "OFFEN" }));
  const rest = (m: Mietmonat) => m.sollCents - m.bezahltCents;
  const buche = (m: Mietmonat, z: MietZahlung) => {
    m.bezahltCents += z.betragCents;
    m.zahlungen.push(z.id);
  };

  const ohneMonat: MietZahlung[] = [];
  for (const z of [...zahlungen].sort((a, b) => a.datum.getTime() - b.datum.getTime())) {
    const genannt = monateAusText(z.zweck, z.datum)
      .map((g) => liste.find((m) => m.jahr === g.jahr && m.monat === g.monat))
      .filter((m): m is Mietmonat => Boolean(m));
    if (genannt.length === 1) {
      buche(genannt[0], z);
    } else if (genannt.length > 1) {
      // Mehrere Monate in einer Zahlung: der Reihe nach auffuellen.
      let uebrig = z.betragCents;
      genannt.forEach((m, i) => {
        const teil = i === genannt.length - 1 ? uebrig : Math.min(uebrig, Math.max(0, rest(m)));
        m.bezahltCents += teil;
        m.zahlungen.push(z.id);
        uebrig -= teil;
      });
    } else {
      ohneMonat.push(z);
    }
  }

  for (const z of ohneMonat) {
    const kandidaten = liste
      .filter((m) => rest(m) > 0)
      .filter((m) => {
        const abstand = (z.datum.getTime() - m.faellig.getTime()) / TAG;
        return abstand >= -25 && abstand <= 45;
      })
      // Der frueheste offene Monat zuerst - eine Zahlung tilgt erst das Aeltere.
      .sort((a, b) => a.faellig.getTime() - b.faellig.getTime());
    const ziel = kandidaten[0];
    if (ziel) buche(ziel, z);
  }

  for (const m of liste) {
    // Ein Euro Toleranz fuer Rundungen bei anteiligen Monaten.
    if (m.bezahltCents >= m.sollCents - 100) m.status = "BEZAHLT";
    else if (m.bezahltCents > 0) m.status = "TEILWEISE";
    else m.status = m.faellig < heute ? "UEBERFAELLIG" : "OFFEN";
  }
  return liste;
}

/** Ganze Tage von heute bis zum Tag (negativ = ueberfaellig). */
export function tageBisFaellig(heute: Date, faellig: Date): number {
  const start = Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate());
  return Math.round((faellig.getTime() - start) / TAG);
}

/**
 * Gehoert eine Abbuchung zu diesem Vertrag? Suchbegriffe (durch Komma
 * getrennt) muessen im Empfaenger oder Verwendungszweck stehen. Mehrere
 * Vertraege beim selben Vermieter trennt erst `vertragFuerZahlung`.
 */
export function passtZumVertrag(
  suchbegriffe: string | null,
  tx: { counterpartyName: string | null; purpose: string | null },
): boolean {
  const text = `${tx.counterpartyName ?? ""} ${tx.purpose ?? ""}`.toLowerCase();
  const begriffe = (suchbegriffe ?? "")
    .split(",")
    .map((b) => b.trim().toLowerCase())
    .filter((b) => b.length >= 3);
  if (begriffe.length === 0) return false;
  // Alle Begriffe einer Gruppe "a+b" muessen vorkommen; irgendeine Gruppe reicht.
  return begriffe.some((gruppe) => gruppe.split("+").every((teil) => text.includes(teil.trim())));
}

/**
 * Verteilt eine Abbuchung auf die Vertraege, zu denen sie passt (z. B. zwei
 * Wohnungen beim selben Vermieter): steht die Kennung eines Vertrags im
 * Zweck ("1. OG"), bekommt er alles. Entspricht der Betrag der Summe aller
 * Vertraege, wird aufgeteilt. Sonst gewinnt der naechstliegende Betrag.
 */
export function zahlungVerteilen<V extends { id: string; betragCents: number; kennung: string | null }>(
  vertraege: V[],
  tx: { amountCents: number; purpose: string | null },
): Array<{ vertrag: V; betragCents: number }> {
  const betrag = Math.abs(tx.amountCents);
  if (vertraege.length === 0) return [];
  if (vertraege.length === 1) return [{ vertrag: vertraege[0], betragCents: betrag }];

  const zweck = tx.purpose ?? "";
  const mitKennung = vertraege.filter((v) => {
    if (!v.kennung?.trim()) return false;
    const muster = v.kennung.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
    return new RegExp(`(^|[^\\p{L}\\d])${muster}($|[^\\p{L}\\d])`, "iu").test(zweck);
  });
  if (mitKennung.length === 1) return [{ vertrag: mitKennung[0], betragCents: betrag }];

  const summe = vertraege.reduce((s, v) => s + v.betragCents, 0);
  if (Math.abs(summe - betrag) <= 100) {
    let rest = betrag;
    return vertraege.map((v, i) => {
      const teil = i === vertraege.length - 1 ? rest : v.betragCents;
      rest -= teil;
      return { vertrag: v, betragCents: teil };
    });
  }

  const naechster = [...vertraege].sort((a, b) => Math.abs(a.betragCents - betrag) - Math.abs(b.betragCents - betrag))[0];
  return [{ vertrag: naechster, betragCents: betrag }];
}
