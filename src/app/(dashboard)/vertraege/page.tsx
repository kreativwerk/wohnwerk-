import Link from "next/link";

import { createContractForTenancy } from "@/app/actions/contracts";
import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
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

  const [contracts, counts, ohneVertrag] = await Promise.all([
    prisma.contract.findMany({
      where: status ? { status } : {},
      include: {
        tenancy: {
          include: {
            tenant: true,
            bed: { include: { room: { include: { property: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.contract.groupBy({ by: ["status"], _count: { _all: true } }),
    // Aktive und frühere Mietverhältnisse, zu denen (noch) kein Vertrag existiert -
    // z. B. die aus der Excel übernommenen Bestandsmieter.
    prisma.tenancy.findMany({
      where: { contract: null },
      include: {
        tenant: true,
        bed: { include: { room: { include: { property: true } } } },
      },
      orderBy: [{ endDate: { sort: "desc", nulls: "first" } }, { startDate: "desc" }],
      take: 300,
    }),
  ]);

  const heute = new Date();
  const istAktiv = (tenancy: (typeof ohneVertrag)[number]) =>
    tenancy.status !== "ENDED" && (!tenancy.endDate || tenancy.endDate >= heute);
  const aktiveOhneVertrag = ohneVertrag.filter(istAktiv).length;

  const countFor = (value: string) =>
    counts.find((entry) => entry.status === value)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Mietverträge"
        description="Vom Entwurf über den Versand bis zur Unterschrift."
        actions={
          <Link href="/mieter/neu" className="btn btn-primary">
            Neuer Mieter mit Vertrag
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          label="Storniert"
          value={String(countFor("CANCELLED"))}
          href="/vertraege?status=CANCELLED"
        />
      </div>

      {ohneVertrag.length > 0 && (
        <div className="mt-6">
          <Card
            title="Mieter ohne Mietvertrag"
            description={`${aktiveOhneVertrag} aktive und ${ohneVertrag.length - aktiveOhneVertrag} frühere Mietverhältnisse ohne hinterlegten Vertrag.`}
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
                  <Th>Verlauf</Th>
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
                    <Td className="text-xs text-ink-500">
                      {contract.signedAt
                        ? `unterschrieben ${formatDate(contract.signedAt)}`
                        : contract.viewedAt
                          ? `geöffnet ${formatDate(contract.viewedAt)}`
                          : contract.sentAt
                            ? `versendet ${formatDate(contract.sentAt)}`
                            : `angelegt ${formatDate(contract.createdAt)}`}
                    </Td>
                    <Td align="right">
                      <ContractBadge status={contract.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
