import Link from "next/link";

import { Card, EmptyState, Meter, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { ChargeBadge, ContractBadge } from "@/components/status";
import { prisma } from "@/lib/db";
import { monthlyCashflow, periodSummary } from "@/lib/accounting";
import { occupancySummary } from "@/lib/tenancy";

import { endOfMonth, startOfMonth } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Dashboard") };
}
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { t, datum, monat, geld } = await oberflaeche();
  await requireAdmin();
  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const [occupancy, summary, cashflow, properties, upcoming, recentContracts, openCharges, offeneTickets, offeneMeldungen] =
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
      // Neue Anliegen sollen hier auffallen, nicht in einer Unterseite versanden.
      prisma.ticket.count({ where: { status: { not: "ERLEDIGT" }, art: "OBJEKT" } }),
      prisma.ticket.count({ where: { status: { not: "ERLEDIGT" }, art: "SUPPORT" } }),
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
        title={t("Dashboard")}
        description={`Stand ${datum(now)} · ${monat(now.getUTCFullYear(), now.getUTCMonth() + 1)}`}
        actions={
          <>
            <Link href="/mieter/neu" className="btn btn-secondary">
              {t("Neuer Mieter")}
            </Link>
            <Link href="/objekte/neu" className="btn btn-primary">
              {t("Neues Objekt")}
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("Auslastung")}
          value={`${Math.round(occupancy.rate * 100)} %`}
          hint={t("{belegt} von {gesamt} vermietbaren Betten", { belegt: occupancy.occupied, gesamt: occupancy.beds - occupancy.blocked })}
          tone={occupancy.rate >= 0.8 ? "success" : occupancy.rate >= 0.5 ? "warning" : "danger"}
          href="/belegung"
        />
        <StatCard
          label={t("Laufende Mieten")}
          value={geld(occupancy.actualRentCents)}
          hint={t("Potenzial {betrag} pro Monat", { betrag: geld(occupancy.potentialRentCents) })}
          tone="brand"
        />
        <StatCard
          label={t("Offene Posten")}
          value={geld(summary.openChargesCents)}
          hint={t("{anzahl} Forderung(en), davon {ueberfaellig} überfällig", { anzahl: summary.openChargesCount, ueberfaellig: summary.overdueCount })}
          tone={summary.openChargesCents > 0 ? "warning" : "success"}
          href="/buchhaltung/offene-posten"
        />
        <StatCard
          label={t("Saldo laufender Monat")}
          value={geld(summary.balanceCents)}
          hint={t("{ein} ein · {aus} aus", { ein: geld(summary.incomeCents), aus: geld(summary.expenseCents) })}
          tone={summary.balanceCents >= 0 ? "success" : "danger"}
          href="/buchhaltung"
        />
      </div>

      {(summary.unreviewedCount > 0 || summary.missingReceiptsCount > 0 || offeneTickets > 0 || offeneMeldungen > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {offeneTickets > 0 && (
            <Link href="/tickets?art=OBJEKT" className="card block px-5 py-4 hover:border-amber-300">
              <p className="text-sm font-semibold text-amber-700">
                {t("{anzahl} offene(s) Ticket(s)", { anzahl: offeneTickets })}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {t("Gemeldete Schäden und Anliegen aus den Objekten.")}
              </p>
            </Link>
          )}
          {offeneMeldungen > 0 && (
            <Link href="/tickets?art=SUPPORT" className="card block px-5 py-4 hover:border-sky-300">
              <p className="text-sm font-semibold text-sky-700">
                {t("{anzahl} offene(s) Support-Ticket(s)", { anzahl: offeneMeldungen })}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {t("Gemeldete Probleme mit dieser Anwendung – liegen bei der IT.")}
              </p>
            </Link>
          )}
          {summary.unreviewedCount > 0 && (
            <Link href="/buchhaltung?status=OPEN" className="card block px-5 py-4 hover:border-amber-300">
              <p className="text-sm font-semibold text-amber-700">
                {t("{anzahl} Buchung(en) noch nicht geprüft", { anzahl: summary.unreviewedCount })}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {t("Kategorie zuordnen oder als erledigt markieren.")}
              </p>
            </Link>
          )}
          {summary.missingReceiptsCount > 0 && (
            <Link
              href="/buchhaltung?fehlend=1"
              className="card block px-5 py-4 hover:border-amber-300"
            >
              <p className="text-sm font-semibold text-amber-700">
                {t("{anzahl} Ausgabe(n) ohne Beleg", { anzahl: summary.missingReceiptsCount })}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {t("Für den Steuerberater sollte zu jeder Ausgabe ein Beleg vorliegen.")}
              </p>
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          title={t("Auslastung je Objekt")}
          className="min-w-0 lg:col-span-2"
          actions={
            <Link href="/objekte" className="btn btn-ghost">
              {t("Alle Objekte")}
            </Link>
          }
        >
          {perProperty.length === 0 ? (
            <EmptyState
              title={t("Noch keine Objekte angelegt")}
              description={t("Legen Sie Ihr erstes Objekt mit Zimmern und Betten an, um die Auslastung zu sehen.")}
              action={
                <Link href="/objekte/neu" className="btn btn-primary">
                  {t("Objekt anlegen")}
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
                      {t("{belegt}/{gesamt} Betten ·", { belegt: stats.occupied, gesamt: stats.beds - stats.blocked })}{" "}
                      {t("{betrag} / Monat", { betrag: geld(stats.actualRentCents) })}
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
                    {stats.blocked > 0 ? ` · ${t("{anzahl} gesperrt", { anzahl: stats.blocked })}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("Verträge in Bearbeitung")} description={t("Versendet, aber noch nicht unterschrieben")}>
          {recentContracts.length === 0 ? (
            <p className="text-sm text-ink-500">{t("Alle Verträge sind unterschrieben.")}</p>
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
                      {contract.contractNumber} · versendet {datum(contract.sentAt)}
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
          title={t("Einnahmen und Ausgaben")}
          description={t("Letzte 12 Monate aus den importierten Kontoauszügen")}
          className="min-w-0 lg:col-span-2"
        >
          {cashflow.every((month) => month.incomeCents === 0 && month.expenseCents === 0) ? (
            <EmptyState
              title={t("Noch keine Buchungen")}
              description={t("Laden Sie einen Kontoauszug hoch, um Einnahmen und Ausgaben zu sehen.")}
              action={
                <Link href="/buchhaltung/kontoauszuege" className="btn btn-primary">
                  {t("Kontoauszug hochladen")}
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
                      title={`Einnahmen ${geld(month.incomeCents)}`}
                    />
                    <div
                      className="w-1/2 rounded-t bg-rose-400"
                      style={{ height: `${(month.expenseCents / maxCashflow) * 100}%` }}
                      title={`Ausgaben ${geld(month.expenseCents)}`}
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
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> {t("Einnahmen")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> {t("Ausgaben")}
            </span>
          </div>
        </Card>

        <Card title={t("Auszüge in Kürze")} description={t("Mietverhältnisse mit festem Ende")}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-500">{t("Keine befristeten Mietverhältnisse.")}</p>
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
                    bis {datum(tenancy.endDate)} · {tenancy.bed.room.property.name},{" "}
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
          title={t("Überfällige Mieten")}
          description={t("Forderungen, deren Fälligkeit erreicht ist und die noch nicht ausgeglichen sind")}
          padded={false}
          actions={
            <Link href="/buchhaltung/offene-posten" className="btn btn-ghost">
              {t("Alle offenen Posten")}
            </Link>
          }
        >
          {openCharges.length === 0 ? (
            <div className="p-5">
              <p className="text-sm text-ink-500">{t("Alle fälligen Mieten sind bezahlt.")}</p>
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("Mieter")}</Th>
                  <Th>{t("Objekt")}</Th>
                  <Th>{t("Monat")}</Th>
                  <Th>{t("Fällig")}</Th>
                  <Th align="right">{t("Offen")}</Th>
                  <Th align="right">{t("Status")}</Th>
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
                        <span className="text-ink-500"> · {charge.tenancy.bed.room.name}</span>
                      </Td>
                      <Td>{monat(charge.periodYear, charge.periodMonth)}</Td>
                      <Td className="text-ink-600">{datum(charge.dueDate)}</Td>
                      <Td align="right" className="font-semibold tabular-nums text-rose-600">
                        {geld(charge.amountCents - paid)}
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
