/**
 * Lesbarkeit von Farbpaaren nach WCAG 2.1.
 *
 * Die Oberflaeche wird taeglich und oft in schlecht beleuchteten Fluren am
 * Handy benutzt. Zu blasse Schrift ist dort kein Schoenheitsfehler, sondern
 * kostet Zeit. Die Werte werden deshalb geprueft statt geschaetzt.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative Helligkeit einer Farbe, 0 (schwarz) bis 1 (weiss). */
export function luminance(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Keine Farbe im Format #rrggbb: "${hex}"`);
  }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Kontrastverhaeltnis zweier Farben, 1 (gleich) bis 21 (schwarz auf weiss). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const heller = Math.max(la, lb);
  const dunkler = Math.min(la, lb);
  return (heller + 0.05) / (dunkler + 0.05);
}

/** Liest die Farbtokens aus globals.css, damit die Pruefung nie veraltet. */
export function readTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--color-([a-z]+-\d+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}
