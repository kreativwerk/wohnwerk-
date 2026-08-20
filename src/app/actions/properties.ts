"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { bool, cents, flash, float, int, optionalStr, str } from "@/lib/form";

function refresh(propertyId?: string) {
  revalidatePath("/objekte");
  revalidatePath("/belegung");
  revalidatePath("/");
  if (propertyId) revalidatePath(`/objekte/${propertyId}`);
}

// --- Objekte ---------------------------------------------------------------

export async function createProperty(formData: FormData) {
  const user = await requireUser();

  const name = str(formData, "name");
  const street = str(formData, "street");
  const zip = str(formData, "zip");
  const city = str(formData, "city");

  if (!name || !street || !zip || !city) {
    redirect(flash("/objekte/neu", "fehler", "Name, Straße, PLZ und Ort sind Pflichtfelder."));
  }

  const property = await prisma.property.create({
    data: {
      name,
      street,
      zip,
      city,
      country: str(formData, "country") || "Deutschland",
      shortCode: optionalStr(formData, "shortCode"),
      notes: optionalStr(formData, "notes"),
      ownerName: optionalStr(formData, "ownerName"),
      managerName: optionalStr(formData, "managerName"),
      managerPhone: optionalStr(formData, "managerPhone"),
      managerEmail: optionalStr(formData, "managerEmail"),
      wifiSsid: optionalStr(formData, "wifiSsid"),
      wifiPassword: optionalStr(formData, "wifiPassword"),
    },
  });

  await audit(user.email, "create", "Property", property.id, property.name);
  refresh(property.id);
  redirect(flash(`/objekte/${property.id}`, "ok", `Objekt „${property.name}“ wurde angelegt.`));
}

export async function updateProperty(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");

  const property = await prisma.property.update({
    where: { id },
    data: {
      name: str(formData, "name"),
      street: str(formData, "street"),
      zip: str(formData, "zip"),
      city: str(formData, "city"),
      country: str(formData, "country") || "Deutschland",
      shortCode: optionalStr(formData, "shortCode"),
      notes: optionalStr(formData, "notes"),
      ownerName: optionalStr(formData, "ownerName"),
      managerName: optionalStr(formData, "managerName"),
      managerPhone: optionalStr(formData, "managerPhone"),
      managerEmail: optionalStr(formData, "managerEmail"),
      wifiSsid: optionalStr(formData, "wifiSsid"),
      wifiPassword: optionalStr(formData, "wifiPassword"),
      active: bool(formData, "active"),
    },
  });

  await audit(user.email, "update", "Property", id, property.name);
  refresh(id);
  redirect(flash(`/objekte/${id}`, "ok", "Objektdaten wurden gespeichert."));
}

export async function deleteProperty(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");

  const tenancyCount = await prisma.tenancy.count({
    where: { bed: { room: { propertyId: id } }, status: { in: ["SENT", "ACTIVE"] } },
  });
  if (tenancyCount > 0) {
    redirect(
      flash(
        `/objekte/${id}`,
        "fehler",
        `Das Objekt hat noch ${tenancyCount} laufende Mietverhältnis(se) und kann nicht gelöscht werden.`,
      ),
    );
  }

  await prisma.property.delete({ where: { id } });
  await audit(user.email, "delete", "Property", id);
  refresh();
  redirect(flash("/objekte", "ok", "Objekt wurde gelöscht."));
}

// --- Zimmer ----------------------------------------------------------------

export async function createRoom(formData: FormData) {
  const user = await requireUser();
  const propertyId = str(formData, "propertyId");
  const name = str(formData, "name");

  if (!name) {
    redirect(flash(`/objekte/${propertyId}`, "fehler", "Das Zimmer braucht eine Bezeichnung."));
  }

  const defaultBedRentCents = cents(formData, "defaultBedRentCents", 35000);
  const bedCount = Math.max(0, Math.min(int(formData, "bedCount", 0), 20));

  const lastRoom = await prisma.room.findFirst({
    where: { propertyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const room = await prisma.room.create({
    data: {
      propertyId,
      name,
      floor: optionalStr(formData, "floor"),
      sizeSqm: float(formData, "sizeSqm"),
      notes: optionalStr(formData, "notes"),
      defaultBedRentCents,
      sortOrder: (lastRoom?.sortOrder ?? 0) + 1,
      // Betten gleich mitanlegen - das ist der Normalfall beim Erfassen.
      beds: {
        create: Array.from({ length: bedCount }, (_, index) => ({
          label: `Bett ${String.fromCharCode(65 + index)}`,
          monthlyRentCents: defaultBedRentCents,
          sortOrder: index,
        })),
      },
    },
  });

  await audit(user.email, "create", "Room", room.id, `${name} (${bedCount} Betten)`);
  refresh(propertyId);
  redirect(
    flash(
      `/objekte/${propertyId}`,
      "ok",
      bedCount > 0
        ? `Zimmer „${name}“ mit ${bedCount} Bett(en) wurde angelegt.`
        : `Zimmer „${name}“ wurde angelegt.`,
    ),
  );
}

export async function updateRoom(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const propertyId = str(formData, "propertyId");

  await prisma.room.update({
    where: { id },
    data: {
      name: str(formData, "name"),
      floor: optionalStr(formData, "floor"),
      sizeSqm: float(formData, "sizeSqm"),
      notes: optionalStr(formData, "notes"),
      defaultBedRentCents: cents(formData, "defaultBedRentCents", 35000),
    },
  });

  await audit(user.email, "update", "Room", id);
  refresh(propertyId);
  redirect(flash(`/objekte/${propertyId}`, "ok", "Zimmer wurde gespeichert."));
}

export async function deleteRoom(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const propertyId = str(formData, "propertyId");

  const tenancyCount = await prisma.tenancy.count({
    where: { bed: { roomId: id }, status: { in: ["SENT", "ACTIVE"] } },
  });
  if (tenancyCount > 0) {
    redirect(
      flash(
        `/objekte/${propertyId}`,
        "fehler",
        "Im Zimmer wohnen noch Mieter. Bitte zuerst die Mietverhältnisse beenden.",
      ),
    );
  }

  await prisma.room.delete({ where: { id } });
  await audit(user.email, "delete", "Room", id);
  refresh(propertyId);
  redirect(flash(`/objekte/${propertyId}`, "ok", "Zimmer wurde gelöscht."));
}

// --- Betten ----------------------------------------------------------------

export async function createBed(formData: FormData) {
  const user = await requireUser();
  const roomId = str(formData, "roomId");
  const propertyId = str(formData, "propertyId");

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { beds: { orderBy: { sortOrder: "desc" }, take: 1 } },
  });
  if (!room) redirect(flash(`/objekte/${propertyId}`, "fehler", "Zimmer nicht gefunden."));

  const count = await prisma.bed.count({ where: { roomId } });
  const label = str(formData, "label") || `Bett ${String.fromCharCode(65 + count)}`;

  const bed = await prisma.bed.create({
    data: {
      roomId,
      label,
      monthlyRentCents: cents(formData, "monthlyRentCents", room.defaultBedRentCents),
      notes: optionalStr(formData, "notes"),
      sortOrder: (room.beds[0]?.sortOrder ?? -1) + 1,
    },
  });

  await audit(user.email, "create", "Bed", bed.id, label);
  refresh(propertyId);
  redirect(flash(`/objekte/${propertyId}`, "ok", `„${label}“ wurde angelegt.`));
}

export async function updateBed(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const propertyId = str(formData, "propertyId");

  const status = str(formData, "status") === "BLOCKED" ? "BLOCKED" : "FREE";

  await prisma.bed.update({
    where: { id },
    data: {
      label: str(formData, "label"),
      monthlyRentCents: cents(formData, "monthlyRentCents", 35000),
      status,
      notes: optionalStr(formData, "notes"),
    },
  });

  await audit(user.email, "update", "Bed", id);
  refresh(propertyId);
  redirect(flash(`/objekte/${propertyId}`, "ok", "Bett wurde gespeichert."));
}

export async function deleteBed(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const propertyId = str(formData, "propertyId");

  const tenancyCount = await prisma.tenancy.count({
    where: { bedId: id, status: { in: ["SENT", "ACTIVE"] } },
  });
  if (tenancyCount > 0) {
    redirect(
      flash(`/objekte/${propertyId}`, "fehler", "Das Bett ist belegt und kann nicht gelöscht werden."),
    );
  }

  await prisma.bed.delete({ where: { id } });
  await audit(user.email, "delete", "Bed", id);
  refresh(propertyId);
  redirect(flash(`/objekte/${propertyId}`, "ok", "Bett wurde gelöscht."));
}
