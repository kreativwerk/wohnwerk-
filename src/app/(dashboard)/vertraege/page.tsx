import Link from "next/link";

import { Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
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

  const [contracts, counts] = await Promise.all([
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
  ]);

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
