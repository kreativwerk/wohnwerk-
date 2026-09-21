/**
 * Was kostet ein Monat, wenn er nicht ganz bewohnt wird?
 *
 * Tagespauschale: Monatsmiete geteilt durch 30, kaufmaennisch auf den
 * Cent gerundet - bei 470 Euro sind das die vertraglichen 15,67 pro Tag.
 * Erster und letzter Monat werden tageweise berechnet, wenn Ein- oder
 * Auszug nicht auf Monatsgrenzen fallen. Nie mehr als eine volle
 * Monatsmiete.
 *
 * Reine Funktion ohne Datenbank, damit sie sich testen laesst und an
 * zwei Stellen dieselbe Zahl liefert: beim Erzeugen der Forderung und
 * beim Anpassen nach einem Auszug.
 */

export type MietZeitraum = {
  startDate: Date;
  endDate: Date | null;
  monthlyRentCents: number;
};

export type Monatsanteil = {
  amountCents: number;
  billedDays: number;
  daily: number;
  /** Nicht der ganze Monat: erster oder letzter Monat des Mietverhaeltnisses. */
  partial: boolean;
  firstDay: number;
  lastDay: number;
};

export function tagespauschale(monthlyRentCents: number): number {
  return Math.round(monthlyRentCents / 30);
}

export function monatsanteil(zeitraum: MietZeitraum, year: number, month: number): Monatsanteil {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daily = tagespauschale(zeitraum.monthlyRentCents);

  let firstDay = 1;
  let lastDay = daysInMonth;
  const start = zeitraum.startDate;
  if (year === start.getUTCFullYear() && month === start.getUTCMonth() + 1) {
    firstDay = start.getUTCDate();
  }
  const end = zeitraum.endDate;
  if (end && year === end.getUTCFullYear() && month === end.getUTCMonth() + 1) {
    lastDay = end.getUTCDate();
  }

  const billedDays = Math.max(0, lastDay - firstDay + 1);
  const partial = firstDay !== 1 || lastDay !== daysInMonth;
  const amountCents = partial
    ? Math.min(zeitraum.monthlyRentCents, billedDays * daily)
    : zeitraum.monthlyRentCents;

  return { amountCents, billedDays, daily, partial, firstDay, lastDay };
}

/** "Anteilig: 24 Tag(e) × 15,67 €" - die Notiz an der Forderung. */
export function anteilNotiz(anteil: Monatsanteil): string | null {
  if (!anteil.partial) return null;
  return `Anteilig: ${anteil.billedDays} Tag(e) × ${(anteil.daily / 100).toFixed(2).replace(".", ",")} €`;
}
