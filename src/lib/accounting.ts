import "server-only";

import { prisma } from "./db";
import { monthsBetween } from "./dates";
import { anteilNotiz, monatsanteil } from "./mietanteil";
import { mieterPasst, zuordnungPlanen, type ZuordnungsForderung } from "./zuordnung";

/**
 * Bezahlt, ohne dass eine Zahlung verknuepft ist: von Hand abgehakt ("Als
 * bezahlt markieren") oder aus dem Excel-Import als bezahlt uebernommen.
 * Solche Monate bleiben bezahlt; trifft die passende Zahlung ein, wird sie
 * mit ihnen belegt.
 */
export function istManuellBestaetigt(notes: string | null | undefined): boolean {
  return Boolean(notes?.includes("Manuell bestätigt") || notes?.includes("(Import)"));
}

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
      depositCents: true,
      billingDay: true,
      charges: { select: { periodYear: true, periodMonth: true, kind: true } },
    },
  });

  const rows: Array<{
    tenancyId: string;
    periodYear: number;
    periodMonth: number;
    dueDate: Date;
    amountCents: number;
    kind: string;
    notes: string | null;
  }> = [];

  for (const tenancy of tenancies) {
    const from = new Date(
      Date.UTC(tenancy.startDate.getUTCFullYear(), tenancy.startDate.getUTCMonth(), 1),
    );
    const rawEnd = tenancy.endDate ?? horizon;
    const to = rawEnd.getTime() < horizon.getTime() ? rawEnd : horizon;
    if (to.getTime() < from.getTime()) continue;

    const existing = new Set(
      tenancy.charges.map((c) => `${c.kind}:${c.periodYear}-${c.periodMonth}`),
    );

    // Kaution: einmalig, faellig zum Einzug.
    const startYear = tenancy.startDate.getUTCFullYear();
    const startMonth = tenancy.startDate.getUTCMonth() + 1;
    if (
      tenancy.depositCents > 0 &&
      !tenancy.charges.some((c) => c.kind === "DEPOSIT")
    ) {
      rows.push({
        tenancyId: tenancy.id,
        periodYear: startYear,
        periodMonth: startMonth,
        dueDate: tenancy.startDate,
        amountCents: tenancy.depositCents,
        kind: "DEPOSIT",
        notes: "Kaution zum Einzug",
      });
    }

    for (const period of monthsBetween(from, to)) {
      if (existing.has(`RENT:${period.year}-${period.month}`)) continue;

      const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
      const day = Math.min(Math.max(tenancy.billingDay, 1), daysInMonth);
      const anteil = monatsanteil(tenancy, period.year, period.month);

      rows.push({
        tenancyId: tenancy.id,
        periodYear: period.year,
        periodMonth: period.month,
        dueDate: new Date(Date.UTC(period.year, period.month - 1, day)),
        amountCents: anteil.amountCents,
        kind: "RENT",
        notes: anteilNotiz(anteil),
      });
    }
  }

  if (rows.length === 0) return 0;
  const result = await prisma.rentCharge.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export type ForderungsAbgleich = {
  /** Der letzte Monat wurde auf den Auszugstag gekuerzt. */
  gekuerzt: { year: number; month: number; vorher: number; nachher: number; tage: number } | null;
  /** Offene Forderungen ausserhalb des Mietzeitraums, die entfernt wurden. */
  entfernt: number;
  /** Schon bezahlt, aber nach dem Auszug nicht mehr geschuldet - als Guthaben frei geworden. */
  bezahltZuViel: number;
  /** Sonstige offene Monate, deren Betrag neu gerechnet wurde (z. B. nach geaendertem Einzug). */
  neuBerechnet: number;
};

/**
 * Bringt die offenen Forderungen mit dem Mietzeitraum in Einklang -
 * nach einem Auszug, aber auch nach einem geaenderten Einzugsdatum oder
 * einer anderen Miete. Was noch nicht bezahlt und keinem Kontoeingang
 * zugeordnet ist, wird neu gerechnet: Monate ausserhalb des Zeitraums
 * verschwinden, angebrochene Monate bekommen ihren Tagesanteil, volle
 * Monate die volle Miete. Die Kaution wandert mit auf den Einzugstag.
 * Bezahltes bleibt - Geld, das geflossen ist, wird nicht per Formular
 * umgebucht; das steht dann als Hinweis in der Rueckmeldung.
 */
export async function forderungenAbgleichen(tenancyId: string): Promise<ForderungsAbgleich> {
  const ergebnis: ForderungsAbgleich = { gekuerzt: null, entfernt: 0, bezahltZuViel: 0, neuBerechnet: 0 };
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      charges: {
        include: { allocations: { select: { id: true, amountCents: true, bankTransactionId: true }, orderBy: { createdAt: "desc" } } },
      },
    },
  });
  if (!tenancy) return ergebnis;

  const start = tenancy.startDate;
  const startIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const end = tenancy.endDate;
  const endIndex = end ? end.getUTCFullYear() * 12 + end.getUTCMonth() : Number.POSITIVE_INFINITY;

  for (const charge of tenancy.charges) {
    const unberuehrt =
      (charge.status === "OPEN" || charge.status === "PARTIAL") && charge.allocations.length === 0;
    const index = charge.periodYear * 12 + (charge.periodMonth - 1);

    if (charge.kind === "DEPOSIT") {
      // Die Kaution gehoert zum Einzug - auch wenn der spaeter verschoben wurde.
      if (!unberuehrt || tenancy.depositCents <= 0) continue;
      const passt =
        index === startIndex &&
        charge.dueDate.getTime() === start.getTime() &&
        charge.amountCents === tenancy.depositCents;
      if (passt) continue;
      await prisma.rentCharge.update({
        where: { id: charge.id },
        data: {
          periodYear: start.getUTCFullYear(),
          periodMonth: start.getUTCMonth() + 1,
          dueDate: start,
          amountCents: tenancy.depositCents,
        },
      });
      continue;
    }
    if (charge.kind !== "RENT") continue;

    if (index < startIndex || index > endIndex) {
      if (unberuehrt) {
        await prisma.rentCharge.delete({ where: { id: charge.id } });
        ergebnis.entfernt += 1;
      } else if (index > endIndex && charge.status !== "WAIVED") {
        // Monat nach dem Auszug, schon bezahlt: Forderung entfaellt, das
        // Geld wird wieder frei und steht als Guthaben beim Mieter.
        const frei = charge.allocations.reduce((s, a) => s + a.amountCents, 0);
        await prisma.allocation.deleteMany({ where: { rentChargeId: charge.id } });
        await prisma.rentCharge.delete({ where: { id: charge.id } });
        await zahlungenFreigeben(charge.allocations.map((a) => a.bankTransactionId));
        ergebnis.entfernt += 1;
        ergebnis.bezahltZuViel += frei;
      }
      continue;
    }

    const anteil = monatsanteil(tenancy, charge.periodYear, charge.periodMonth);
    if (anteil.amountCents === charge.amountCents) continue;

    if (!unberuehrt) {
      if (charge.status === "WAIVED") continue;
      // Schon bezahlt (per Konto oder abgehakt). Nur der Auszugsmonat wird
      // nachtraeglich gekuerzt - was darueber hinaus zugeordnet war, wird
      // frei und ist Guthaben. Andere Monate bleiben, wie sie bezahlt sind.
      if (index !== endIndex || anteil.amountCents > charge.amountCents) continue;
      let zuViel = charge.allocations.reduce((s, a) => s + a.amountCents, 0) - anteil.amountCents;
      const betroffen: string[] = [];
      for (const a of charge.allocations) {
        if (zuViel <= 0) break;
        const weg = Math.min(zuViel, a.amountCents);
        if (weg === a.amountCents) await prisma.allocation.delete({ where: { id: a.id } });
        else await prisma.allocation.update({ where: { id: a.id }, data: { amountCents: a.amountCents - weg } });
        betroffen.push(a.bankTransactionId);
        zuViel -= weg;
        ergebnis.bezahltZuViel += weg;
      }
      await prisma.rentCharge.update({
        where: { id: charge.id },
        data: { amountCents: anteil.amountCents, notes: [charge.notes, anteilNotiz(anteil)].filter(Boolean).join(" · ") },
      });
      await zahlungenFreigeben(betroffen);
      ergebnis.gekuerzt = {
        year: charge.periodYear,
        month: charge.periodMonth,
        vorher: charge.amountCents,
        nachher: anteil.amountCents,
        tage: anteil.billedDays,
      };
      continue;
    }
    await prisma.rentCharge.update({
      where: { id: charge.id },
      data: { amountCents: anteil.amountCents, notes: anteilNotiz(anteil) },
    });
    if (index === endIndex && anteil.amountCents < charge.amountCents) {
      ergebnis.gekuerzt = {
        year: charge.periodYear,
        month: charge.periodMonth,
        vorher: charge.amountCents,
        nachher: anteil.amountCents,
        tage: anteil.billedDays,
      };
    } else {
      ergebnis.neuBerechnet += 1;
    }
  }
  return ergebnis;
}

/** Buchungen ohne verbleibende Zuordnung wieder als offen fuehren - ihr Geld ist dann Guthaben. */
async function zahlungenFreigeben(bankTransactionIds: string[]): Promise<void> {
  for (const id of new Set(bankTransactionIds)) {
    const rest = await prisma.allocation.count({ where: { bankTransactionId: id } });
    if (rest === 0) {
      await prisma.bankTransaction.updateMany({ where: { id, reviewStatus: "MATCHED" }, data: { reviewStatus: "OPEN" } });
    }
  }
}

/** Setzt den Status einer Forderung aus der Summe ihrer Zuordnungen neu. */
export async function recomputeChargeStatus(rentChargeId: string): Promise<void> {
  const charge = await prisma.rentCharge.findUnique({
    where: { id: rentChargeId },
    include: { allocations: true },
  });
  if (!charge || charge.status === "WAIVED") return;
  // Von Hand als bezahlt abgehakt: bleibt bezahlt, auch wenn die
  // verknuepfte Zahlung kleiner ist oder wieder geloest wird. Zuruecknehmen
  // geht nur ueber "Wieder öffnen".
  if (charge.status === "PAID" && istManuellBestaetigt(charge.notes)) return;

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
      quelle: "HAND",
    },
    update: { amountCents: { increment: amount }, quelle: "HAND" },
  });

  await recomputeChargeStatus(params.rentChargeId);
  const mieter = await prisma.tenancy.findUnique({ where: { id: charge.tenancyId }, select: { tenantId: true } });
  await prisma.bankTransaction.update({
    where: { id: params.bankTransactionId },
    data: { reviewStatus: "MATCHED", category: tx.category ?? "Miete Einnahme", tenantId: tx.tenantId ?? mieter?.tenantId ?? null },
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
 * Erst den Mieter finden (Vertragsreferenz im Verwendungszweck, sonst der
 * Name), dann mit `zuordnungPlanen` entscheiden, welche seiner Forderungen
 * die Zahlung tilgt: genannte Monate und Kaution zuerst, sonst Faelliges,
 * von Hand abgehakte Monate um den Zahlungstag, und nur knapp im Voraus.
 *
 * Sicherheitsnetz: Passen mehrere Mieter, wird nur bei eindeutigem Betrag
 * zugeordnet. Sonst bleibt die Buchung offen und wird in der Oberflaeche
 * von Hand entschieden.
 */
export async function autoMatch(options: { bankAccountId?: string } = {}): Promise<MatchResult> {
  await ensureRentCharges();

  // Auch schon zugeordnete Eingaenge mit Restbetrag: Was zu viel kam,
  // wird so mit dem naechsten faelligen Monat verrechnet.
  const transactions = (
    await prisma.bankTransaction.findMany({
      where: {
        direction: "CREDIT",
        reviewStatus: { in: ["OPEN", "MATCHED"] },
        ...(options.bankAccountId ? { bankAccountId: options.bankAccountId } : {}),
      },
      include: { allocations: true },
      orderBy: { bookingDate: "asc" },
    })
  ).filter((tx) => Math.abs(tx.amountCents) - tx.allocations.reduce((s, a) => s + a.amountCents, 0) > 0);

  if (transactions.length === 0) return { matched: 0, reviewed: 0 };

  const tenancies = await prisma.tenancy.findMany({
    where: { charges: { some: {} } },
    include: {
      tenant: { select: { id: true, firstName: true, lastName: true, company: true } },
      bed: { include: { room: { select: { propertyId: true } } } },
      charges: { include: { allocations: { select: { amountCents: true } } } },
    },
  });

  // Forderungen je Mieter, mit laufend mitgefuehrtem Zuordnungsstand.
  const forderungenJeMieter = new Map<string, ZuordnungsForderung[]>();
  const objektJeForderung = new Map<string, string>();
  for (const ty of tenancies) {
    const liste = forderungenJeMieter.get(ty.tenantId) ?? [];
    for (const c of ty.charges) {
      liste.push({
        id: c.id,
        kind: c.kind,
        jahr: c.periodYear,
        monat: c.periodMonth,
        dueDate: c.dueDate,
        amountCents: c.amountCents,
        zugeordnetCents: c.allocations.reduce((s, a) => s + a.amountCents, 0),
        status: c.status,
        manuell: istManuellBestaetigt(c.notes),
      });
      objektJeForderung.set(c.id, ty.bed.room.propertyId);
    }
    forderungenJeMieter.set(ty.tenantId, liste);
  }

  let matched = 0;

  for (const tx of transactions) {
    const free = Math.abs(tx.amountCents) - tx.allocations.reduce((s, a) => s + a.amountCents, 0);
    if (free <= 0) continue;

    const text = `${tx.purpose ?? ""} ${tx.counterpartyName ?? ""} ${tx.endToEndId ?? ""}`;
    const haystack = normalize(text);
    if (!haystack) continue;

    // 0. Zahler schon bekannt (frueherer Abgleich oder von Hand).
    let mieterIds = new Set<string>(tx.tenantId ? [tx.tenantId] : []);
    // 1. Vertragsreferenz im Verwendungszweck - eindeutig.
    if (mieterIds.size === 0) {
      mieterIds = new Set(
        tenancies.filter((ty) => haystack.includes(normalize(ty.reference))).map((ty) => ty.tenantId),
      );
    }
    // 2. Sonst der Name des Mieters bzw. seiner Firma.
    if (mieterIds.size === 0) {
      mieterIds = new Set(
        tenancies.filter((ty) => mieterPasst(text, ty.tenant)).map((ty) => ty.tenantId),
      );
    }
    if (mieterIds.size === 0) continue;

    const zahlung = { bookingDate: tx.bookingDate, freiCents: free, text };
    let mieterId: string | null = null;
    if (mieterIds.size === 1) {
      mieterId = [...mieterIds][0];
    } else {
      // Mehrere Mieter passen: nur bei genau einer offenen Forderung mit
      // exakt diesem Betrag.
      const exakt = [...mieterIds].filter((id) =>
        (forderungenJeMieter.get(id) ?? []).some(
          (f) => (f.status === "OPEN" || f.status === "PARTIAL") && f.amountCents - f.zugeordnetCents === free,
        ),
      );
      if (exakt.length !== 1) continue;
      mieterId = exakt[0];
    }

    // Zahler festhalten - auch wenn gerade nichts offen ist: dann ist es Guthaben.
    if (tx.tenantId !== mieterId) {
      await prisma.bankTransaction.update({ where: { id: tx.id }, data: { tenantId: mieterId } });
    }

    const forderungen = forderungenJeMieter.get(mieterId) ?? [];
    const plan = zuordnungPlanen(zahlung, forderungen);
    if (plan.length === 0) continue;

    for (const posten of plan) {
      await prisma.allocation.upsert({
        where: {
          rentChargeId_bankTransactionId: { rentChargeId: posten.forderungId, bankTransactionId: tx.id },
        },
        create: { rentChargeId: posten.forderungId, bankTransactionId: tx.id, amountCents: posten.cents },
        update: { amountCents: { increment: posten.cents } },
      });
      const f = forderungen.find((x) => x.id === posten.forderungId);
      if (f) f.zugeordnetCents += posten.cents;
      await recomputeChargeStatus(posten.forderungId);
      if (f) {
        const aktuell = await prisma.rentCharge.findUnique({ where: { id: f.id }, select: { status: true } });
        if (aktuell) f.status = aktuell.status;
      }
    }

    await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        reviewStatus: "MATCHED",
        category: tx.category ?? "Miete Einnahme",
        propertyId: tx.propertyId ?? objektJeForderung.get(plan[0].forderungId) ?? null,
      },
    });
    matched += 1;
  }

  return { matched, reviewed: transactions.length };
}

/**
 * Guthaben je Mieter: Eingaenge, die ihm zugeordnet sind, aber noch keine
 * Forderung tilgen - er hat mehr gezahlt als bisher faellig war.
 */
export async function guthabenJeMieter(tenantIds?: string[]): Promise<Map<string, number>> {
  const zahlungen = await prisma.bankTransaction.findMany({
    where: {
      direction: "CREDIT",
      reviewStatus: { in: ["OPEN", "MATCHED"] },
      tenantId: tenantIds ? { in: tenantIds } : { not: null },
    },
    select: { tenantId: true, amountCents: true, allocations: { select: { amountCents: true } } },
  });
  const ergebnis = new Map<string, number>();
  for (const z of zahlungen) {
    if (!z.tenantId) continue;
    const frei = Math.abs(z.amountCents) - z.allocations.reduce((s, a) => s + a.amountCents, 0);
    if (frei > 0) ergebnis.set(z.tenantId, (ergebnis.get(z.tenantId) ?? 0) + frei);
  }
  return ergebnis;
}

export type NeuberechnungsErgebnis = { geloest: number; zugeordnet: number; geprueft: number };

/**
 * Loest alle automatischen Zuordnungen und laesst den Abgleich sie mit den
 * aktuellen Regeln neu treffen. Von Hand zugeordnete Zahlungen und von Hand
 * abgehakte Monate bleiben unberuehrt.
 */
export async function zuordnungenNeuBerechnen(): Promise<NeuberechnungsErgebnis> {
  // Auszugsmonate zuerst auf den Tagesanteil bringen - auch schon
  // bezahlte; was zu viel war, wird dabei Guthaben.
  const beendet = await prisma.tenancy.findMany({ where: { endDate: { not: null } }, select: { id: true } });
  for (const ty of beendet) await forderungenAbgleichen(ty.id);

  const auto = await prisma.allocation.findMany({
    where: { quelle: "AUTO" },
    select: { rentChargeId: true, bankTransactionId: true },
  });
  const forderungen = [...new Set(auto.map((a) => a.rentChargeId))];
  const buchungen = [...new Set(auto.map((a) => a.bankTransactionId))];

  const geloest = await prisma.allocation.deleteMany({ where: { quelle: "AUTO" } });

  for (const id of forderungen) await recomputeChargeStatus(id);
  // Buchungen ohne verbleibende Zuordnung wieder als offen fuehren.
  const nochZugeordnet = new Set(
    (await prisma.allocation.findMany({ where: { bankTransactionId: { in: buchungen } }, select: { bankTransactionId: true } })).map(
      (a) => a.bankTransactionId,
    ),
  );
  const wiederOffen = buchungen.filter((id) => !nochZugeordnet.has(id));
  if (wiederOffen.length > 0) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: wiederOffen }, reviewStatus: "MATCHED" },
      data: { reviewStatus: "OPEN" },
    });
  }

  const ergebnis = await autoMatch();
  return { geloest: geloest.count, zugeordnet: ergebnis.matched, geprueft: ergebnis.reviewed };
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
