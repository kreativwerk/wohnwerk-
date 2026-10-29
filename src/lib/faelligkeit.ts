/**
 * Wann ist die naechste Miete faellig? Aus den Mietverhaeltnissen
 * (Faelligkeitstag laut Vertrag, Ein- und Auszug) - ohne Datenbank, damit
 * es sich testen laesst.
 */

import { monatsanteil } from "./mietanteil";

export type FaelligkeitsMietverhaeltnis = {
  billingDay: number;
  monthlyRentCents: number;
  startDate: Date;
  endDate: Date | null;
};

export type Faelligkeit = {
  /** Kalendertag (UTC-Mitternacht) */
  datum: Date;
  anzahl: number;
  summeCents: number;
};

const TAG = 24 * 60 * 60 * 1000;

function tagUtc(jahr: number, monat: number, tag: number): Date {
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

function faelligImMonat(m: FaelligkeitsMietverhaeltnis, jahr: number, monat: number): Date {
  const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return tagUtc(jahr, monat, Math.min(Math.max(m.billingDay, 1), tageImMonat));
}

/**
 * Die naechsten `wieviele` Faelligkeitstage ab heute, je Tag mit Zahl der
 * Mieten und Summe. Wer im Monat einzieht, zahlt anteilig und zum Einzug;
 * wer vorher auszieht, faellt weg.
 */
export function naechsteFaelligkeiten(
  mietverhaeltnisse: FaelligkeitsMietverhaeltnis[],
  heute: Date,
  wieviele = 3,
): Faelligkeit[] {
  const start = tagUtc(heute.getUTCFullYear(), heute.getUTCMonth() + 1, heute.getUTCDate());
  const tage = new Map<number, Faelligkeit>();

  for (const m of mietverhaeltnisse) {
    if (m.monthlyRentCents <= 0) continue;
    for (let i = 0; i < 4; i += 1) {
      const jahr = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + i) / 12);
      const monat = ((start.getUTCMonth() + i) % 12) + 1;
      const monatsanfang = tagUtc(jahr, monat, 1);
      const monatsende = tagUtc(jahr, monat + 1, 0);
      if (m.endDate && m.endDate < monatsanfang) break;
      if (m.startDate > monatsende) continue;

      let faellig = faelligImMonat(m, jahr, monat);
      // Einzug mitten im Monat: die erste (anteilige) Miete ist zum Einzug faellig.
      const einzug = tagUtc(m.startDate.getUTCFullYear(), m.startDate.getUTCMonth() + 1, m.startDate.getUTCDate());
      if (einzug >= monatsanfang && einzug <= monatsende && einzug > faellig) faellig = einzug;
      if (faellig < start) continue;

      const betrag = monatsanteil(m, jahr, monat).amountCents;
      if (betrag <= 0) continue;
      const eintrag = tage.get(faellig.getTime()) ?? { datum: faellig, anzahl: 0, summeCents: 0 };
      eintrag.anzahl += 1;
      eintrag.summeCents += betrag;
      tage.set(faellig.getTime(), eintrag);
    }
  }

  return [...tage.values()].sort((a, b) => a.datum.getTime() - b.datum.getTime()).slice(0, wieviele);
}

/** Ganze Tage von heute bis zum Tag (0 = heute). */
export function tageBis(heute: Date, datum: Date): number {
  const start = Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate());
  return Math.round((datum.getTime() - start) / TAG);
}

/** Mitternacht in Berlin fuer einen Kalendertag - Ziel des Countdowns. */
export function berlinMitternacht(datum: Date): Date {
  const utc = Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate());
  const berlin = new Date(new Date(utc).toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime();
  const utcLokal = new Date(new Date(utc).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utc - (berlin - utcLokal));
}

/** Heute in Berlin als UTC-Mitternacht - damit "heute" nicht um 23 Uhr UTC springt. */
export function heuteInBerlin(jetzt = new Date()): Date {
  const [jahr, monat, tag] = jetzt.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }).split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag));
}
