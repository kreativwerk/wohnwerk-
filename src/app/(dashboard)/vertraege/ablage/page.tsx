import Link from "next/link";

import {
  assignContractDocument,
  createFormerTenantFromDocument,
  uploadContractDocument,
} from "@/app/actions/contracts";
import { deleteDocument } from "@/app/actions/accounting";
import { ConfirmButton } from "@/components/interactive";
import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";
import { besterTreffer, nameAusTitel } from "@/lib/vertragsablage";

export const metadata = { title: "Vertragsablage" };
export const dynamic = "force-dynamic";

const BACK = "/vertraege/ablage";

export default async function ContractInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
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
        title="Vertragsablage"
        description="Eingescannte Mietverträge, die noch keinem Mieter gehören. Namen sind in Verträgen und Listen nicht immer gleich geschrieben – hier wird von Hand zugeordnet."
        breadcrumb={[{ label: "Mietverträge", href: "/vertraege" }, { label: "Ablage" }]}
        actions={
          <Link href="/vertraege" className="btn btn-secondary">
            Zu den Mietverträgen
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="In der Ablage"
          value={String(offene.length)}
          tone={offene.length > 0 ? "warning" : "success"}
        />
        <StatCard label="Mieter zur Auswahl" value={String(mieter.length)} />
        <StatCard label="davon aktiv" value={String(aktiveMieter.length)} />
      </div>

      <div className="mt-6">
        <Card
          title="Weiteren Vertrag ablegen"
          description="Ein gescannter Vertrag landet hier und kann anschließend zugeordnet werden."
        >
          <form action={uploadContractDocument} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="file">PDF-Datei</label>
              <input id="file" name="file" type="file" accept="application/pdf" required />
            </div>
            <div>
              <label htmlFor="name">Name im Vertrag</label>
              <input id="name" name="name" placeholder="z. B. Arben Krasniqi" />
              <p className="field-hint">Hilft beim Zuordnen, ist aber nicht zwingend.</p>
            </div>
            <button type="submit" className="btn btn-primary">
              Ablegen
            </button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card padded={false}>
          {offene.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Alles zugeordnet"
                description="In der Ablage liegt kein Vertrag mehr. Neue Scans können Sie oben hochladen."
                action={
                  <Link href="/vertraege" className="btn btn-primary">
                    Zu den Mietverträgen
                  </Link>
                }
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name im Vertrag</Th>
                  <Th>Vertragsdatum</Th>
                  <Th>Scan</Th>
                  <Th>Mieter zuordnen</Th>
                  <Th align="right">Sonst</Th>
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
                        {dokument.documentDate ? formatDate(dokument.documentDate) : "–"}
                      </Td>
                      <Td>
                        {dokument.driveUrl ? (
                          <a
                            href={dokument.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            PDF öffnen
                          </a>
                        ) : (
                          <span className="text-xs text-ink-500">keine Datei</span>
                        )}
                      </Td>
                      <Td>
                        <form action={assignContractDocument} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="documentId" value={dokument.id} />
                          <div className="w-60">
                            <label htmlFor={`mieter-${dokument.id}`} className="sr-only">
                              Mieter
                            </label>
                            <select
                              id={`mieter-${dokument.id}`}
                              name="tenantId"
                              defaultValue={vorschlag?.tenantId ?? ""}
                              required
                            >
                              <option value="">Mieter auswählen …</option>
                              {mieter.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.lastName}, {m.firstName}
                                  {m.status === "EHEMALIG" ? " (ehemalig)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" className="btn btn-primary btn-sm">
                            Zuordnen
                          </button>
                          {vorschlag && (
                            <p className="w-full text-xs text-ink-500">
                              Vorschlag: <strong>{vorschlag.name}</strong> (
                              {Math.round(vorschlag.guete * 100)} % Namensähnlichkeit) – bitte prüfen.
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
                              title="Legt den Namen als ehemaligen Mieter an und hängt den Vertrag dort ein"
                            >
                              Als ehemaligen Mieter anlegen
                            </button>
                          </form>
                          <form action={deleteDocument}>
                            <input type="hidden" name="id" value={dokument.id} />
                            <input type="hidden" name="back" value={BACK} />
                            <ConfirmButton
                              className="btn btn-ghost btn-sm"
                              message={`Scan „${name}“ endgültig löschen?`}
                            >
                              Löschen
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
      </div>

      <p className="mt-6 text-xs text-ink-500">
        <Badge tone="info">Hinweis</Badge> Beim Zuordnen entsteht aus dem Scan ein
        unterschriebener Mietvertrag, sofern der Mieter ein Mietverhältnis hat – der Vertrag
        erscheint dann unter Mietverträge. Ehemalige Mieter ohne Mietverhältnis bekommen den
        Scan zu ihren Unterlagen.
      </p>
    </>
  );
}
