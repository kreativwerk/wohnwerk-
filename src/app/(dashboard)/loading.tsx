/**
 * Sofortige Rueckmeldung beim Seitenwechsel: Die Zielseite laedt ihre Daten
 * auf dem Server, und ohne dieses Geruest bliebe der Klick bis dahin ohne
 * sichtbare Wirkung. Graue Platzhalter an den Stellen von Kopf, Kennzahlen
 * und Tabelle zeigen an: es passiert etwas.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-8 w-64 rounded-lg bg-ink-200" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-ink-200/70" />

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-24 px-5 py-4">
            <div className="h-3 w-24 rounded bg-ink-200/80" />
            <div className="mt-3 h-7 w-32 rounded-lg bg-ink-200" />
          </div>
        ))}
      </div>

      <div className="card mt-6 p-5">
        <div className="h-4 w-40 rounded bg-ink-200" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 rounded bg-ink-200/60" style={{ width: `${92 - i * 7}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
