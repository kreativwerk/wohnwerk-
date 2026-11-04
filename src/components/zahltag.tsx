import Link from "next/link";

import { Card } from "./ui";
import { Countdown } from "./countdown";
import { berlinMitternacht } from "@/lib/faelligkeit";
import { oberflaeche } from "@/lib/i18n";
import { restSumme, type ObjektmieteStand } from "@/lib/objektmiete-stand";
import { tageBisFaellig } from "@/lib/objektmiete";

/**
 * Countdown bis zur naechsten Miete, die WIR an einen Vermieter zahlen
 * muessen - laut Mietvertrag, abzueglich dessen, was schon ueberwiesen ist.
 * Ueberfaellige Monate stehen darunter in Rot.
 */
export async function ZahltagKarte({
  stand,
  heute,
  mitLink = false,
  zusatz,
}: {
  stand: ObjektmieteStand;
  heute: Date;
  mitLink?: boolean;
  /** z. B. die naechste Mietfaelligkeit unserer Mieter */
  zusatz?: React.ReactNode;
}) {
  const { t, datum, geld } = await oberflaeche();
  const wochentag = (d: Date) => d.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" });
  const { naechsterTag, naechste, ueberfaellig } = stand;
  if (!naechsterTag && ueberfaellig.length === 0) return null;

  return (
    <Card className="mb-4" padded={false}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t("Nächste Mietzahlung an Vermieter")}</p>
          {naechsterTag ? (
            <>
              <div className="mt-1">
                <Countdown
                  ziel={berlinMitternacht(naechsterTag).toISOString()}
                  einheiten={{ tage: t("Tage"), tag: t("Tag"), std: t("Std"), min: t("Min") }}
                  faelligText={t("Heute fällig")}
                />
              </div>
              <p className="mt-1 text-sm text-ink-700">
                {wochentag(naechsterTag)}, {datum(naechsterTag)} ·{" "}
                <span className="font-semibold tabular-nums">{geld(restSumme(naechste))}</span>
                {tageBisFaellig(heute, naechsterTag) === 0 && <> · <span className="font-semibold text-amber-700">{t("spätestens heute überweisen")}</span></>}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-ink-600">
                {naechste.map(({ zeile, monat }) => (
                  <li key={`${zeile.vertrag.id}-${monat.jahr}-${monat.monat}`}>
                    {zeile.vertrag.vermieter} · {zeile.vertrag.property.name}
                    {zeile.vertrag.bezeichnung ? ` ${zeile.vertrag.bezeichnung}` : ""} ·{" "}
                    <span className="tabular-nums">{geld(monat.sollCents - monat.bezahltCents)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-700">{t("Keine weitere Zahlung geplant.")}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:items-end sm:text-right">
          {ueberfaellig.length > 0 && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200/70">
              <p className="font-semibold">
                {t("{anzahl} Monat(e) überfällig · {summe}", { anzahl: ueberfaellig.length, summe: geld(restSumme(ueberfaellig)) })}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {ueberfaellig.slice(0, 5).map(({ zeile, monat }) => (
                  <li key={`${zeile.vertrag.id}-${monat.jahr}-${monat.monat}`}>
                    {String(monat.monat).padStart(2, "0")}/{monat.jahr} · {zeile.vertrag.property.name}
                    {zeile.vertrag.bezeichnung ? ` ${zeile.vertrag.bezeichnung}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {zusatz}
          {mitLink && (
            <Link href="/buchhaltung/mieten-zahlen" className="btn btn-secondary btn-sm">
              {t("Mieten zahlen")}
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
