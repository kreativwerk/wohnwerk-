/**
 * Qonto-Umsatz -> Buchung der App. Reine Funktionen ohne Datenbank und
 * ohne Netz, damit sie sich testen lassen.
 *
 * Feldnamen nach der Qonto Business API v2 (GET /v2/transactions). Alles,
 * was fehlen kann, ist optional - lieber eine Buchung mit weniger Angaben
 * als ein abgebrochener Abgleich.
 */
import type { ParsedTransaction } from "./bank";

export type QontoTransaktion = {
  id: string;
  transaction_id?: string | null;
  amount_cents?: number | null;
  amount?: number | string | null;
  side: "credit" | "debit" | string;
  status?: string | null;
  currency?: string | null;
  label?: string | null;
  clean_counterparty_name?: string | null;
  reference?: string | null;
  note?: string | null;
  operation_type?: string | null;
  settled_at?: string | null;
  emitted_at?: string | null;
  income?: { counterparty_account_number?: string | null } | null;
  transfer?: { counterparty_account_number?: string | null } | null;
  category?: string | null;
  attachment_ids?: string[] | null;
  /** Mit includes[]=attachments eingebettet - die url ist nur kurz gueltig. */
  attachments?: QontoAnhang[] | null;
};

export type QontoAnhang = {
  id: string;
  file_name?: string | null;
  file_size?: number | string | null;
  file_content_type?: string | null;
  url?: string | null;
};

/**
 * Dateiname fuer die Belegablage: "2026-10-04 ESTW Erlanger Stadtwerke.pdf".
 * Zeichen, die Drive oder Dateisysteme stoeren, fliegen raus.
 */
export function belegDateiname(tag: Date, wer: string | null, original: string | null | undefined): string {
  const name = (original ?? "").trim() || "Beleg.pdf";
  const punkt = name.lastIndexOf(".");
  const endung = punkt > 0 ? name.slice(punkt).toLowerCase() : ".pdf";
  const titel = (wer ?? "").trim() || name.slice(0, punkt > 0 ? punkt : undefined);
  const sauberTitel = titel.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Beleg";
  return `${tag.toISOString().slice(0, 10)} ${sauberTitel}${endung}`;
}

/** Kennung, unter der ein Qonto-Umsatz in der App gefuehrt wird - stabil ueber alle Abgleiche. */
export function qontoKennung(id: string): string {
  return `qonto:${id}`;
}

export function istQontoKennung(wert: string | null | undefined): boolean {
  return Boolean(wert?.startsWith("qonto:"));
}

/**
 * Kalendertag in Berlin, als UTC-Mitternacht - so liegen auch die Daten aus
 * den Kontoauszuegen. Eine Gutschrift um 23:30 Uhr deutscher Zeit gehoert
 * zu diesem Tag, nicht zum UTC-Folgetag.
 */
export function berlinTag(iso: string): Date {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const wert = (typ: string) => Number(teile.find((t) => t.type === typ)?.value);
  return new Date(Date.UTC(wert("year"), wert("month") - 1, wert("day")));
}

function betragCents(tx: QontoTransaktion): number {
  if (typeof tx.amount_cents === "number" && Number.isFinite(tx.amount_cents)) return Math.round(tx.amount_cents);
  const roh = typeof tx.amount === "string" ? Number.parseFloat(tx.amount) : tx.amount ?? 0;
  return Math.round(Math.abs(Number(roh) || 0) * 100);
}

function sauber(wert: string | null | undefined): string | null {
  const text = (wert ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

/** Null, wenn der Umsatz nicht gebucht werden soll (nicht abgeschlossen, 0 €). */
export function qontoZuBuchung(tx: QontoTransaktion): ParsedTransaction | null {
  if (tx.status && tx.status !== "completed") return null;
  const zeitpunkt = tx.settled_at ?? tx.emitted_at;
  if (!zeitpunkt) return null;
  const cents = Math.abs(betragCents(tx));
  if (cents === 0) return null;

  const ausgang = tx.side === "debit";
  const iban = sauber(tx.income?.counterparty_account_number ?? tx.transfer?.counterparty_account_number)?.replace(/\s+/g, "") ?? null;

  return {
    bookingDate: berlinTag(zeitpunkt),
    valueDate: tx.emitted_at ? berlinTag(tx.emitted_at) : null,
    amountCents: ausgang ? -cents : cents,
    currency: tx.currency || "EUR",
    counterpartyName: sauber(tx.clean_counterparty_name) ?? sauber(tx.label),
    counterpartyIban: iban,
    // Der Verwendungszweck des Mieters - darin steht meist Name und Monat.
    purpose: sauber(tx.reference) ?? sauber(tx.note),
    endToEndId: qontoKennung(tx.id),
    bankTxCode: sauber(tx.operation_type),
  };
}

function namensSchluessel(wert: string | null | undefined): string {
  return (wert ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Ist das dieselbe Zahlung, einmal aus dem Kontoauszug und einmal von
 * Qonto? Gleicher Betrag, hoechstens zwei Tage auseinander (Buchungs- und
 * Wertstellungstag weichen ab) und der Name passt - der eine steckt im
 * anderen, weil Auszuege ihn mal kuerzen, mal mit Zusatz fuehren.
 */
export function gleicheZahlung(
  a: { bookingDate: Date; amountCents: number; counterpartyName: string | null },
  b: { bookingDate: Date; amountCents: number; counterpartyName: string | null },
): boolean {
  if (a.amountCents !== b.amountCents) return false;
  const tage = Math.abs(a.bookingDate.getTime() - b.bookingDate.getTime()) / 86_400_000;
  if (tage > 2) return false;
  const na = namensSchluessel(a.counterpartyName);
  const nb = namensSchluessel(b.counterpartyName);
  if (!na || !nb) return na === nb;
  return na.includes(nb) || nb.includes(na);
}
