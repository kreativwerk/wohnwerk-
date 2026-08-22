import Link from "next/link";

import { Card, EmptyState, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { TenancyBadge } from "@/components/status";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Mieter" };
export const dynamic = "force-dynamic";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; q?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const statusFilter = params.status ?? "";

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { company: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(statusFilter ? { tenancies: { some: { status: statusFilter } } } : {}),
    },
    include: {
      tenancies: {
        include: { bed: { include: { room: { include: { property: true } } } } },
        orderBy: { startDate: "desc" },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Mieter"
        description="Monteure und Mitarbeiter mit ihren Mietverhältnissen."
        actions={
          <Link href="/mieter/neu" className="btn btn-primary">
            Neuer Mieter
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <Card padded={false}>
        <form className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="q">Suche</label>
            <input id="q" name="q" defaultValue={query} placeholder="Name, E-Mail oder Firma" />
          </div>
          <div className="w-48">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={statusFilter}>
              <option value="">Alle</option>
              <option value="ACTIVE">Aktiv</option>
              <option value="SENT">Vertrag versendet</option>
              <option value="DRAFT">Entwurf</option>
              <option value="ENDED">Beendet</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            Filtern
          </button>
          {(query || statusFilter) && (
            <Link href="/mieter" className="btn btn-ghost">
              Zurücksetzen
            </Link>
          )}
        </form>

        {tenants.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={query || statusFilter ? "Keine Treffer" : "Noch keine Mieter"}
              description={
                query || statusFilter
                  ? "Passen Sie Suche oder Filter an."
                  : "Legen Sie einen Mieter an und weisen Sie ihm direkt ein Bett zu. Anschließend erhält er den Vertragslink."
              }
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
                <Th>Name</Th>
                <Th>Kontakt</Th>
                <Th>Firma</Th>
                <Th>Unterkunft</Th>
                <Th>Zeitraum</Th>
                <Th align="right">Miete</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                // Das relevanteste Mietverhältnis: laufend, sonst das jüngste.
                const current =
                  tenant.tenancies.find((t) => t.status === "ACTIVE") ??
                  tenant.tenancies.find((t) => t.status === "SENT") ??
                  tenant.tenancies[0];

                return (
                  <tr key={tenant.id} className="hover:bg-ink-50">
                    <Td>
                      <Link
                        href={`/mieter/${tenant.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {tenant.lastName}, {tenant.firstName}
                      </Link>
                    </Td>
                    <Td className="text-ink-600">
                      <a href={`mailto:${tenant.email}`} className="hover:text-brand-700">
                        {tenant.email}
                      </a>
                      {tenant.phone && <p className="text-xs text-ink-500">{tenant.phone}</p>}
                    </Td>
                    <Td className="text-ink-600">{tenant.company ?? "–"}</Td>
                    <Td className="text-ink-600">
                      {current ? (
                        <>
                          {current.bed.room.property.name}
                          <p className="text-xs text-ink-500">
                            {current.bed.room.name} · {current.bed.label}
                          </p>
                        </>
                      ) : (
                        <span className="text-ink-500">nicht zugewiesen</span>
                      )}
                    </Td>
                    <Td className="text-ink-600">
                      {current ? (
                        <>
                          {formatDate(current.startDate)}
                          <p className="text-xs text-ink-500">
                            {current.endDate ? `bis ${formatDate(current.endDate)}` : "unbefristet"}
                          </p>
                        </>
                      ) : (
                        "–"
                      )}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {current ? formatCents(current.monthlyRentCents) : "–"}
                    </Td>
                    <Td align="right">
                      {current ? <TenancyBadge status={current.status} /> : <span className="text-ink-500">–</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
