import Link from "next/link";

import {
  allocatePayment,
  generateCharges,
  removeAllocation,
  runAutoMatch,
  waiveCharge,
} from "@/app/actions/accounting";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { ChargeBadge } from "@/components/status";
import { Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { centsToInput, formatCents } from "@/lib/money";
import { formatDate, formatMonth } from "@/lib/dates";

export const metadata = { title: "Offene Posten" };
export const dynamic = "force-dynamic";

const BACK = "/buchhaltung/offene-posten";

export default async function OpenItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; status?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "OFFEN";

  const statusWhere =
    statusFilter === "ALLE"
      ? {}
      : statusFilter === "PAID"
        ? { status: "PAID" }
        : { status: { in: ["OPEN", "PARTIAL"] } };

  const [charges, openPayments] = await Promise.all([
    prisma.rentCharge.findMany({
      where: statusWhere,
      include: {
        allocations: {
          include: {
            bankTransaction: {
              select: { id: true, bookingDate: true, amountCents: true, counterpartyName: true },
            },
          },
        },
        tenancy: {
          include: {
            tenant: true,
            bed: { include: { room: { include: { property: true } } } },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }],
      take: 300,
    }),
    // Zahlungseingänge, die noch keiner Miete zugeordnet sind
    prisma.bankTransaction.findMany({
      where: { direction: "CREDIT", reviewStatus: "OPEN" },
      orderBy: { bookingDate: "desc" },
      take: 60,
      include: { allocations: { select: { amountCents: true } } },
    }),
  ]);

  const today = new Date();
  const openTotal = charges
    .filter((charge) => charge.status === "OPEN" || charge.status === "PARTIAL")
    .reduce(
      (sum, charge) =>
        sum + charge.amountCents - charge.allocations.reduce((s, a) => s + a.amountCents, 0),
      0,
    );
  const overdue = charges.filter(
    (charge) => (charge.status === "OPEN" || charge.status === "PARTIAL") && charge.dueDate < today,
  );

  const unallocatedPayments = openPayments
    .map((tx) => ({
      ...tx,
      free: Math.abs(tx.amountCents) - tx.allocations.reduce((s, a) => s + a.amountCents, 0),
    }))
    .filter((tx) => tx.free > 0);

  return (
    <>
      <PageHeader
        title="Offene Posten"
        description="Monatliche Mietforderungen und ihre Zahlungseingänge."
        breadcrumb={[{ label: "Buchhaltung", href: "/buchhaltung" }, { label: "Offene Posten" }]}
        actions={
          <>
            <form action={generateCharges}>
              <input type="hidden" name="back" value={BACK} />
              <button type="submit" className="btn btn-secondary">
                Forderungen erzeugen
              </button>
            </form>
            <form action={runAutoMatch}>
              <input type="hidden" name="back" value={BACK} />
              <button type="submit" className="btn btn-primary">
                Zahlungen automatisch zuordnen
              </button>
            </form>
          </>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Offener Betrag"
          value={formatCents(openTotal)}
          tone={openTotal > 0 ? "warning" : "success"}
        />
        <StatCard label="Überfällig" value={String(overdue.length)} tone={overdue.length > 0 ? "danger" : "success"} />
        <StatCard label="Forderungen angezeigt" value={String(charges.length)} />
        <StatCard
          label="Nicht zugeordnete Eingänge"
          value={String(unallocatedPayments.length)}
          tone={unallocatedPayments.length > 0 ? "info" : "neutral"}
        />
      </div>

      <div className="mt-6">
        <Card padded={false}>
          <form className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
            <div className="w-56">
              <label htmlFor="status">Anzeigen</label>
              <select id="status" name="status" defaultValue={statusFilter}>
                <option value="OFFEN">Nur offene und Teilzahlungen</option>
                <option value="PAID">Nur bezahlte</option>
                <option value="ALLE">Alle</option>
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">
              Anzeigen
            </button>
          </form>

          {charges.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Keine Forderungen"
                description="Forderungen entstehen automatisch für jedes laufende Mietverhältnis. Über „Forderungen erzeugen“ können Sie fehlende Monate nachholen."
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Monat</Th>
                  <Th>Mieter</Th>
                  <Th>Unterkunft</Th>
                  <Th>Fällig</Th>
                  <Th align="right">Soll</Th>
                  <Th align="right">Offen</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => {
                  const paid = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
                  const open = charge.amountCents - paid;
                  const isOverdue = open > 0 && charge.dueDate < today && charge.status !== "WAIVED";

                  return (
                    <tr key={charge.id} className="align-top hover:bg-ink-50">
                      <Td className="whitespace-nowrap">
                        {formatMonth(charge.periodYear, charge.periodMonth)}
                      </Td>
                      <Td>
                        <Link
                          href={`/mieter/${charge.tenancy.tenantId}`}
                          className="font-medium hover:text-brand-700"
                        >
                          {charge.tenancy.tenant.firstName} {charge.tenancy.tenant.lastName}
                        </Link>
                        <p className="font-mono text-xs text-ink-500">{charge.tenancy.reference}</p>

                        {charge.allocations.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {charge.allocations.map((allocation) => (
                              <li key={allocation.id} className="flex items-center gap-2 text-xs text-ink-600">
                                <span>
                                  {formatDate(allocation.bankTransaction.bookingDate)} ·{" "}
                                  {formatCents(allocation.amountCents)}
                                </span>
                                <form action={removeAllocation}>
                                  <input type="hidden" name="id" value={allocation.id} />
                                  <input type="hidden" name="back" value={BACK} />
                                  <button
                                    type="submit"
                                    className="text-ink-400 hover:text-rose-600"
                                    title="Zuordnung aufheben"
                                  >
                                    ×
                                  </button>
                                </form>
                              </li>
                            ))}
                          </ul>
                        )}

                        {open > 0 && charge.status !== "WAIVED" && (
                          <div className="mt-1.5">
                            <Disclosure summary="Zahlung zuordnen">
                              {unallocatedPayments.length === 0 ? (
                                <p className="text-xs text-ink-500">
                                  Kein offener Zahlungseingang vorhanden.
                                </p>
                              ) : (
                                <form action={allocatePayment} className="space-y-2">
                                  <input type="hidden" name="rentChargeId" value={charge.id} />
                                  <input type="hidden" name="back" value={BACK} />
                                  <div>
                                    <label htmlFor={`tx-${charge.id}`}>Zahlungseingang</label>
                                    <select id={`tx-${charge.id}`} name="bankTransactionId" required>
                                      {unallocatedPayments.map((tx) => (
                                        <option key={tx.id} value={tx.id}>
                                          {formatDate(tx.bookingDate)} · {formatCents(tx.free)} ·{" "}
                                          {(tx.counterpartyName ?? "").slice(0, 30)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label htmlFor={`amt-${charge.id}`}>Betrag</label>
                                    <input
                                      id={`amt-${charge.id}`}
                                      name="amountCents"
                                      inputMode="decimal"
                                      defaultValue={centsToInput(open)}
                                    />
                                  </div>
                                  <button type="submit" className="btn btn-primary">
                                    Zuordnen
                                  </button>
                                </form>
                              )}

                              <form action={waiveCharge} className="mt-3">
                                <input type="hidden" name="id" value={charge.id} />
                                <input type="hidden" name="back" value={BACK} />
                                <ConfirmButton
                                  className="btn btn-ghost"
                                  message="Forderung als erlassen markieren?"
                                >
                                  Forderung erlassen
                                </ConfirmButton>
                              </form>
                            </Disclosure>
                          </div>
                        )}
                      </Td>
                      <Td className="text-ink-600">
                        {charge.tenancy.bed.room.property.name}
                        <p className="text-xs text-ink-500">
                          {charge.tenancy.bed.room.name} · {charge.tenancy.bed.label}
                        </p>
                      </Td>
                      <Td className={`whitespace-nowrap ${isOverdue ? "font-semibold text-rose-600" : "text-ink-600"}`}>
                        {formatDate(charge.dueDate)}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {formatCents(charge.amountCents)}
                      </Td>
                      <Td
                        align="right"
                        className={`font-semibold tabular-nums ${open > 0 ? "text-rose-600" : "text-emerald-600"}`}
                      >
                        {formatCents(Math.max(0, open))}
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

      {unallocatedPayments.length > 0 && (
        <div className="mt-6">
          <Card
            title="Nicht zugeordnete Zahlungseingänge"
            description="Diese Eingänge konnten keiner Mietforderung zugeordnet werden."
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Datum</Th>
                  <Th>Zahler</Th>
                  <Th>Verwendungszweck</Th>
                  <Th align="right">Offen</Th>
                </tr>
              </thead>
              <tbody>
                {unallocatedPayments.map((tx) => (
                  <tr key={tx.id}>
                    <Td className="whitespace-nowrap text-ink-600">{formatDate(tx.bookingDate)}</Td>
                    <Td>{tx.counterpartyName ?? "–"}</Td>
                    <Td className="max-w-md text-xs text-ink-500">{tx.purpose ?? ""}</Td>
                    <Td align="right" className="font-semibold tabular-nums text-emerald-600">
                      {formatCents(tx.free)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
