const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 35000 -> "350,00 €" */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "–";
  return EUR.format(cents / 100);
}

/** 35000 -> "350,00" (ohne Waehrungszeichen, fuer Eingabefelder) */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Robuster Parser fuer Betraege aus Formularen und Bank-Exporten.
 * Erkennt "1.234,56", "1,234.56", "1234.56", "-350,00", "350,00-", "(350,00)".
 */
export function parseAmountToCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Math.round(raw * 100);

  let s = raw.trim();
  if (!s) return null;

  let negative = false;

  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);

  s = s.replace(/[€$\s ']/g, "").trim();
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Das hintere Zeichen ist das Dezimaltrennzeichen.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    // "1,234" ist ein Tausendertrennzeichen, "12,34" ein Dezimaltrenner.
    s = decimals === 3 && s.replace(/,/g, "").length > 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && s.replace(/\./g, "").length > 3) s = s.replace(/\./g, "");
  }

  if (!/^\d*\.?\d*$/.test(s)) return null;
  const value = Number.parseFloat(s);
  if (Number.isNaN(value)) return null;

  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Wie parseAmountToCents, liefert aber statt null einen Fallback. */
export function parseAmountOr(raw: unknown, fallback = 0): number {
  const parsed = parseAmountToCents(raw as string);
  return parsed === null ? fallback : parsed;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}
