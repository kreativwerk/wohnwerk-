const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATETIME = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const MONTH = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "–";
  return DATE.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "–";
  return DATETIME.format(typeof d === "string" ? new Date(d) : d);
}

export function formatMonth(year: number, month: number): string {
  return MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** yyyy-mm-dd fuer <input type="date"> */
export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Datum aus einem Formularfeld, als UTC-Mitternacht (zeitzonenstabil). */
export function fromDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parser fuer Datumsangaben aus Bank-Exporten.
 * Unterstuetzt dd.mm.yyyy, dd.mm.yy, yyyy-mm-dd, dd/mm/yyyy.
 */
export function parseBankDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
  }
  return null;
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

/** Liste aller (Jahr, Monat)-Paare zwischen zwei Daten, inklusive. */
export function monthsBetween(from: Date, to: Date): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth() + 1;
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth() + 1;

  // Schutz vor Endlosschleifen bei unsinnigen Zeitraeumen
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard++ < 600) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
