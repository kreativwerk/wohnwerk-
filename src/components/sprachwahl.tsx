import { setzeSprache } from "@/app/actions/sprache";
import { SPRACHEN, SPRACH_NAME, aktuelleSprache, uebersetzer } from "@/lib/i18n";

/**
 * Sprachumschalter als Formular - damit er auch ohne JavaScript
 * funktioniert. Zwei Sprachen, deshalb zwei Knoepfe statt eines
 * Auswahlfelds: ein Fingertipp statt drei.
 */
export async function Sprachwahl({ hell = false }: { hell?: boolean }) {
  const [sprache, t] = await Promise.all([aktuelleSprache(), uebersetzer()]);

  return (
    <form action={setzeSprache} aria-label={t("Sprache wählen")} className="flex items-center gap-1">
      {SPRACHEN.map((wert) => {
        const aktiv = wert === sprache;
        return (
          <button
            key={wert}
            type="submit"
            name="sprache"
            value={wert}
            aria-current={aktiv ? "true" : undefined}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              aktiv
                ? hell
                  ? "bg-white/15 text-white"
                  : "bg-ink-900 text-white"
                : hell
                  ? "text-brand-300 hover:bg-white/10 hover:text-white"
                  : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            }`}
            title={SPRACH_NAME[wert]}
          >
            {wert}
          </button>
        );
      })}
    </form>
  );
}
