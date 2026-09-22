import Link from "next/link";

import {
  assignContractDocument,
  createFormerTenantFromDocument,
  uploadContractDocument,
} from "@/app/actions/contracts";
import { deleteDocument } from "@/app/actions/accounting";
import { ConfirmButton } from "@/components/interactive";
import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { ListenFilter } from "@/components/listenfilter";
import { prisma } from "@/lib/db";

import { requireAdmin } from "@/lib/auth";
import { besterTreffer, nameAusTitel } from "@/lib/vertragsablage";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Vertragsablage") };
}
export const dynamic = "force-dynamic";

const BACK = "/vertraege/ablage";

export default async function ContractInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datum } = await oberflaeche();
  await requireAdmin();
  const params = await searchParams;

  const [offene, mieter] = await Promise.all([
    prisma.document.findMany({
      where: { kind: "CONTRACT", tenantId: null },
      orderBy: [{ documentDate: "asc" }, { title: "asc" }],
      take: 300,
    }),
    prisma.tenant.findMany({
      select: { id: true, firstName: true, lastName: true, status: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const aktiveMieter = mieter.filter((m) => m.status !== "EHEMALIG");

  return (
    <>
      <PageHeader
        title={t("Vertragsablage")}
        description={t("Eingescannte Mietverträge, die noch keinem Mieter gehören. Namen sind in Verträgen und Listen nicht immer gleich geschrieben – hier wird von Hand zugeordnet.")}
        breadcrumb={[{ label: t("Mietverträge"), href: "/vertraege" }, { label: t("Ablage") }]}
        actions={
          <Link href="/vertraege" className="btn btn-secondary">
            {t("Zu den Mietverträgen")}
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("In der Ablage")}
          value={String(offene.length)}
          tone={offene.length > 0 ? "warning" : "success"}
        />
        <StatCard label={t("Mieter zur Auswahl")} value={String(mieter.length)} />
        <StatCard label={t("davon aktiv")} value={String(aktiveMieter.length)} />
      </div>

      <div className="mt-6">
        <Card
          title={t("Weiteren Vertrag ablegen")}
          description={t("Ein gescannter Vertrag landet hier und kann anschließend zugeordnet werden.")}
        >
          <form action={uploadContractDocument} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="file">{t("PDF-Datei")}</label>
              <input id="file" name="file" type="file" accept="application/pdf" required />
            </div>
            <div>
              <label htmlFor="name">{t("Name im Vertrag")}</label>
              <input id="name" name="name" placeholder={t("z. B. Arben Krasniqi")} />
              <p className="field-hint">{t("Hilft beim Zuordnen, ist aber nicht zwingend.")}</p>
            </div>
            <button type="submit" className="btn btn-primary">
              {t("Ablegen")}
            </button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <ListenFilter placeholder={t("Datei, Mieter …")}>
        <Card padded={false}>
          {offene.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={t("Alles zugeordnet")}
                description={t("In der Ablage liegt kein Vertrag mehr. Neue Scans können Sie oben hochladen.")}
                action={
                  <Link href="/vertraege" className="btn btn-primary">
                    {t("Zu den Mietverträgen")}
                  </Link>
                }
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("Name im Vertrag")}</Th>
                  <Th>{t("Vertragsdatum")}</Th>
                  <Th>{t("Scan")}</Th>
                  <Th>{t("Mieter zuordnen")}</Th>
                  <Th align="right">{t("Sonst")}</Th>
                </tr>
              </thead>
              <tbody>
                {offene.map((dokument) => {
                  const name = nameAusTitel(dokument.title);
                  const vorschlag = besterTreffer(name, mieter);
                  const inhalt = /\((.+)\)\s*$/.exec(dokument.title)?.[1];

                  return (
                    <tr key={dokument.id} className="align-top hover:bg-ink-50">
                      <Td>
                        <span className="font-medium text-ink-900">{name}</span>
                        {inhalt && inhalt !== "ohne Zuordnung" && inhalt !== "Bestand" && (
                          <p className="text-xs text-ink-500">{inhalt}</p>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-600">
                        {dokument.documentDate ? datum(dokument.documentDate) : "–"}
                      </Td>
                      <Td>
                        {dokument.driveUrl ? (
                          <a
                            href={dokument.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            {t("PDF öffnen")}
                          </a>
                        ) : (
                          <span className="text-xs text-ink-500">{t("keine Datei")}</span>
                        )}
                      </Td>
                      <Td>
                        <form action={assignContractDocument} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="documentId" value={dokument.id} />
                          <div className="w-60">
                            <label htmlFor={`mieter-${dokument.id}`} className="sr-only">
                              {t("Mieter")}
                            </label>
                            <select
                              id={`mieter-${dokument.id}`}
                              name="tenantId"
                              defaultValue={vorschlag?.tenantId ?? ""}
                              required
                            >
                              <option value="">{t("Mieter auswählen …")}</option>
                              {mieter.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.lastName}, {m.firstName}
                                  {m.status === "EHEMALIG" ? " (ehemalig)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" className="btn btn-primary btn-sm">
                            {t("Zuordnen")}
                          </button>
                          {vorschlag && (
                            <p className="w-full text-xs text-ink-500">
                              {t("Vorschlag:")} <strong>{vorschlag.name}</strong>{" "}
                              {t("({guete} % Namensähnlichkeit) – bitte prüfen.", { guete: Math.round(vorschlag.guete * 100) })}
                            </p>
                          )}
                        </form>
                      </Td>
                      <Td align="right">
                        <div className="flex flex-col items-end gap-1.5">
                          <form action={createFormerTenantFromDocument}>
                            <input type="hidden" name="documentId" value={dokument.id} />
                            <button
                              type="submit"
                              className="btn btn-secondary btn-sm whitespace-nowrap"
                              title={t("Legt den Namen als ehemaligen Mieter an und hängt den Vertrag dort ein")}
                            >
                              {t("Als ehemaligen Mieter anlegen")}
                            </button>
                          </form>
                          <form action={deleteDocument}>
                            <input type="hidden" name="id" value={dokument.id} />
                            <input type="hidden" name="back" value={BACK} />
                            <ConfirmButton
                              className="btn btn-ghost btn-sm"
                              message={t("Scan „{name}“ endgültig löschen?", { name })}
                            >
                              {t("Löschen")}
                            </ConfirmButton>
                          </form>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        </ListenFilter>
      </div>

      <p className="mt-6 text-xs text-ink-500">
        <Badge tone="info">{t("Hinweis")}</Badge> {t("Beim Zuordnen entsteht aus dem Scan ein unterschriebener Mietvertrag, sofern der Mieter ein Mietverhältnis hat – der Vertrag erscheint dann unter Mietverträge. Ehemalige Mieter ohne Mietverhältnis bekommen den Scan zu ihren Unterlagen.")}
      </p>
    </>
  );
}
