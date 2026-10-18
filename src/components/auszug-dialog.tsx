"use client";

import { useEffect, useRef, useState } from "react";
import { Warning, X } from "@phosphor-icons/react/dist/ssr";

import { useOberflaeche } from "./sprache-kontext";

export type AuszugNotiz = {
  id: string;
  text: string;
  /** Grund des Kautionsabzugs, deutsch - wird hier uebersetzt. Null = reine Notiz. */
  grund: string | null;
  /** Betrag, fertig formatiert. */
  betrag: string | null;
  datum: string;
};

/**
 * Knopf "Beenden" im Auszugsformular. Gibt es offene Notizen zum Bewohner,
 * erscheinen sie vor dem Auszug in einem Fenster - mit den Betraegen, die
 * von der Kaution abgezogen werden. Erst "Auszug eintragen" schickt das
 * Formular ab. Ohne Notizen bleibt es bei der einfachen Rueckfrage.
 */
export function AuszugKnopf({
  name,
  notizen,
  kaution,
  abzug,
  rest,
}: {
  name: string;
  notizen: AuszugNotiz[];
  /** Gezahlte Kaution, formatiert. */
  kaution: string;
  /** Summe aller Abzuege inkl. offener Mieten, formatiert - null ohne Abzuege. */
  abzug: string | null;
  /** Rueckzahlung oder Nachzahlung, fertig formuliert. */
  rest: { text: string; nachzahlung: boolean } | null;
}) {
  const { t } = useOberflaeche();
  const knopf = useRef<HTMLButtonElement>(null);
  const [offen, setOffen] = useState(false);
  const freigegeben = useRef(false);

  useEffect(() => {
    if (!offen) return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOffen(false);
    };
    document.addEventListener("keydown", beiTaste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [offen]);

  function bestaetigen() {
    freigegeben.current = true;
    setOffen(false);
    knopf.current?.form?.requestSubmit(knopf.current);
  }

  return (
    <>
      <button
        ref={knopf}
        type="submit"
        className="btn btn-secondary"
        onClick={(event) => {
          if (freigegeben.current) return;
          event.preventDefault();
          if (notizen.length === 0) {
            if (window.confirm(t("Mietverhältnis wirklich beenden? Das Bett wird danach wieder als frei geführt."))) bestaetigen();
            return;
          }
          setOffen(true);
        }}
      >
        {t("Beenden")}
      </button>

      {offen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("Notizen vor dem Auszug")}>
          <button
            type="button"
            aria-label={t("Schließen")}
            onClick={() => setOffen(false)}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px] motion-safe:animate-[einblenden_150ms_ease-out]"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white p-4 text-left shadow-[0_-8px_40px_rgb(20_39_38/0.2)] motion-safe:animate-[hochschieben_200ms_cubic-bezier(0.16,1,0.3,1)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[34rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink-300 sm:hidden" aria-hidden="true" />

            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <Warning size={22} weight="fill" className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[0.98rem] font-semibold text-ink-900">{t("Notizen zu {name}", { name })}</p>
                  <p className="mt-0.5 text-[0.8rem] leading-relaxed text-ink-500">
                    {t("Vor dem Auszug prüfen: Diese Punkte werden von der Kaution abgezogen.")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOffen(false)}
                aria-label={t("Schließen")}
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
              >
                <X size={18} />
              </button>
            </div>

            <ul className="divide-y divide-ink-200/70 rounded-xl border border-ink-200/70">
              {notizen.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    {n.grund && (
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-amber-700">
                        {t("Kautionsabzug")} · {t(n.grund)}
                      </p>
                    )}
                    {n.text && <p className="whitespace-pre-line text-sm text-ink-900">{n.text}</p>}
                    <p className="text-xs text-ink-500">{n.datum}</p>
                  </div>
                  {n.betrag && <p className="shrink-0 text-sm font-semibold tabular-nums text-rose-700">−{n.betrag}</p>}
                </li>
              ))}
            </ul>

            {abzug && (
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-ink-50 px-3 py-2.5 text-sm">
                <dt className="text-ink-600">{t("Gezahlte Kaution")}</dt>
                <dd className="text-right tabular-nums text-ink-900">{kaution}</dd>
                <dt className="text-ink-600">{t("Abzüge inkl. offener Mieten")}</dt>
                <dd className="text-right tabular-nums text-rose-700">−{abzug}</dd>
                {rest && (
                  <>
                    <dt className="font-semibold text-ink-900">{rest.nachzahlung ? t("Nachzahlung") : t("Rückzahlung")}</dt>
                    <dd className={`text-right font-semibold tabular-nums ${rest.nachzahlung ? "text-rose-700" : "text-emerald-700"}`}>{rest.text}</dd>
                  </>
                )}
              </dl>
            )}

            <p className="mt-3 text-xs text-ink-500">
              {t("Nach dem Auszug steht unter „Notizen“ die fertige Nachricht zur Kautionsabrechnung für WhatsApp bereit.")}
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOffen(false)}>
                {t("Abbrechen")}
              </button>
              <button type="button" className="btn btn-primary" onClick={bestaetigen}>
                {t("Auszug eintragen")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
