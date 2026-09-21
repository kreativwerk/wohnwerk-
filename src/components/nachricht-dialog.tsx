"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatCircleText, Copy, X } from "@phosphor-icons/react/dist/ssr";

import { vermerkeNachricht } from "@/app/actions/erinnerungen";

import { useOberflaeche } from "./sprache-kontext";

export type NachrichtVariante = {
  code: string;
  /** Deutscher Sprachname als Schluessel - wird hier uebersetzt. */
  sprache: string;
  text: string;
  whatsapp: string | null;
};

/**
 * Ein Knopf "Nachricht" je Mieter. Dahinter ein Fenster mit der
 * Gesamtforderung - alle offenen Monate plus Kaution - in jeder Sprache
 * eine Zeile: Kopieren oder direkt nach WhatsApp. Die Texte kommen
 * fertig vom Server; hier wird nur gewaehlt und kopiert.
 *
 * Eine Nachricht statt einer je Monat: Wer zwei Monate hinterher ist,
 * bekommt einen Text mit der Summe, nicht zwei Erinnerungen.
 */
export function NachrichtDialog({
  tenantId,
  name,
  gesamt,
  gesamtCents,
  varianten,
  telefonFehlt,
  zuletzt,
}: {
  tenantId: string;
  name: string;
  gesamt: string;
  gesamtCents: number;
  varianten: NachrichtVariante[];
  /** Link zur Person, falls keine Telefonnummer hinterlegt ist. */
  telefonFehlt?: string | null;
  /** Letzter Versand, fertig formatiert - oder null, wenn noch nie. */
  zuletzt?: string | null;
}) {
  const { t, datumZeit } = useOberflaeche();
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [gesendet, setGesendet] = useState<string | null>(zuletzt ?? null);
  const [gewaehlt, setGewaehlt] = useState(varianten[0]?.code ?? "");
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [manuell, setManuell] = useState(false);

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

  useEffect(() => {
    if (!kopiert) return;
    const timer = setTimeout(() => setKopiert(null), 2200);
    return () => clearTimeout(timer);
  }, [kopiert]);

  const aktuell = varianten.find((v) => v.code === gewaehlt) ?? varianten[0];

  /** Versand festhalten - die Zeile zeigt danach "Nachricht gesendet am ...". */
  async function vermerken(v: NachrichtVariante, kanal: "WHATSAPP" | "COPY") {
    try {
      const { sentAt } = await vermerkeNachricht({ tenantId, kanal, sprache: v.code, betragCents: gesamtCents });
      setGesendet(`${datumZeit(new Date(sentAt))} (${t(v.sprache)}, ${kanal === "WHATSAPP" ? "WhatsApp" : t("kopiert")})`);
      router.refresh();
    } catch {
      // Der Vermerk ist Komfort - scheitert er, bleibt die Nachricht trotzdem kopiert.
    }
  }

  async function kopieren(v: NachrichtVariante) {
    setGewaehlt(v.code);
    try {
      await navigator.clipboard.writeText(v.text);
      setKopiert(v.code);
      setManuell(false);
      void vermerken(v, "COPY");
    } catch {
      // Zwischenablage verweigert (http, alte WebViews): Text zum
      // Markieren anzeigen, statt stumm zu bleiben.
      setManuell(true);
    }
  }

  return (
    <>
      <div className="inline-flex flex-col items-end gap-0.5">
        <button
          type="button"
          className="btn btn-secondary btn-sm whitespace-nowrap"
          onClick={() => setOffen(true)}
          title={t("Zahlungserinnerung mit allen offenen Posten – zum Kopieren oder für WhatsApp")}
        >
          <ChatCircleText size={15} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
          {t("Nachricht")}
        </button>
        {gesendet && (
          <span className="text-right text-[0.7rem] leading-tight text-emerald-700">
            {t("Nachricht gesendet am {zeitpunkt}", { zeitpunkt: gesendet })}
          </span>
        )}
      </div>

      {offen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("Nachricht an {name}", { name })}>
          <button
            type="button"
            aria-label={t("Schließen")}
            onClick={() => setOffen(false)}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px] motion-safe:animate-[einblenden_150ms_ease-out]"
          />

          {/* Am Handy von unten, am Schreibtisch mittig. */}
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white p-4 text-left shadow-[0_-8px_40px_rgb(20_39_38/0.2)] motion-safe:animate-[hochschieben_200ms_cubic-bezier(0.16,1,0.3,1)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[36rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink-300 sm:hidden" aria-hidden="true" />

            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[0.98rem] font-semibold text-ink-900">{t("Nachricht an {name}", { name })}</p>
                <p className="mt-0.5 text-[0.8rem] leading-relaxed text-ink-500">
                  {t("Gesamt offen: {betrag}", { betrag: gesamt })} · {t("alle offenen Monate und die Kaution in einer Nachricht")}
                </p>
                {gesendet && (
                  <p className="mt-1 text-[0.8rem] font-medium text-emerald-700">
                    {t("Nachricht gesendet am {zeitpunkt}", { zeitpunkt: gesendet })}
                  </p>
                )}
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

            {/* Je Sprache eine Zeile: Name, Kopieren, WhatsApp. */}
            <ul className="divide-y divide-ink-200/70 rounded-xl border border-ink-200/70">
              {varianten.map((v) => {
                const aktiv = v.code === aktuell?.code;
                return (
                  <li key={v.code} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${aktiv ? "bg-brand-50/60" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setGewaehlt(v.code)}
                      className={`min-w-0 flex-1 text-left text-sm ${aktiv ? "font-semibold text-brand-800" : "font-medium text-ink-800"}`}
                      aria-pressed={aktiv}
                      title={t("Text anzeigen")}
                    >
                      {t(v.sprache)}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => kopieren(v)}>
                      <Copy size={15} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
                      {kopiert === v.code ? t("Kopiert") : t("Kopieren")}
                    </button>
                    {v.whatsapp && (
                      <a
                        href={v.whatsapp}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void vermerken(v, "WHATSAPP")}
                      >
                        WhatsApp
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>

            {!varianten.some((v) => v.whatsapp) && telefonFehlt && (
              <p className="mt-2 text-xs text-ink-500">
                {t("Kein WhatsApp-Link: Es ist keine Telefonnummer hinterlegt.")}{" "}
                <a href={telefonFehlt} className="font-semibold text-brand-700 hover:underline">
                  {t("Nummer eintragen")}
                </a>
              </p>
            )}

            {aktuell && (
              <textarea
                readOnly
                value={aktuell.text}
                rows={manuell ? 14 : 9}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-3 w-full text-xs leading-relaxed"
                aria-label={t("Text der Nachricht")}
              />
            )}
            {manuell && (
              <p className="mt-1 text-xs text-amber-700">
                {t("Der Browser hat die Zwischenablage verweigert – Text oben markieren und von Hand kopieren.")}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
