import "server-only";

import { prisma } from "./db";

/**
 * Belegung wird nicht am Bett gespeichert, sondern aus den Mietverhaeltnissen
 * abgeleitet. So kann es keinen Zustand geben, der dem Vertrag widerspricht.
 */

export const OCCUPYING_STATUSES = ["SENT", "ACTIVE"] as const;

/** Ueberschneidet sich [aStart, aEnd) mit [bStart, bEnd)? Offenes Ende = unbefristet. */
export function overlaps(
  aStart: Date,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date | null,
): boolean {
  const aEndTime = aEnd ? aEnd.getTime() : Number.POSITIVE_INFINITY;
  const bEndTime = bEnd ? bEnd.getTime() : Number.POSITIVE_INFINITY;
  return aStart.getTime() <= bEndTime && bStart.getTime() <= aEndTime;
}

/**
 * Prueft, ob ein Bett im gewuenschten Zeitraum belegt ist.
 * `excludeTenancyId` erlaubt das Bearbeiten eines bestehenden Mietverhaeltnisses.
 */
export async function findConflictingTenancy(params: {
  bedId: string;
  startDate: Date;
  endDate: Date | null;
  excludeTenancyId?: string;
}) {
  const candidates = await prisma.tenancy.findMany({
    where: {
      bedId: params.bedId,
      status: { in: [...OCCUPYING_STATUSES] },
      ...(params.excludeTenancyId ? { id: { not: params.excludeTenancyId } } : {}),
    },
    include: { tenant: true },
  });

  return (
    candidates.find((tenancy) =>
      overlaps(params.startDate, params.endDate, tenancy.startDate, tenancy.endDate),
    ) ?? null
  );
}

/** Fortlaufende, sprechende Referenz – dient zugleich als Verwendungszweck. */
export async function nextReference(date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const prefix = `WW-${year}-`;

  const latest = await prisma.tenancy.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const lastNumber = latest ? Number.parseInt(latest.reference.slice(prefix.length), 10) : 0;
  const next = (Number.isNaN(lastNumber) ? 0 : lastNumber) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function nextContractNumber(date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const prefix = `MV-${year}-`;

  const latest = await prisma.contract.findFirst({
    where: { contractNumber: { startsWith: prefix } },
    orderBy: { contractNumber: "desc" },
    select: { contractNumber: true },
  });

  const lastNumber = latest ? Number.parseInt(latest.contractNumber.slice(prefix.length), 10) : 0;
  const next = (Number.isNaN(lastNumber) ? 0 : lastNumber) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export type BedOccupancy = {
  bedId: string;
  occupied: boolean;
  blocked: boolean;
  tenancy: {
    id: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    tenantId: string;
    tenantName: string;
  } | null;
};

/** Belegung aller uebergebenen Betten zu einem Stichtag. */
export async function bedOccupancy(bedIds: string[], at = new Date()): Promise<Map<string, BedOccupancy>> {
  const beds = await prisma.bed.findMany({
    where: { id: { in: bedIds } },
    select: { id: true, status: true },
  });

  const tenancies = await prisma.tenancy.findMany({
    where: {
      bedId: { in: bedIds },
      status: { in: [...OCCUPYING_STATUSES] },
      startDate: { lte: at },
      OR: [{ endDate: null }, { endDate: { gte: at } }],
    },
    include: { tenant: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { startDate: "asc" },
  });

  const byBed = new Map<string, (typeof tenancies)[number]>();
  for (const tenancy of tenancies) {
    if (!byBed.has(tenancy.bedId)) byBed.set(tenancy.bedId, tenancy);
  }

  const result = new Map<string, BedOccupancy>();
  for (const bed of beds) {
    const tenancy = byBed.get(bed.id) ?? null;
    result.set(bed.id, {
      bedId: bed.id,
      occupied: Boolean(tenancy),
      blocked: bed.status === "BLOCKED",
      tenancy: tenancy
        ? {
            id: tenancy.id,
            status: tenancy.status,
            startDate: tenancy.startDate,
            endDate: tenancy.endDate,
            tenantId: tenancy.tenant.id,
            tenantName: `${tenancy.tenant.firstName} ${tenancy.tenant.lastName}`.trim(),
          }
        : null,
    });
  }
  return result;
}

export type OccupancySummary = {
  beds: number;
  occupied: number;
  blocked: number;
  free: number;
  rate: number;
  potentialRentCents: number;
  actualRentCents: number;
};

/** Kennzahlen fuer Dashboard und Objektuebersicht. */
export async function occupancySummary(propertyId?: string, at = new Date()): Promise<OccupancySummary> {
  // Ohne Objektfilter zaehlen nur aktive Objekte - inaktive sind Geschichte.
  const beds = await prisma.bed.findMany({
    where: propertyId ? { room: { propertyId } } : { room: { property: { active: true } } },
    select: { id: true, status: true, monthlyRentCents: true },
  });

  const occupancy = await bedOccupancy(
    beds.map((bed) => bed.id),
    at,
  );

  let occupied = 0;
  let blocked = 0;
  let potentialRentCents = 0;

  for (const bed of beds) {
    potentialRentCents += bed.monthlyRentCents;
    const info = occupancy.get(bed.id);
    if (info?.occupied) occupied += 1;
    else if (bed.status === "BLOCKED") blocked += 1;
  }

  const activeTenancies = await prisma.tenancy.findMany({
    where: {
      status: { in: [...OCCUPYING_STATUSES] },
      startDate: { lte: at },
      OR: [{ endDate: null }, { endDate: { gte: at } }],
      ...(propertyId
        ? { bed: { room: { propertyId } } }
        : { bed: { room: { property: { active: true } } } }),
    },
    select: { monthlyRentCents: true },
  });

  const actualRentCents = activeTenancies.reduce((sum, t) => sum + t.monthlyRentCents, 0);
  const rentable = beds.length - blocked;

  return {
    beds: beds.length,
    occupied,
    blocked,
    free: Math.max(0, rentable - occupied),
    rate: rentable > 0 ? occupied / rentable : 0,
    potentialRentCents,
    actualRentCents,
  };
}
