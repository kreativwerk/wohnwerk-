"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { bool, cents, flash, float, int, optionalStr, str } from "@/lib/form";
import {
  TEMPLATE_KIND,
  TEMPLATE_KIND_LABEL,
  autoMap,
  coversContract,
  coversLandlordConfirmation,
  inspectTemplate,
  isPlaceholder,
} from "@/lib/pdf-template";

function refresh(propertyId?: string) {
  revalidatePath("/objekte");
  revalidatePath("/belegung");
  revalidatePath("/");
  if (propertyId) revalidatePath(`/objekte/${propertyId}`);
}

// --- Objekte ---------------------------------------------------------------

export async function createProperty(formData: FormData) {
  const user = await requireAdmin();

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
      tenure: str(formData, "tenure") === "EIGENTUM" ? "EIGENTUM" : "ANGEMIETET",
      ownerName: optionalStr(formData, "ownerName"),
      managerName: optionalStr(formData, "managerName"),
      managerPhone: optionalStr(formData, "managerPhone"),
      managerEmail: optionalStr(formData, "managerEmail"),
      wifiSsid: optionalStr(formData, "wifiSsid"),
      wifiPassword: optionalStr(formData, "wifiPassword"),
    },
  });

  await audit(user.email, "create", "Property", property.id, property.name);

  // Der Vordruck fuer die Meldebehoerde gehoert zum Objekt: ohne ihn kann sich
  // spaeter kein Mieter anmelden. Scheitert das Einlesen, bleibt das Objekt
  // trotzdem bestehen - es nachtraeglich zu ergaenzen ist ein Klick.
  const hinweis = await attachTemplateOnCreate(formData, property.id);

  refresh(property.id);
  redirect(
    flash(
      `/objekte/${property.id}`,
      hinweis ? "fehler" : "ok",
      hinweis ?? `Objekt „${property.name}“ wurde angelegt.`,
    ),
  );
}

export async function updateProperty(formData: FormData) {
  const user = await requireAdmin();
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
      tenure: str(formData, "tenure") === "EIGENTUM" ? "EIGENTUM" : "ANGEMIETET",
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
  const user = await requireAdmin();
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
  const user = await requireAdmin();
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
  const user = await requireAdmin();
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
  const user = await requireAdmin();
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
  const user = await requireAdmin();
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
  const user = await requireAdmin();
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
  const user = await requireAdmin();
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

// --- Vordrucke des Objekts -------------------------------------------------
//
// Die Wohnungsgeberbestaetigung nach § 19 BMG gibt jede Kommune anders heraus.
// Wohnwerk baut sie deshalb nicht nach, sondern haelt je Objekt den Vordruck
// der zustaendigen Behoerde vor und fuellt nur dessen Formularfelder.

const MAX_TEMPLATE_BYTES = 12 * 1024 * 1024;

/**
 * Nimmt eine hochgeladene Vorlage an, liest ihre Formularfelder und schlaegt
 * eine Zuordnung vor. Eine bereits vorhandene Vorlage derselben Art wird
 * ersetzt, damit nie zwei gleichartige Vordrucke im Umlauf sind.
 */
export async function uploadPropertyTemplate(formData: FormData) {
  const user = await requireAdmin();
  const propertyId = str(formData, "propertyId");
  const kind = str(formData, "kind");
  const ziel = `/objekte/${propertyId}`;

  if (!coversContract(kind) && !coversLandlordConfirmation(kind)) {
    redirect(flash(ziel, "fehler", "Unbekannte Art des Vordrucks."));
  }

  const datei = formData.get("file");
  if (!(datei instanceof File) || datei.size === 0) {
    redirect(flash(ziel, "fehler", "Bitte eine PDF-Datei auswählen."));
  }
  if (datei.type && datei.type !== "application/pdf") {
    redirect(flash(ziel, "fehler", "Der Vordruck muss eine PDF-Datei sein."));
  }
  if (datei.size > MAX_TEMPLATE_BYTES) {
    redirect(flash(ziel, "fehler", "Die Datei ist größer als 12 MB."));
  }

  const bytes = Buffer.from(await datei.arrayBuffer());

  let info;
  try {
    info = await inspectTemplate(bytes);
  } catch {
    redirect(flash(ziel, "fehler", "Die Datei konnte nicht als PDF gelesen werden."));
  }

  const namen = info.fields.filter((f) => f.type !== "sonstiges").map((f) => f.name);

  await prisma.$transaction([
    prisma.propertyTemplate.deleteMany({ where: { propertyId, kind } }),
    prisma.propertyTemplate.create({
      data: {
        propertyId,
        kind,
        title: TEMPLATE_KIND_LABEL[kind] ?? kind,
        fileName: datei.name,
        sizeBytes: bytes.byteLength,
        data: bytes,
        pageCount: info.pageCount,
        fieldNames: JSON.stringify(info.fields),
        fieldMap: JSON.stringify(autoMap(namen)),
      },
    }),
  ]);

  await audit(user.email, "upload-template", "Property", propertyId, `${kind}: ${datei.name}`);
  refresh(propertyId);

  const hinweis =
    namen.length === 0
      ? "Vordruck gespeichert. Er enthält keine Formularfelder – Wohnwerk kann ihn deshalb nicht automatisch ausfüllen."
      : `Vordruck gespeichert. ${namen.length} Formularfeld(er) erkannt und vorbelegt – bitte die Zuordnung prüfen.`;
  redirect(flash(ziel, namen.length === 0 ? "fehler" : "ok", hinweis));
}

/** Speichert die vom Anwender geprüfte Zuordnung der Formularfelder. */
export async function savePropertyTemplateMapping(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const template = await prisma.propertyTemplate.findUnique({ where: { id } });
  if (!template) redirect(flash("/objekte", "fehler", "Vordruck nicht gefunden."));

  const felder = JSON.parse(template.fieldNames) as Array<{ name: string }>;
  const map: Record<string, string> = {};
  for (const feld of felder) {
    const wert = String(formData.get(`feld:${feld.name}`) ?? "");
    if (wert && isPlaceholder(wert)) map[feld.name] = wert;
  }

  await prisma.propertyTemplate.update({
    where: { id },
    data: { fieldMap: JSON.stringify(map) },
  });

  await audit(user.email, "map-template", "Property", template.propertyId, template.kind);
  refresh(template.propertyId);
  redirect(
    flash(`/objekte/${template.propertyId}`, "ok", "Zuordnung der Formularfelder gespeichert."),
  );
}

/** Entfernt einen Vordruck wieder. */
export async function deletePropertyTemplate(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const template = await prisma.propertyTemplate.findUnique({ where: { id } });
  if (!template) redirect(flash("/objekte", "fehler", "Vordruck nicht gefunden."));

  await prisma.propertyTemplate.delete({ where: { id } });
  await audit(user.email, "delete-template", "Property", template.propertyId, template.kind);
  refresh(template.propertyId);
  redirect(flash(`/objekte/${template.propertyId}`, "ok", "Vordruck wurde entfernt."));
}


/**
 * Nimmt den beim Anlegen mitgeschickten Vordruck entgegen.
 * Gibt eine Meldung zurueck, wenn etwas nicht gestimmt hat, sonst null.
 */
async function attachTemplateOnCreate(
  formData: FormData,
  propertyId: string,
): Promise<string | null> {
  const datei = formData.get("templateFile");
  if (!(datei instanceof File) || datei.size === 0) {
    return "Objekt wurde angelegt, aber ohne Wohnungsgeberbestätigung. Bitte den Vordruck unter „Vordrucke“ nachtragen.";
  }
  if (datei.size > MAX_TEMPLATE_BYTES) {
    return "Objekt wurde angelegt. Der Vordruck war größer als 12 MB und wurde nicht übernommen.";
  }

  const kindRoh = String(formData.get("templateKind") ?? TEMPLATE_KIND.COMBINED);
  const kind = coversLandlordConfirmation(kindRoh) || coversContract(kindRoh)
    ? kindRoh
    : TEMPLATE_KIND.COMBINED;

  const bytes = Buffer.from(await datei.arrayBuffer());

  let info;
  try {
    info = await inspectTemplate(bytes);
  } catch {
    return "Objekt wurde angelegt. Die hochgeladene Datei ließ sich nicht als PDF lesen und wurde nicht übernommen.";
  }

  const namen = info.fields.filter((f) => f.type !== "sonstiges").map((f) => f.name);

  await prisma.propertyTemplate.create({
    data: {
      propertyId,
      kind,
      title: TEMPLATE_KIND_LABEL[kind] ?? kind,
      fileName: datei.name,
      sizeBytes: bytes.byteLength,
      data: bytes,
      pageCount: info.pageCount,
      fieldNames: JSON.stringify(info.fields),
      fieldMap: JSON.stringify(autoMap(namen)),
    },
  });

  if (namen.length === 0) {
    return "Objekt und Vordruck wurden gespeichert. Die PDF enthält allerdings keine Formularfelder, Wohnwerk kann sie deshalb nicht automatisch ausfüllen.";
  }
  return null;
}
