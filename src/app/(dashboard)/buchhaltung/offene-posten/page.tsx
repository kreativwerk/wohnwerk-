import Link from "next/link";

import {
  allocatePayment,
  generateCharges,
  markChargePaid,
  removeAllocation,
  reopenCharge,
  runAutoMatch,
  waiveCharge,
} from "@/app/actions/accounting";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { ChargeBadge } from "@/components/status";
import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { centsToInput } from "@/lib/money";

import { AdminOnly } from "@/components/admin-only";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Offene Posten") };
}
export const dynamic = "force-dynamic";

const BACK = "/buchhaltung/offene-posten";

export default async function OpenItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; status?: string }>;
}) {
  const { t, datum, monat, geld } = await oberflaeche();
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
        title={t("Offene Posten")}
        description={t("Monatliche Mietforderungen und ihre Zahlungseingänge.")}
        breadcrumb={[{ label: t("Buchhaltung"), href: "/buchhaltung" }, { label: t("Offene Posten") }]}
        actions={
          <>
            <AdminOnly>
              <form action={generateCharges}>
                <input type="hidden" name="back" value={BACK} />
                <button type="submit" className="btn btn-secondary">
                  {t("Forderungen erzeugen")}
                </button>
              </form>
            </AdminOnly>
            <AdminOnly>
              <form action={runAutoMatch}>
                <input type="hidden" name="back" value={BACK} />
                <button type="submit" className="btn btn-primary">
                  {t("Zahlungen automatisch zuordnen")}
                </button>
              </form>
            </AdminOnly>
          </>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("Offener Betrag")}
          value={geld(openTotal)}
          tone={openTotal > 0 ? "warning" : "success"}
        />
        <StatCard label={t("Überfällig")} value={String(overdue.length)} tone={overdue.length > 0 ? "danger" : "success"} />
        <StatCard label={t("Forderungen angezeigt")} value={String(charges.length)} />
        <StatCard
          label={t("Nicht zugeordnete Eingänge")}
          value={String(unallocatedPayments.length)}
          tone={unallocatedPayments.length > 0 ? "info" : "neutral"}
        />
      </div>

      <div className="mt-6">
        <Card padded={false}>
          <AdminOnly>
            <form className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
              <div className="w-56">
                <label htmlFor="status">{t("Anzeigen")}</label>
                <select id="status" name="status" defaultValue={statusFilter}>
                  <option value="OFFEN">{t("Nur offene und Teilzahlungen")}</option>
                  <option value="PAID">{t("Nur bezahlte")}</option>
                  <option value="ALLE">{t("Alle")}</option>
                </select>
              </div>
              <button type="submit" className="btn btn-secondary">
                {t("Anzeigen")}
              </button>
            </form>
          </AdminOnly>

          {charges.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={t("Keine Forderungen")}
                description={t("Forderungen entstehen automatisch für jedes laufende Mietverhältnis. Über „Forderungen erzeugen“ können Sie fehlende Monate nachholen.")}
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("Monat")}</Th>
                  <Th>{t("Mieter")}</Th>
                  <Th>{t("Unterkunft")}</Th>
                  <Th>{t("Fällig")}</Th>
                  <Th align="right">{t("Soll")}</Th>
                  <Th align="right">{t("Offen")}</Th>
                  <Th align="right">{t("Status")}</Th>
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
                        {monat(charge.periodYear, charge.periodMonth)}
                        {charge.kind === "DEPOSIT" && (
                          <span className="ml-2">
                            <Badge tone="brand">{t("Kaution")}</Badge>
                          </span>
                        )}
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
                                  {datum(allocation.bankTransaction.bookingDate)} ·{" "}
                                  {geld(allocation.amountCents)}
                                </span>
                                <AdminOnly>
                                  <form action={removeAllocation}>
                                    <input type="hidden" name="id" value={allocation.id} />
                                    <input type="hidden" name="back" value={BACK} />
                                    <button
                                      type="submit"
                                      className="text-ink-500 hover:text-rose-600"
                                      title={t("Zuordnung aufheben")}
                                    >
                                      ×
                                    </button>
                                  </form>
                                </AdminOnly>
                              </li>
                            ))}
                          </ul>
                        )}

                        {open > 0 && charge.status !== "WAIVED" && (
                          <div className="mt-1.5">
                            <Disclosure summary={t("Zahlung zuordnen")}>
                              {unallocatedPayments.length === 0 ? (
                                <p className="text-xs text-ink-500">
                                  {t("Kein offener Zahlungseingang vorhanden.")}
                                </p>
                              ) : (
                                <AdminOnly>
                                  <form action={allocatePayment} className="space-y-2">
                                    <input type="hidden" name="rentChargeId" value={charge.id} />
                                    <input type="hidden" name="back" value={BACK} />
                                    <div>
                                      <label htmlFor={`tx-${charge.id}`}>{t("Zahlungseingang")}</label>
                                      <select id={`tx-${charge.id}`} name="bankTransactionId" required>
                                        {unallocatedPayments.map((tx) => (
                                          <option key={tx.id} value={tx.id}>
                                            {datum(tx.bookingDate)} · {geld(tx.free)} ·{" "}
                                            {(tx.counterpartyName ?? "").slice(0, 30)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label htmlFor={`amt-${charge.id}`}>{t("Betrag")}</label>
                                      <input
                                        id={`amt-${charge.id}`}
                                        name="amountCents"
                                        inputMode="decimal"
                                        defaultValue={centsToInput(open)}
                                      />
                                    </div>
                                    <button type="submit" className="btn btn-primary">
                                      {t("Zuordnen")}
                                    </button>
                                  </form>
                                </AdminOnly>
                              )}

                              <AdminOnly>
                                <form action={waiveCharge} className="mt-3">
                                  <input type="hidden" name="id" value={charge.id} />
                                  <input type="hidden" name="back" value={BACK} />
                                  <ConfirmButton
                                    className="btn btn-ghost"
                                    message={t("Forderung als erlassen markieren?")}
                                  >
                                    {t("Forderung erlassen")}
                                  </ConfirmButton>
                                </form>
                              </AdminOnly>
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
                        {datum(charge.dueDate)}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {geld(charge.amountCents)}
                      </Td>
                      <Td
                        align="right"
                        className={`font-semibold tabular-nums ${open > 0 ? "text-rose-600" : "text-emerald-600"}`}
                      >
                        {geld(Math.max(0, open))}
                      </Td>
                      <Td align="right">
                        <ChargeBadge status={charge.status} />
                        <AdminOnly>
                          {charge.status !== "PAID" && charge.status !== "WAIVED" && (
                            <form action={markChargePaid} className="mt-1.5">
                              <input type="hidden" name="id" value={charge.id} />
                              <input type="hidden" name="back" value={BACK} />
                              <button
                                type="submit"
                                className="btn btn-secondary btn-sm"
                                title={t("Eingang im Online-Banking gesehen – als bezahlt vermerken")}
                              >
                                {t("✓ Bezahlt")}
                              </button>
                            </form>
                          )}
                          {charge.status === "PAID" && charge.allocations.length === 0 && (
                            <form action={reopenCharge} className="mt-1.5">
                              <input type="hidden" name="id" value={charge.id} />
                              <input type="hidden" name="back" value={BACK} />
                              <button
                                type="submit"
                                className="btn btn-ghost btn-sm"
                                title={t("Handbestätigung zurücknehmen")}
                              >
                                {t("Rückgängig")}
                              </button>
                            </form>
                          )}
                        </AdminOnly>
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
            title={t("Nicht zugeordnete Zahlungseingänge")}
            description={t("Diese Eingänge konnten keiner Mietforderung zugeordnet werden.")}
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>{t("Datum")}</Th>
                  <Th>{t("Zahler")}</Th>
                  <Th>{t("Verwendungszweck")}</Th>
                  <Th align="right">{t("Offen")}</Th>
                </tr>
              </thead>
              <tbody>
                {unallocatedPayments.map((tx) => (
                  <tr key={tx.id}>
                    <Td className="whitespace-nowrap text-ink-600">{datum(tx.bookingDate)}</Td>
                    <Td>{tx.counterpartyName ?? "–"}</Td>
                    <Td className="max-w-md text-xs text-ink-500">{tx.purpose ?? ""}</Td>
                    <Td align="right" className="font-semibold tabular-nums text-emerald-600">
                      {geld(tx.free)}
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
