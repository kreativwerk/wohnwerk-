import { fromDateInput } from "./dates";
import { parseAmountToCents } from "./money";

/** Kleine Helfer, damit die Server Actions nicht in Typkonvertierungen ertrinken. */

export function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalStr(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value === "" ? null : value;
}

export function int(form: FormData, key: string, fallback = 0): number {
  const value = Number.parseInt(str(form, key), 10);
  return Number.isNaN(value) ? fallback : value;
}

export function float(form: FormData, key: string): number | null {
  const raw = str(form, key).replace(",", ".");
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? null : value;
}

export function cents(form: FormData, key: string, fallback = 0): number {
  const value = parseAmountToCents(str(form, key));
  return value === null ? fallback : value;
}

export function optionalCents(form: FormData, key: string): number | null {
  return parseAmountToCents(str(form, key));
}

export function date(form: FormData, key: string): Date | null {
  return fromDateInput(str(form, key));
}

export function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

export class ActionError extends Error {}

/** Wirft mit einer Meldung, die direkt in der Oberflaeche angezeigt werden kann. */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ActionError(message);
}

/**
 * Baut einen Ziel-Pfad mit Statusmeldung. Die Seiten lesen `ok`/`fehler` aus
 * den Suchparametern und zeigen sie als Banner an - so funktionieren die
 * Formulare auch ohne JavaScript.
 */
export function flash(path: string, kind: "ok" | "fehler", message: string): string {
  const [pathname, existingQuery] = path.split("?");
  const params = new URLSearchParams(existingQuery ?? "");
  params.delete("ok");
  params.delete("fehler");
  params.set(kind, message);
  return `${pathname}?${params.toString()}`;
}
