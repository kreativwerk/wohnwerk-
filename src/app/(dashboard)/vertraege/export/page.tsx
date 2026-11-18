import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader, StatCard, Table, Td, Th, type Tone } from "@/components/ui";
import { VertraegeZip } from "@/components/vertraege-zip";
import { requireAdmin } from "@/lib/auth";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { VERTRAGS_STATUS_NAME, vertragsExportStand } from "@/lib/vertrags-export";

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
export default async function VertraegeExportPage() {
  const { t, datum } = await oberflaeche();
  await requireAdmin();
  const heute = new Date();
  const stand = await vertragsExportStand(heute);
  const megabyte = stand.dateien.reduce((s, d) => s + d.groesse, 0) / 1024 / 1024;
  const objekte = [...new Set(stand.fehlend.map((f) => f.objekt))];

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

      <div className="mb-4 grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={t("Laufende Mietverhältnisse")} value={String(stand.laufend)} />
        <StatCard label={t("Unterschrieben")} value={String(stand.unterschrieben)} tone="success" />
        <StatCard label={t("Fehlen noch")} value={String(stand.fehlend.length)} tone={stand.fehlend.length > 0 ? "danger" : "success"} />
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

      <Card title={t("Wer noch fehlt")} description={t("Laufende Mietverhältnisse ohne unterschriebenen Vertrag, nach Objekt.")} padded={false}>
        {stand.fehlend.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("Alles vollständig")} description={t("Alle laufenden Mietverhältnisse haben einen unterschriebenen Vertrag.")} />
          </div>
        ) : (
          objekte.map((objekt) => {
            const zeilen = stand.fehlend.filter((f) => f.objekt === objekt);
            return (
              <div key={objekt} className="border-t border-ink-200 first:border-t-0">
                <h3 className="px-5 pb-2 pt-4 text-base font-bold text-brand-700">
                  {objekt} <span className="font-normal text-ink-500">({zeilen.length})</span>
                </h3>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t("Mieter")}</Th>
                      <Th>{t("Zimmer")}</Th>
                      <Th>{t("Einzug")}</Th>
                      <Th>{t("Status")}</Th>
                      <Th>{t("Telefon")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen.map((f) => (
                      <tr key={f.tenancyId} className="odd:bg-ink-50/60">
                        <Td className="font-medium">
                          {f.contractId ? (
                            <Link href={`/vertraege/${f.contractId}`} className="text-brand-700 hover:underline">{f.mieter}</Link>
                          ) : (
                            f.mieter
                          )}
                        </Td>
                        <Td>{f.zimmer}</Td>
                        <Td className="whitespace-nowrap">{datum(f.einzug)}</Td>
                        <Td>
                          <Badge tone={STATUS_TON[f.status] ?? "neutral"}>{t(VERTRAGS_STATUS_NAME[f.status] ?? f.status)}</Badge>
                          {f.versendetAm && <span className="block text-xs text-ink-500">{t("seit {datum}", { datum: datum(f.versendetAm) })}</span>}
                        </Td>
                        <Td className="whitespace-nowrap">{f.telefon ?? "–"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            );
          })
        )}
      </Card>
    </>
  );
}
