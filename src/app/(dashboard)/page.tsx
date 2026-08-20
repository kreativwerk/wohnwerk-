import Link from "next/link";

import { Card, EmptyState, Meter, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { ChargeBadge, ContractBadge } from "@/components/status";
import { prisma } from "@/lib/db";
import { monthlyCashflow, periodSummary } from "@/lib/accounting";
import { occupancySummary } from "@/lib/tenancy";
import { formatCents } from "@/lib/money";
import { endOfMonth, formatDate, formatMonth, startOfMonth } from "@/lib/dates";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const [occupancy, summary, cashflow, properties, upcoming, recentContracts, openCharges] =
    await Promise.all([
      occupancySummary(),
      periodSummary(from, to),
      monthlyCashflow(12),
      prisma.property.findMany({
        where: { active: true },
        include: { rooms: { include: { beds: { select: { id: true, monthlyRentCents: true } } } } },
        orderBy: { name: "asc" },
      }),
      prisma.tenancy.findMany({
        where: { status: { in: ["SENT", "ACTIVE"] }, endDate: { not: null, gte: now } },
        include: {
          tenant: true,
          bed: { include: { room: { include: { property: true } } } },
        },
        orderBy: { endDate: "asc" },
        take: 6,
      }),
      prisma.contract.findMany({
        where: { status: { in: ["SENT", "VIEWED"] } },
        include: { tenancy: { include: { tenant: true } } },
        orderBy: { sentAt: "desc" },
        take: 6,
      }),
      prisma.rentCharge.findMany({
        where: { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lte: now } },
        include: {
          allocations: { select: { amountCents: true } },
          tenancy: {
            include: {
              tenant: true,
              bed: { include: { room: { include: { property: true } } } },
            },
          },
        },
        orderBy: { dueDate: "asc" },
        take: 8,
      }),
    ]);

  // Auslastung je Objekt für die Balken in der Übersicht
  const perProperty = await Promise.all(
    properties.map(async (property) => ({
      property,
      summary: await occupancySummary(property.id),
    })),
  );

  const maxCashflow = Math.max(
    1,
    ...cashflow.map((month) => Math.max(month.incomeCents, month.expenseCents)),
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Stand ${formatDate(now)} · ${formatMonth(now.getUTCFullYear(), now.getUTCMonth() + 1)}`}
        actions={
          <>
            <Link href="/mieter/neu" className="btn btn-secondary">
              Neuer Mieter
            </Link>
            <Link href="/objekte/neu" className="btn btn-primary">
              Neues Objekt
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Auslastung"
          value={`${Math.round(occupancy.rate * 100)} %`}
          hint={`${occupancy.occupied} von ${occupancy.beds - occupancy.blocked} vermietbaren Betten`}
          tone={occupancy.rate >= 0.8 ? "success" : occupancy.rate >= 0.5 ? "warning" : "danger"}
          href="/belegung"
        />
        <StatCard
          label="Laufende Mieten"
          value={formatCents(occupancy.actualRentCents)}
          hint={`Potenzial ${formatCents(occupancy.potentialRentCents)} pro Monat`}
          tone="brand"
        />
        <StatCard
          label="Offene Posten"
          value={formatCents(summary.openChargesCents)}
          hint={`${summary.openChargesCount} Forderung(en), davon ${summary.overdueCount} überfällig`}
          tone={summary.openChargesCents > 0 ? "warning" : "success"}
          href="/buchhaltung/offene-posten"
        />
        <StatCard
          label="Saldo laufender Monat"
          value={formatCents(summary.balanceCents)}
          hint={`${formatCents(summary.incomeCents)} ein · ${formatCents(summary.expenseCents)} aus`}
          tone={summary.balanceCents >= 0 ? "success" : "danger"}
          href="/buchhaltung"
        />
      </div>

      {(summary.unreviewedCount > 0 || summary.missingReceiptsCount > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {summary.unreviewedCount > 0 && (
            <Link href="/buchhaltung?status=OPEN" className="card block px-5 py-4 hover:border-amber-300">
              <p className="text-sm font-semibold text-amber-700">
                {summary.unreviewedCount} Buchung(en) noch nicht geprüft
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                Kategorie zuordnen oder als erledigt markieren.
              </p>
            </Link>
          )}
          {summary.missingReceiptsCount > 0 && (
            <Link
              href="/buchhaltung?fehlend=1"
              className="card block px-5 py-4 hover:border-amber-300"
            >
              <p className="text-sm font-semibold text-amber-700">
                {summary.missingReceiptsCount} Ausgabe(n) ohne Beleg
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                Für den Steuerberater sollte zu jeder Ausgabe ein Beleg vorliegen.
              </p>
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          title="Auslastung je Objekt"
          className="lg:col-span-2"
          actions={
            <Link href="/objekte" className="btn btn-ghost">
              Alle Objekte
            </Link>
          }
        >
          {perProperty.length === 0 ? (
            <EmptyState
              title="Noch keine Objekte angelegt"
              description="Legen Sie Ihr erstes Objekt mit Zimmern und Betten an, um die Auslastung zu sehen."
              action={
                <Link href="/objekte/neu" className="btn btn-primary">
                  Objekt anlegen
                </Link>
              }
            />
          ) : (
            <ul className="space-y-4">
              {perProperty.map(({ property, summary: stats }) => (
                <li key={property.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/objekte/${property.id}`}
                      className="text-sm font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {property.name}
                    </Link>
                    <span className="text-xs text-ink-500">
                      {stats.occupied}/{stats.beds - stats.blocked} Betten ·{" "}
                      {formatCents(stats.actualRentCents)} / Monat
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Meter
                      value={stats.rate}
                      tone={stats.rate >= 0.8 ? "success" : stats.rate >= 0.5 ? "warning" : "danger"}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {property.street}, {property.zip} {property.city}
                    {stats.blocked > 0 ? ` · ${stats.blocked} gesperrt` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Verträge in Bearbeitung" description="Versendet, aber noch nicht unterschrieben">
          {recentContracts.length === 0 ? (
            <p className="text-sm text-ink-500">Alle Verträge sind unterschrieben.</p>
          ) : (
            <ul className="space-y-3">
              {recentContracts.map((contract) => (
                <li key={contract.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/vertraege/${contract.id}`}
                      className="block truncate text-sm font-medium text-ink-900 hover:text-brand-700"
                    >
                      {contract.tenancy.tenant.firstName} {contract.tenancy.tenant.lastName}
                    </Link>
                    <p className="text-xs text-ink-500">
                      {contract.contractNumber} · versendet {formatDate(contract.sentAt)}
                    </p>
                  </div>
                  <ContractBadge status={contract.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          title="Einnahmen und Ausgaben"
          description="Letzte 12 Monate aus den importierten Kontoauszügen"
          className="lg:col-span-2"
        >
          {cashflow.every((month) => month.incomeCents === 0 && month.expenseCents === 0) ? (
            <EmptyState
              title="Noch keine Buchungen"
              description="Laden Sie einen Kontoauszug hoch, um Einnahmen und Ausgaben zu sehen."
              action={
                <Link href="/buchhaltung/kontoauszuege" className="btn btn-primary">
                  Kontoauszug hochladen
                </Link>
              }
            />
          ) : (
            <div className="flex h-52 items-end gap-1.5">
              {cashflow.map((month) => (
                <div key={`${month.year}-${month.month}`} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 rounded-t bg-brand-500"
                      style={{ height: `${(month.incomeCents / maxCashflow) * 100}%` }}
                      title={`Einnahmen ${formatCents(month.incomeCents)}`}
                    />
                    <div
                      className="w-1/2 rounded-t bg-rose-400"
                      style={{ height: `${(month.expenseCents / maxCashflow) * 100}%` }}
                      title={`Ausgaben ${formatCents(month.expenseCents)}`}
                    />
                  </div>
                  <span className="text-[0.6rem] text-ink-500">
                    {String(month.month).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-4 text-xs text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Einnahmen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Ausgaben
            </span>
          </div>
        </Card>

        <Card title="Auszüge in Kürze" description="Mietverhältnisse mit festem Ende">
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-500">Keine befristeten Mietverhältnisse.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((tenancy) => (
                <li key={tenancy.id}>
                  <Link
                    href={`/mieter/${tenancy.tenantId}`}
                    className="text-sm font-medium text-ink-900 hover:text-brand-700"
                  >
                    {tenancy.tenant.firstName} {tenancy.tenant.lastName}
                  </Link>
                  <p className="text-xs text-ink-500">
                    bis {formatDate(tenancy.endDate)} · {tenancy.bed.room.property.name},{" "}
                    {tenancy.bed.room.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Überfällige Mieten"
          description="Forderungen, deren Fälligkeit erreicht ist und die noch nicht ausgeglichen sind"
          padded={false}
          actions={
            <Link href="/buchhaltung/offene-posten" className="btn btn-ghost">
              Alle offenen Posten
            </Link>
          }
        >
          {openCharges.length === 0 ? (
            <div className="p-5">
              <p className="text-sm text-ink-500">Alle fälligen Mieten sind bezahlt.</p>
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Mieter</Th>
                  <Th>Objekt</Th>
                  <Th>Monat</Th>
                  <Th>Fällig</Th>
                  <Th align="right">Offen</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {openCharges.map((charge) => {
                  const paid = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
                  return (
                    <tr key={charge.id}>
                      <Td>
                        <Link
                          href={`/mieter/${charge.tenancy.tenantId}`}
                          className="font-medium hover:text-brand-700"
                        >
                          {charge.tenancy.tenant.firstName} {charge.tenancy.tenant.lastName}
                        </Link>
                        <p className="text-xs text-ink-500">{charge.tenancy.reference}</p>
                      </Td>
                      <Td className="text-ink-600">
                        {charge.tenancy.bed.room.property.name}
                        <span className="text-ink-400"> · {charge.tenancy.bed.room.name}</span>
                      </Td>
                      <Td>{formatMonth(charge.periodYear, charge.periodMonth)}</Td>
                      <Td className="text-ink-600">{formatDate(charge.dueDate)}</Td>
                      <Td align="right" className="font-semibold tabular-nums text-rose-600">
                        {formatCents(charge.amountCents - paid)}
                      </Td>
                      <Td align="right">
                        <ChargeBadge status={charge.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
