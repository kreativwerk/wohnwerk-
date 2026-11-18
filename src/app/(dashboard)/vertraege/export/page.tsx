import Link from "next/link";

import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th, type Tone } from "@/components/ui";
import { VertragHochladen } from "@/components/vertrag-hochladen";
import { VertraegeZip } from "@/components/vertraege-zip";
import { requireAdmin } from "@/lib/auth";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { VERTRAGS_STATUS_NAME, vertragsExportStand, type VertragsZeile } from "@/lib/vertrags-export";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Mietverträge exportieren") };
}
export const dynamic = "force-dynamic";

const STATUS_TON: Record<string, Tone> = { KEIN: "danger", DRAFT: "neutral", SENT: "warning", VIEWED: "info", CANCELLED: "danger" };

/**
 * Export der Mietvertraege: zuerst der Abgleich, wer bei den laufenden
 * Mietverhaeltnissen noch nicht unterschrieben hat - dann alle abgelegten
 * Vertraege als ZIP und die Fehlliste als PDF.
 */
export default async function VertraegeExportPage({
  searchParams,
}: {
  searchParams: Promise<{ objekt?: string; status?: string; q?: string; ok?: string; fehler?: string }>;
}) {
  const { t, datum } = await oberflaeche();
  await requireAdmin();
  const params = await searchParams;
  const heute = new Date();
  const stand = await vertragsExportStand(heute);
  const megabyte = stand.dateien.reduce((s, d) => s + d.groesse, 0) / 1024 / 1024;

  // Filter der Fehlliste: Objekt, Status, Name.
  const filter = { objekt: params.objekt ?? "", status: params.status ?? "", q: (params.q ?? "").trim() };
  const suche = filter.q.toLowerCase();
  const gefiltert = stand.fehlend.filter(
    (f) =>
      (!filter.objekt || f.objekt === filter.objekt) &&
      (!filter.status || f.status === filter.status) &&
      (!suche || f.mieter.toLowerCase().includes(suche)),
  );
  const alleObjekte = [...new Set(stand.fehlend.map((f) => f.objekt))];
  const objekte = [...new Set(gefiltert.map((f) => f.objekt))];
  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  const zurueck = `/vertraege/export${query ? `?${query}` : ""}`;

  return (
    <>
      <PageHeader
        title={t("Mietverträge exportieren")}
        description={t("Erst prüfen, wer noch fehlt – dann alles herunterladen.")}
        actions={
          <Link href="/vertraege" className="btn btn-secondary">
            {t("Zurück zu den Mietverträgen")}
          </Link>
        }
      />
      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="mb-4 grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={t("Fehlen noch")} value={String(stand.fehlend.length)} hint={t("laufend, nicht unterschrieben")} tone={stand.fehlend.length > 0 ? "danger" : "success"} href="#fehlt" />
        <StatCard label={t("Aktiv mit Vertrag")} value={String(stand.aktiv.length)} hint={t("laufend und unterschrieben")} tone="success" href="#aktiv" />
        <StatCard label={t("Nicht mehr aktiv")} value={String(stand.nichtAktiv.length)} hint={t("ausgezogen oder beendet")} href="#nicht-aktiv" />
      </div>

      <Card className="mb-4" title={t("Herunterladen")} description={t("{anzahl} Dateien, zusammen etwa {mb} MB – unterschriebene Verträge, Scans und Wohnungsgeberbestätigungen, nach Objekt sortiert. Die Fehlliste liegt in der ZIP-Datei mit bei.", { anzahl: stand.dateien.length, mb: Math.round(megabyte) })}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <VertraegeZip
            dateien={stand.dateien.map(({ url, zipPfad }) => ({ url, zipPfad }))}
            fehllisteUrl="/api/vertraege/fehlliste"
            dateiname={`Mietvertraege-${heute.toISOString().slice(0, 10)}.zip`}
          />
          <a href="/api/vertraege/fehlliste" target="_blank" rel="noreferrer" className="btn btn-secondary w-full sm:w-auto">
            {t("Fehlliste als PDF")}
          </a>
        </div>
      </Card>

      <Card id="fehlt" className="mb-4 scroll-mt-4" title={t("Wer noch fehlt")} description={t("Laufende Mietverhältnisse ohne unterschriebenen Vertrag. Liegt ein unterschriebener Papiervertrag vor: hochladen – dann gilt er als unterschrieben.")} padded={false}>
        {/* Filter */}
        <form method="get" action="/vertraege/export#fehlt" className="grid gap-2 border-b border-ink-200 p-4 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
          <div>
            <label htmlFor="f-objekt" className="text-xs">{t("Objekt")}</label>
            <select id="f-objekt" name="objekt" defaultValue={filter.objekt}>
              <option value="">{t("Alle Objekte")}</option>
              {alleObjekte.map((o) => (
                <option key={o} value={o}>{o} ({stand.fehlend.filter((f) => f.objekt === o).length})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-status" className="text-xs">{t("Status")}</label>
            <select id="f-status" name="status" defaultValue={filter.status}>
              <option value="">{t("Alle")}</option>
              {["KEIN", "DRAFT", "SENT", "VIEWED"].map((s) => (
                <option key={s} value={s}>{t(VERTRAGS_STATUS_NAME[s])} ({stand.fehlend.filter((f) => f.status === s).length})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-q" className="text-xs">{t("Name")}</label>
            <input id="f-q" name="q" defaultValue={filter.q} placeholder={t("Name suchen")} />
          </div>
          <button type="submit" className="btn btn-secondary">{t("Filtern")}</button>
          {(filter.objekt || filter.status || filter.q) && (
            <Link href="/vertraege/export#fehlt" className="btn btn-ghost">{t("Zurücksetzen")}</Link>
          )}
        </form>
        {(filter.objekt || filter.status || filter.q) && (
          <p className="px-5 pt-3 text-xs text-ink-500">{t("{anzahl} von {gesamt} angezeigt", { anzahl: gefiltert.length, gesamt: stand.fehlend.length })}</p>
        )}

        {gefiltert.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={stand.fehlend.length === 0 ? t("Alles vollständig") : t("Keine Treffer")}
              description={stand.fehlend.length === 0 ? t("Alle laufenden Mietverhältnisse haben einen unterschriebenen Vertrag.") : t("Für diesen Filter fehlt kein Vertrag.")}
            />
          </div>
        ) : (
          objekte.map((objekt) => {
            const zeilen = gefiltert.filter((f) => f.objekt === objekt);
            return (
              <div key={objekt} className="border-t border-ink-200 first:border-t-0">
                <h3 className="px-5 pb-2 pt-4 text-base font-bold text-brand-700">
                  {objekt} <span className="font-normal text-ink-500">({zeilen.length})</span>
                </h3>
                <ul>
                  {zeilen.map((f) => (
                    <li key={f.tenancyId} className="border-t border-ink-100 px-5 py-3 odd:bg-ink-50/60">
                      <div className="grid gap-1 sm:grid-cols-[1.4fr_1fr_1.3fr_1fr] sm:items-center sm:gap-3">
                        <p className="font-medium text-ink-900">
                          {f.contractId ? (
                            <Link href={`/vertraege/${f.contractId}`} className="text-brand-700 hover:underline">{f.mieter}</Link>
                          ) : (
                            f.mieter
                          )}
                        </p>
                        <p className="text-sm text-ink-700">
                          {f.zimmer} · {t("Einzug")} {datum(f.einzug)}
                        </p>
                        <p className="text-sm">
                          <Badge tone={STATUS_TON[f.status] ?? "neutral"}>{t(VERTRAGS_STATUS_NAME[f.status] ?? f.status)}</Badge>
                          {f.versendetAm && <span className="ml-1.5 text-xs text-ink-500">{t("seit {datum}", { datum: datum(f.versendetAm) })}</span>}
                        </p>
                        <p className="text-sm text-ink-700">{f.telefon ?? "–"}</p>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-semibold text-brand-700 hover:underline">
                          {t("Unterschriebenen Vertrag hochladen")}
                        </summary>
                        <div className="mt-2 rounded-lg bg-white p-3 ring-1 ring-inset ring-ink-200">
                          <VertragHochladen tenancyId={f.tenancyId} zurueck={zurueck} />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </Card>

      <Card id="aktiv" className="mb-4 scroll-mt-4" title={t("Aktiv mit Vertrag")} description={t("Laufende Mietverhältnisse mit unterschriebenem Vertrag.")} padded={false}>
        <Liste zeilen={stand.aktiv} t={t} datum={datum} mitAuszug={false} />
      </Card>

      <Card id="nicht-aktiv" className="scroll-mt-4" title={t("Nicht mehr aktiv")} description={t("Ausgezogen oder beendet – mit Vertrag, soweit abgelegt.")} padded={false}>
        <Liste zeilen={stand.nichtAktiv} t={t} datum={datum} mitAuszug />
      </Card>
    </>
  );
}

/** Tabelle fuer aktive und ehemalige Mietverhaeltnisse - Zeilen grau/weiss. */
function Liste({
  zeilen,
  t,
  datum,
  mitAuszug,
}: {
  zeilen: VertragsZeile[];
  t: (text: string, werte?: Record<string, string | number>) => string;
  datum: (d: Date) => string;
  mitAuszug: boolean;
}) {
  if (zeilen.length === 0) {
    return <p className="p-5 text-sm text-ink-500">{t("Keine Einträge.")}</p>;
  }
  return (
    <Table>
      <thead>
        <tr>
          <Th>{t("Mieter")}</Th>
          <Th>{t("Objekt")}</Th>
          <Th>{t("Zimmer")}</Th>
          <Th>{t("Einzug")}</Th>
          {mitAuszug && <Th>{t("Auszug")}</Th>}
          <Th>{t("Vertrag")}</Th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.tenancyId} className="odd:bg-ink-50/60">
            <Td className="font-medium">
              {z.contractId ? (
                <Link href={`/vertraege/${z.contractId}`} className="text-brand-700 hover:underline">{z.mieter}</Link>
              ) : (
                z.mieter
              )}
            </Td>
            <Td>{z.objekt}</Td>
            <Td>{z.zimmer}</Td>
            <Td className="whitespace-nowrap">{datum(z.einzug)}</Td>
            {mitAuszug && <Td className="whitespace-nowrap">{z.auszug ? datum(z.auszug) : "–"}</Td>}
            <Td className="whitespace-nowrap">
              {z.pdf ? (
                <a href={z.pdf} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">PDF</a>
              ) : z.status === "SIGNED" ? (
                <Badge tone="warning">{t("unterschrieben, keine Datei")}</Badge>
              ) : (
                <Badge tone="neutral">{t(VERTRAGS_STATUS_NAME[z.status] ?? z.status)}</Badge>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
