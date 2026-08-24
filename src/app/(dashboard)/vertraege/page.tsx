import Link from "next/link";

import { createContractForTenancy, endContract } from "@/app/actions/contracts";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Flash,
  PageHeader,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ConfirmButton } from "@/components/interactive";
import { ContractBadge } from "@/components/status";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Mietverträge" };
export const dynamic = "force-dynamic";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status = params.status ?? "";
  const heute = new Date();

  const [contracts, counts, ohneVertrag, ehemalige, inAblage, laufendeMietverhaeltnisse] =
    await Promise.all([
    prisma.contract.findMany({
      where: status ? { status } : {},
      include: {
        tenancy: {
          include: {
            tenant: true,
            bed: { include: { room: { include: { property: true } } } },
          },
        },
        documents: { select: { id: true, driveUrl: true }, orderBy: { uploadedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.contract.groupBy({ by: ["status"], _count: { _all: true } }),
    // Mietverhältnisse aktiver Mieter, zu denen kein Vertrag existiert.
    prisma.tenancy.findMany({
      where: { contract: null, tenant: { status: { not: "EHEMALIG" } } },
      include: {
        tenant: true,
        bed: { include: { room: { include: { property: true } } } },
      },
      orderBy: [{ endDate: { sort: "desc", nulls: "first" } }, { startDate: "desc" }],
      take: 300,
    }),
    // Ehemalige Mieter ohne eigenen Vertragsdatensatz: ausgezogen, oft ohne
    // bekanntes Bett. Wer einen Vertrag hat, steht schon in der Tabelle oben.
    prisma.tenant.findMany({
      where: { status: "EHEMALIG", tenancies: { none: { contract: { isNot: null } } } },
      include: {
        documents: {
          where: { kind: "CONTRACT" },
          select: { id: true, title: true, driveUrl: true, documentDate: true },
          orderBy: { documentDate: "asc" },
        },
        tenancies: {
          include: { bed: { include: { room: { include: { property: true } } } } },
          orderBy: { startDate: "asc" },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
    }),
    prisma.document.count({ where: { kind: "CONTRACT", tenantId: null } }),
    // Abgleich: wie viele Mietverhältnisse laufen gerade überhaupt?
    prisma.tenancy.count({
      where: {
        tenant: { status: { not: "EHEMALIG" } },
        status: { not: "ENDED" },
        OR: [{ endDate: null }, { endDate: { gte: heute } }],
      },
    }),
  ]);

  const istAktiv = (tenancy: (typeof ohneVertrag)[number]) =>
    tenancy.status !== "ENDED" && (!tenancy.endDate || tenancy.endDate >= heute);
  const aktiveOhneVertrag = ohneVertrag.filter(istAktiv).length;

  const countFor = (value: string) =>
    counts.find((entry) => entry.status === value)?._count._all ?? 0;

  // Der eigentliche Abgleich: zu jedem laufenden Mietverhältnis gehört ein
  // Vertrag. Was hier fehlt, steht unten namentlich in der Liste.
  const mitVertrag = Math.max(0, laufendeMietverhaeltnisse - aktiveOhneVertrag);

  /** Der hinterlegte Scan bzw. das erzeugte PDF eines Vertrags. */
  const vertragsPdf = (contract: (typeof contracts)[number]) =>
    contract.pdfUrl ?? contract.documents.find((d) => d.driveUrl)?.driveUrl ?? null;

  return (
    <>
      <PageHeader
        title="Mietverträge"
        description="Vom Entwurf über den Versand bis zur Unterschrift."
        actions={
          <>
            <Link href="/vertraege/ablage" className="btn btn-secondary">
              Ablage{inAblage > 0 ? ` (${inAblage})` : ""}
            </Link>
            <Link href="/mieter/neu" className="btn btn-primary">
              Neuer Mieter mit Vertrag
            </Link>
          </>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {/* Abgleich laufende Mietverhältnisse gegen vorhandene Verträge */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Laufende Mietverhältnisse" value={String(laufendeMietverhaeltnisse)} />
        <StatCard
          label="Vertrag hinterlegt"
          value={`${mitVertrag} von ${laufendeMietverhaeltnisse}`}
          tone={aktiveOhneVertrag === 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Vertrag fehlt"
          value={String(aktiveOhneVertrag)}
          tone={aktiveOhneVertrag > 0 ? "danger" : "success"}
          hint={aktiveOhneVertrag > 0 ? "namentlich in der Liste unten" : "alle vollständig"}
        />
        <StatCard
          label="In der Ablage"
          value={String(inAblage)}
          tone={inAblage > 0 ? "warning" : "success"}
          href="/vertraege/ablage"
          hint={inAblage > 0 ? "noch keinem Mieter zugeordnet" : "alles zugeordnet"}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Entwürfe" value={String(countFor("DRAFT"))} href="/vertraege?status=DRAFT" />
        <StatCard
          label="Versendet"
          value={String(countFor("SENT") + countFor("VIEWED"))}
          tone="info"
          href="/vertraege?status=SENT"
        />
        <StatCard
          label="Unterschrieben"
          value={String(countFor("SIGNED"))}
          tone="success"
          href="/vertraege?status=SIGNED"
        />
        <StatCard
          label="Beendet"
          value={String(countFor("ENDED") + countFor("CANCELLED"))}
          href="/vertraege?status=ENDED"
        />
      </div>

      {inAblage > 0 && (
        <div className="mt-6">
          <Alert tone="warning" title={`${inAblage} Vertrag/Verträge warten auf Zuordnung`}>
            In der Ablage liegen eingescannte Mietverträge, die keinem Mieter zugeordnet werden
            konnten – oft weil der Name anders geschrieben ist.{" "}
            <Link href="/vertraege/ablage" className="font-semibold underline">
              Jetzt zuordnen
            </Link>
          </Alert>
        </div>
      )}

      {ohneVertrag.length > 0 && (
        <div className="mt-6">
          <Card
            title="Mieter ohne Mietvertrag"
            description={`${aktiveOhneVertrag} aktive und ${ohneVertrag.length - aktiveOhneVertrag} frühere Mietverhältnisse ohne hinterlegten Vertrag. Liegt der Vertrag als Scan vor, ordnen Sie ihn in der Ablage zu.`}
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Mieter</Th>
                  <Th>Unterkunft</Th>
                  <Th>Zeitraum</Th>
                  <Th align="right">Miete</Th>
                  <Th align="right">Status</Th>
                  <Th align="right">Aktion</Th>
                </tr>
              </thead>
              <tbody>
                {ohneVertrag.map((tenancy) => {
                  const aktiv = istAktiv(tenancy);
                  return (
                    <tr key={tenancy.id} className="hover:bg-ink-50">
                      <Td>
                        <Link
                          href={`/mieter/${tenancy.tenantId}`}
                          className="font-medium hover:text-brand-700"
                        >
                          {tenancy.tenant.firstName} {tenancy.tenant.lastName}
                        </Link>
                        <p className="font-mono text-xs text-ink-500">{tenancy.reference}</p>
                      </Td>
                      <Td className="text-ink-600">
                        {tenancy.bed.room.property.name}
                        <p className="text-xs text-ink-500">
                          {tenancy.bed.room.name} · {tenancy.bed.label}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap text-ink-600">
                        {formatDate(tenancy.startDate)} –{" "}
                        {tenancy.endDate ? formatDate(tenancy.endDate) : "offen"}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {formatCents(tenancy.monthlyRentCents)}
                      </Td>
                      <Td align="right">
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          <Badge tone={aktiv ? "success" : "neutral"}>
                            {aktiv ? "Aktiv" : "Ausgezogen"}
                          </Badge>
                          <Badge tone="danger">Mietvertrag fehlt</Badge>
                        </span>
                      </Td>
                      <Td align="right">
                        <form action={createContractForTenancy}>
                          <input type="hidden" name="tenancyId" value={tenancy.id} />
                          <input type="hidden" name="back" value="/vertraege" />
                          <button
                            type="submit"
                            className="btn btn-secondary btn-sm"
                            title="Vertragsentwurf für dieses Mietverhältnis anlegen"
                          >
                            Vertrag anlegen
                          </button>
                        </form>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <Card padded={false}>
          <form className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
            <div className="w-56">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={status}>
                <option value="">Alle</option>
                <option value="DRAFT">Entwurf</option>
                <option value="SENT">Versendet</option>
                <option value="VIEWED">Geöffnet</option>
                <option value="SIGNED">Unterschrieben</option>
                <option value="ENDED">Beendet</option>
                <option value="CANCELLED">Storniert</option>
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">
              Filtern
            </button>
            {status && (
              <Link href="/vertraege" className="btn btn-ghost">
                Zurücksetzen
              </Link>
            )}
          </form>

          {contracts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Keine Verträge"
                description="Sobald Sie einem Mieter ein Bett zuweisen, entsteht automatisch ein Vertragsentwurf."
                action={
                  <Link href="/mieter/neu" className="btn btn-primary">
                    Mieter anlegen
                  </Link>
                }
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Vertrag</Th>
                  <Th>Mieter</Th>
                  <Th>Unterkunft</Th>
                  <Th>Mietbeginn</Th>
                  <Th align="right">Miete</Th>
                  <Th>Dokument</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id} className="hover:bg-ink-50">
                    <Td>
                      <Link
                        href={`/vertraege/${contract.id}`}
                        className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-700"
                      >
                        {contract.contractNumber}
                      </Link>
                    </Td>
                    <Td>
                      <Link
                        href={`/mieter/${contract.tenancy.tenantId}`}
                        className="font-medium hover:text-brand-700"
                      >
                        {contract.tenancy.tenant.firstName} {contract.tenancy.tenant.lastName}
                      </Link>
                      <p className="text-xs text-ink-500">{contract.tenancy.tenant.email}</p>
                    </Td>
                    <Td className="text-ink-600">
                      {contract.tenancy.bed.room.property.name}
                      <p className="text-xs text-ink-500">
                        {contract.tenancy.bed.room.name} · {contract.tenancy.bed.label}
                      </p>
                    </Td>
                    <Td className="text-ink-600">{formatDate(contract.tenancy.startDate)}</Td>
                    <Td align="right" className="tabular-nums">
                      {formatCents(contract.tenancy.monthlyRentCents)}
                    </Td>
                    <Td>
                      {vertragsPdf(contract) ? (
                        <a
                          href={vertragsPdf(contract)!}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          Vertrag öffnen
                        </a>
                      ) : (
                        <Badge tone="warning">Kein Dokument</Badge>
                      )}
                      <p className="mt-1 text-xs text-ink-500">
                        {contract.signedAt
                          ? `unterschrieben ${formatDate(contract.signedAt)}`
                          : contract.viewedAt
                            ? `geöffnet ${formatDate(contract.viewedAt)}`
                            : contract.sentAt
                              ? `versendet ${formatDate(contract.sentAt)}`
                              : `angelegt ${formatDate(contract.createdAt)}`}
                      </p>
                    </Td>
                    <Td align="right">
                      <ContractBadge status={contract.status} />
                      {contract.status !== "ENDED" && contract.status !== "CANCELLED" && (
                        <form action={endContract} className="mt-1.5">
                          <input type="hidden" name="id" value={contract.id} />
                          <input type="hidden" name="back" value="/vertraege" />
                          <ConfirmButton
                            className="btn btn-ghost btn-sm"
                            message={`Vertrag von ${contract.tenancy.tenant.firstName} ${contract.tenancy.tenant.lastName} beenden? Das Mietverhältnis wird beendet und der Mieter gilt als ehemalig.`}
                          >
                            Vertrag beenden
                          </ConfirmButton>
                        </form>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {ehemalige.length > 0 && (
        <div className="mt-6">
          <Card
            title="Ehemalige Mieter – Verträge beendet"
            description={`${ehemalige.length} Personen sind ausgezogen; zu ihnen ist kein Bett mehr hinterlegt. Die Verträge bleiben für die Buchhaltung erhalten.`}
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Mieter</Th>
                  <Th>Unterkunft</Th>
                  <Th>Vertragsdatum</Th>
                  <Th>Dokument</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {ehemalige.map((mieter) => {
                  const objekt = mieter.tenancies[0]?.bed.room.property.name ?? null;
                  const zeitraum = mieter.tenancies[0];
                  return (
                    <tr key={mieter.id} className="hover:bg-ink-50">
                      <Td>
                        <Link
                          href={`/mieter/${mieter.id}`}
                          className="font-medium hover:text-brand-700"
                        >
                          {mieter.firstName} {mieter.lastName}
                        </Link>
                      </Td>
                      <Td className="text-ink-600">
                        {objekt ?? <span className="text-xs text-ink-500">nicht hinterlegt</span>}
                        {zeitraum && (
                          <p className="text-xs text-ink-500">
                            {formatDate(zeitraum.startDate)} –{" "}
                            {zeitraum.endDate ? formatDate(zeitraum.endDate) : "offen"}
                          </p>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-600">
                        {mieter.documents[0]?.documentDate
                          ? formatDate(mieter.documents[0].documentDate)
                          : "–"}
                      </Td>
                      <Td>
                        {mieter.documents.length === 0 ? (
                          <Badge tone="warning">Kein Dokument</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {mieter.documents.map((dokument, index) => (
                              <a
                                key={dokument.id}
                                href={dokument.driveUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost btn-sm"
                              >
                                {mieter.documents.length > 1
                                  ? `Vertrag ${index + 1}`
                                  : "Vertrag öffnen"}
                              </a>
                            ))}
                          </div>
                        )}
                      </Td>
                      <Td align="right">
                        <Badge tone="neutral">Beendet</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
