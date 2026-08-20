import "server-only";

import { prisma } from "./db";
import { monthsBetween } from "./dates";

/**
 * Offene Posten und Zahlungszuordnung.
 *
 * Ablauf: fuer jedes laufende Mietverhaeltnis entsteht pro Monat eine
 * Forderung (RentCharge). Ein Kontoauszug bringt Zahlungseingaenge mit; diese
 * werden – automatisch oder manuell – ueber Allocations auf Forderungen
 * verteilt. Der Status einer Forderung ergibt sich immer aus der Summe ihrer
 * Zuordnungen, nie aus einem separat gepflegten Feld.
 */

/** Erzeugt fehlende Mietforderungen bis einschliesslich des aktuellen Monats. */
export async function ensureRentCharges(options: { tenancyId?: string; until?: Date } = {}): Promise<number> {
  const until = options.until ?? new Date();
  const horizon = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), 1));

  const tenancies = await prisma.tenancy.findMany({
    where: {
      status: { in: ["SENT", "ACTIVE", "ENDED"] },
      ...(options.tenancyId ? { id: options.tenancyId } : {}),
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      monthlyRentCents: true,
      billingDay: true,
      charges: { select: { periodYear: true, periodMonth: true } },
    },
  });

  const rows: Array<{
    tenancyId: string;
    periodYear: number;
    periodMonth: number;
    dueDate: Date;
    amountCents: number;
  }> = [];

  for (const tenancy of tenancies) {
    const from = new Date(
      Date.UTC(tenancy.startDate.getUTCFullYear(), tenancy.startDate.getUTCMonth(), 1),
    );
    const rawEnd = tenancy.endDate ?? horizon;
    const to = rawEnd.getTime() < horizon.getTime() ? rawEnd : horizon;
    if (to.getTime() < from.getTime()) continue;

    const existing = new Set(tenancy.charges.map((c) => `${c.periodYear}-${c.periodMonth}`));

    for (const period of monthsBetween(from, to)) {
      if (existing.has(`${period.year}-${period.month}`)) continue;

      // Faelligkeitstag auf die Monatslaenge begrenzen (z.B. 31. im Februar)
      const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
      const day = Math.min(Math.max(tenancy.billingDay, 1), daysInMonth);

      rows.push({
        tenancyId: tenancy.id,
        periodYear: period.year,
        periodMonth: period.month,
        dueDate: new Date(Date.UTC(period.year, period.month - 1, day)),
        amountCents: tenancy.monthlyRentCents,
      });
    }
  }

  if (rows.length === 0) return 0;
  const result = await prisma.rentCharge.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

/** Setzt den Status einer Forderung aus der Summe ihrer Zuordnungen neu. */
export async function recomputeChargeStatus(rentChargeId: string): Promise<void> {
  const charge = await prisma.rentCharge.findUnique({
    where: { id: rentChargeId },
    include: { allocations: true },
  });
  if (!charge || charge.status === "WAIVED") return;

  const paid = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
  const status = paid <= 0 ? "OPEN" : paid + 100 >= charge.amountCents ? "PAID" : "PARTIAL";

  if (status !== charge.status) {
    await prisma.rentCharge.update({ where: { id: rentChargeId }, data: { status } });
  }
}

export async function paidCentsFor(rentChargeId: string): Promise<number> {
  const result = await prisma.allocation.aggregate({
    where: { rentChargeId },
    _sum: { amountCents: true },
  });
  return result._sum.amountCents ?? 0;
}

/** Noch nicht verteilter Betrag einer Buchung. */
export async function unallocatedCents(bankTransactionId: string): Promise<number> {
  const tx = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { allocations: true },
  });
  if (!tx) return 0;
  const used = tx.allocations.reduce((sum, a) => sum + a.amountCents, 0);
  return Math.max(0, Math.abs(tx.amountCents) - used);
}

/** Ordnet einen Zahlungseingang (teilweise) einer Forderung zu. */
export async function allocate(params: {
  bankTransactionId: string;
  rentChargeId: string;
  amountCents?: number;
}): Promise<{ ok: boolean; message: string }> {
  const [tx, charge] = await Promise.all([
    prisma.bankTransaction.findUnique({
      where: { id: params.bankTransactionId },
      include: { allocations: true },
    }),
    prisma.rentCharge.findUnique({
      where: { id: params.rentChargeId },
      include: { allocations: true },
    }),
  ]);

  if (!tx) return { ok: false, message: "Buchung nicht gefunden." };
  if (!charge) return { ok: false, message: "Mietforderung nicht gefunden." };
  if (tx.direction !== "CREDIT") {
    return { ok: false, message: "Nur Zahlungseingänge lassen sich Mietforderungen zuordnen." };
  }

  const txFree = Math.abs(tx.amountCents) - tx.allocations.reduce((s, a) => s + a.amountCents, 0);
  const chargeOpen = charge.amountCents - charge.allocations.reduce((s, a) => s + a.amountCents, 0);
  if (txFree <= 0) return { ok: false, message: "Die Buchung ist bereits vollständig zugeordnet." };
  if (chargeOpen <= 0) return { ok: false, message: "Die Mietforderung ist bereits ausgeglichen." };

  const amount = Math.min(params.amountCents ?? Math.min(txFree, chargeOpen), txFree, chargeOpen);
  if (amount <= 0) return { ok: false, message: "Der Betrag muss größer als 0 sein." };

  await prisma.allocation.upsert({
    where: {
      rentChargeId_bankTransactionId: {
        rentChargeId: params.rentChargeId,
        bankTransactionId: params.bankTransactionId,
      },
    },
    create: {
      rentChargeId: params.rentChargeId,
      bankTransactionId: params.bankTransactionId,
      amountCents: amount,
    },
    update: { amountCents: { increment: amount } },
  });

  await recomputeChargeStatus(params.rentChargeId);
  await prisma.bankTransaction.update({
    where: { id: params.bankTransactionId },
    data: { reviewStatus: "MATCHED", category: tx.category ?? "Miete Einnahme" },
  });

  return { ok: true, message: "Zahlung wurde zugeordnet." };
}

export async function deallocate(allocationId: string): Promise<void> {
  const allocation = await prisma.allocation.findUnique({ where: { id: allocationId } });
  if (!allocation) return;

  await prisma.allocation.delete({ where: { id: allocationId } });
  await recomputeChargeStatus(allocation.rentChargeId);

  const remaining = await prisma.allocation.count({
    where: { bankTransactionId: allocation.bankTransactionId },
  });
  if (remaining === 0) {
    await prisma.bankTransaction.update({
      where: { id: allocation.bankTransactionId },
      data: { reviewStatus: "OPEN" },
    });
  }
}

// --- Automatischer Abgleich -----------------------------------------------

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type MatchResult = {
  matched: number;
  reviewed: number;
};

/**
 * Ordnet offene Zahlungseingaenge automatisch zu.
 *
 * Sicherheitsnetz: zugeordnet wird nur bei einem eindeutigen Treffer. Findet
 * der Abgleich mehrere plausible Forderungen, bleibt die Buchung offen und
 * wird in der Oberflaeche manuell entschieden.
 */
export async function autoMatch(options: { bankAccountId?: string } = {}): Promise<MatchResult> {
  await ensureRentCharges();

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      direction: "CREDIT",
      reviewStatus: "OPEN",
      ...(options.bankAccountId ? { bankAccountId: options.bankAccountId } : {}),
    },
    include: { allocations: true },
    orderBy: { bookingDate: "asc" },
  });

  if (transactions.length === 0) return { matched: 0, reviewed: 0 };

  const openCharges = await prisma.rentCharge.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    include: {
      allocations: true,
      tenancy: {
        include: {
          tenant: { select: { firstName: true, lastName: true, company: true } },
          bed: { include: { room: { include: { property: true } } } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }],
  });

  let matched = 0;

  for (const tx of transactions) {
    const free = Math.abs(tx.amountCents) - tx.allocations.reduce((s, a) => s + a.amountCents, 0);
    if (free <= 0) continue;

    const haystack = normalize(`${tx.purpose ?? ""} ${tx.counterpartyName ?? ""} ${tx.endToEndId ?? ""}`);
    if (!haystack) continue;

    // 1. Treffer ueber die Vertragsreferenz im Verwendungszweck – eindeutig.
    let candidates = openCharges.filter(
      (charge) =>
        chargeOpenCents(charge) > 0 && haystack.includes(normalize(charge.tenancy.reference)),
    );

    // 2. Sonst ueber den Namen des Mieters bzw. seiner Firma.
    if (candidates.length === 0) {
      candidates = openCharges.filter((charge) => {
        if (chargeOpenCents(charge) <= 0) return false;
        const tenant = charge.tenancy.tenant;
        const last = normalize(tenant.lastName);
        const first = normalize(tenant.firstName);
        const company = normalize(tenant.company);
        const nameHit = last.length >= 3 && haystack.includes(last) && (!first || haystack.includes(first));
        const companyHit = company.length >= 4 && haystack.includes(company);
        return nameHit || companyHit;
      });
    }

    if (candidates.length === 0) continue;

    // Bei mehreren offenen Monaten desselben Mietverhaeltnisses ist die
    // Zuordnung eindeutig genug: der aelteste offene Monat wird zuerst getilgt.
    const tenancyIds = new Set(candidates.map((c) => c.tenancyId));
    if (tenancyIds.size > 1) {
      // Mehrdeutig -> nur bei exakter Betragsuebereinstimmung entscheiden
      const exact = candidates.filter((c) => chargeOpenCents(c) === free);
      if (exact.length !== 1) continue;
      candidates = exact;
    }

    let remaining = free;
    for (const charge of candidates.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())) {
      if (remaining <= 0) break;
      const open = chargeOpenCents(charge);
      if (open <= 0) continue;

      const amount = Math.min(open, remaining);
      await prisma.allocation.upsert({
        where: {
          rentChargeId_bankTransactionId: {
            rentChargeId: charge.id,
            bankTransactionId: tx.id,
          },
        },
        create: { rentChargeId: charge.id, bankTransactionId: tx.id, amountCents: amount },
        update: { amountCents: { increment: amount } },
      });
      charge.allocations.push({
        id: "pending",
        rentChargeId: charge.id,
        bankTransactionId: tx.id,
        amountCents: amount,
        createdAt: new Date(),
      });
      remaining -= amount;
      await recomputeChargeStatus(charge.id);
    }

    if (remaining < free) {
      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          reviewStatus: "MATCHED",
          category: tx.category ?? "Miete Einnahme",
          propertyId:
            tx.propertyId ?? candidates[0]?.tenancy.bed.room.property.id ?? null,
        },
      });
      matched += 1;
    }
  }

  return { matched, reviewed: transactions.length };
}

function chargeOpenCents(charge: {
  amountCents: number;
  allocations: Array<{ amountCents: number }>;
}): number {
  return charge.amountCents - charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
}

// --- Auswertungen ----------------------------------------------------------

export type PeriodSummary = {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  openChargesCents: number;
  openChargesCount: number;
  overdueCount: number;
  unreviewedCount: number;
  missingReceiptsCount: number;
};

export async function periodSummary(from: Date, to: Date): Promise<PeriodSummary> {
  const transactions = await prisma.bankTransaction.findMany({
    where: { bookingDate: { gte: from, lte: to }, reviewStatus: { not: "IGNORED" } },
    select: { amountCents: true, direction: true, id: true },
  });

  const incomeCents = transactions
    .filter((t) => t.direction === "CREDIT")
    .reduce((sum, t) => sum + t.amountCents, 0);
  const expenseCents = transactions
    .filter((t) => t.direction === "DEBIT")
    .reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

  const openCharges = await prisma.rentCharge.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    include: { allocations: { select: { amountCents: true } } },
  });

  const openChargesCents = openCharges.reduce((sum, c) => sum + chargeOpenCents(c), 0);
  const today = new Date();
  const overdueCount = openCharges.filter((c) => c.dueDate < today).length;

  const [unreviewedCount, missingReceiptsCount] = await Promise.all([
    prisma.bankTransaction.count({ where: { reviewStatus: "OPEN" } }),
    prisma.bankTransaction.count({
      where: {
        direction: "DEBIT",
        reviewStatus: { notIn: ["IGNORED"] },
        documents: { none: {} },
      },
    }),
  ]);

  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    openChargesCents,
    openChargesCount: openCharges.length,
    overdueCount,
    unreviewedCount,
    missingReceiptsCount,
  };
}

/** Monatsreihe fuer die Diagramme auf dem Dashboard. */
export async function monthlyCashflow(months = 12): Promise<
  Array<{ year: number; month: number; incomeCents: number; expenseCents: number }>
> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const transactions = await prisma.bankTransaction.findMany({
    where: { bookingDate: { gte: start }, reviewStatus: { not: "IGNORED" } },
    select: { bookingDate: true, amountCents: true, direction: true },
  });

  const buckets = new Map<string, { year: number; month: number; incomeCents: number; expenseCents: number }>();
  for (let i = 0; i < months; i += 1) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    buckets.set(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      incomeCents: 0,
      expenseCents: 0,
    });
  }

  for (const tx of transactions) {
    const key = `${tx.bookingDate.getUTCFullYear()}-${tx.bookingDate.getUTCMonth() + 1}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (tx.direction === "CREDIT") bucket.incomeCents += tx.amountCents;
    else bucket.expenseCents += Math.abs(tx.amountCents);
  }

  return Array.from(buckets.values());
}
