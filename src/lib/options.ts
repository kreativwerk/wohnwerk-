import "server-only";

import { prisma } from "./db";
import { bedOccupancy } from "./tenancy";
import type { BedOption } from "@/components/interactive";

/** Alle Betten mit Belegungszustand - Grundlage fuer die Bettauswahl im Formular. */
export async function bedOptions(at = new Date()): Promise<BedOption[]> {
  const beds = await prisma.bed.findMany({
    include: { room: { include: { property: true } } },
    orderBy: [{ room: { property: { name: "asc" } } }, { room: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  const occupancy = await bedOccupancy(
    beds.map((bed) => bed.id),
    at,
  );

  return beds
    .filter((bed) => bed.room.property.active)
    .map((bed) => ({
      id: bed.id,
      label: bed.label,
      roomId: bed.roomId,
      roomName: bed.room.name,
      propertyId: bed.room.propertyId,
      propertyName: bed.room.property.name,
      monthlyRentCents: bed.monthlyRentCents,
      occupied: Boolean(occupancy.get(bed.id)?.occupied),
      blocked: bed.status === "BLOCKED",
    }));
}

export async function propertyOptions() {
  return prisma.property.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
