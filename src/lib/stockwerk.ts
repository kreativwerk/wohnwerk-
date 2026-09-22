/**
 * Stockwerke in Hausreihenfolge: Keller unten, Dach oben.
 *
 * Die Etage steht als freier Text am Zimmer ("EG", "1. OG", "Dachgeschoss").
 * Alphabetisch waere "Dachgeschoss" vor "Erdgeschoss" - das will niemand
 * lesen. Deshalb erkennt diese Funktion die gaengigen Schreibweisen und
 * gibt einen Rang; Unbekanntes landet dahinter, alphabetisch.
 */

export const OHNE_STOCKWERK = "";

export function stockwerkRang(etage: string | null | undefined): number {
  const e = (etage ?? "").trim().toLowerCase();
  if (!e) return 1000; // ohne Angabe ganz unten
  if (/^(ug|kg|keller|untergeschoss|souterrain|basement)\b/.test(e)) return -1;
  if (/^(eg|erdgeschoss|parterre|ground)\b/.test(e) || e === "0") return 0;
  if (/^(dg|dachgeschoss|dach|attic|penthouse)\b/.test(e)) return 100;
  // "1. OG", "1.OG", "OG 1", "1. Stock", "1. Etage", "2", "3. OG links"
  const zahl = /(\d+)/.exec(e);
  if (zahl && /(og|obergeschoss|stock|etage|floor|^\d+$)/.test(e)) return Number(zahl[1]);
  if (/^(og|obergeschoss)\b/.test(e)) return 1;
  return 500;
}

/** Sortiert Etagennamen: erst nach Rang, bei Gleichstand alphabetisch. */
export function sortiereStockwerke(namen: string[]): string[] {
  return [...namen].sort((a, b) => {
    const ra = stockwerkRang(a);
    const rb = stockwerkRang(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, "de", { numeric: true });
  });
}
