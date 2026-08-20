/**
 * Das Logo liegt als SVG unter /public und wird hier an genau einer Stelle
 * eingebunden. Wird eine Datei ausgetauscht, aendert sich die Oberflaeche mit -
 * ohne dass an dieser Datei etwas zu tun waere.
 *
 *   /logo-navbar.svg          Schriftzug samt Marke, Mint auf dunklem Grund
 *   /logo-wordmark-white.svg  Schriftzug in Weiss
 *   /logo-mark.svg            nur die W-Marke in Orange
 */

/** Vollstaendiger Schriftzug fuer die dunkle Seitenleiste. */
export function LogoNavbar({ className = "" }: { className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- SVG mit fester
       Zeichenflaeche; die Bildoptimierung von Next hat hier nichts zu tun. */
    <img
      src="/logo-navbar.svg"
      alt="Wohnwerk"
      width={345}
      height={66}
      className={className}
    />
  );
}

/** Nur die Marke - fuer enge Stellen und die mobile Kopfzeile. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/logo-mark.svg"
      alt=""
      aria-hidden="true"
      width={1883}
      height={1404}
      className={className}
    />
  );
}

/** Schriftzug in Weiss - fuer den Vertragskopf und dunkle Flaechen. */
export function LogoWordmarkWhite({ className = "" }: { className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/logo-wordmark-white.svg"
      alt="Wohnwerk"
      width={1541}
      height={253}
      className={className}
    />
  );
}
