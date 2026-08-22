"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { cents, date, flash, int, optionalStr, str } from "@/lib/form";
import { randomToken } from "@/lib/storage";
import { findConflictingTenancy, nextContractNumber, nextReference } from "@/lib/tenancy";
import { ensureRentCharges } from "@/lib/accounting";
import { formatDate } from "@/lib/dates";

function refresh(tenantId?: string) {
  revalidatePath("/mieter");
  revalidatePath("/vertraege");
  revalidatePath("/belegung");
  revalidatePath("/objekte");
  revalidatePath("/");
  if (tenantId) revalidatePath(`/mieter/${tenantId}`);
}

function tenantData(formData: FormData) {
  return {
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    email: str(formData, "email").toLowerCase(),
    phone: optionalStr(formData, "phone"),
    company: optionalStr(formData, "company"),
    companyVatId: optionalStr(formData, "companyVatId"),
    companyStreet: optionalStr(formData, "companyStreet"),
    companyZip: optionalStr(formData, "companyZip"),
    companyCity: optionalStr(formData, "companyCity"),
    birthDate: date(formData, "birthDate"),
    nationality: optionalStr(formData, "nationality"),
    idType: optionalStr(formData, "idType"),
    idNumber: optionalStr(formData, "idNumber"),
    street: optionalStr(formData, "street"),
    zip: optionalStr(formData, "zip"),
    city: optionalStr(formData, "city"),
    country: optionalStr(formData, "country") ?? "Deutschland",
    notes: optionalStr(formData, "notes"),
  };
}

/**
 * Legt einen Mieter an und – wenn ein Bett gewaehlt wurde – gleich das
 * Mietverhaeltnis samt Vertragsentwurf. Das ist der Weg, den die
 * Hausverwaltung taeglich geht: Person erfassen, Bett zuweisen, Link schicken.
 */
export async function createTenant(formData: FormData) {
  const user = await requireAdmin();
  const data = tenantData(formData);

  // E-Mail ist keine Pflicht: viele Monteure haben keine oder nennen sie
  // erst spaeter. Ohne Adresse wird der Vertragslink zum Kopieren angezeigt
  // statt versendet. Nachname darf fehlen, solange ein Vorname da ist -
  // manche stehen nur mit Rufnamen in den Unterlagen.
  if (!data.firstName) {
    redirect(flash("/mieter/neu", "fehler", "Mindestens der Vorname muss angegeben werden."));
  }

  const bedId = str(formData, "bedId");
  const startDate = date(formData, "startDate");
  const endDate = date(formData, "endDate");

  if (bedId) {
    if (!startDate) {
      redirect(flash("/mieter/neu", "fehler", "Für die Bettzuweisung wird ein Mietbeginn benötigt."));
    }
    if (endDate && endDate < startDate) {
      redirect(flash("/mieter/neu", "fehler", "Das Mietende darf nicht vor dem Mietbeginn liegen."));
    }

    const conflict = await findConflictingTenancy({ bedId, startDate, endDate });
    if (conflict) {
      redirect(
        flash(
          "/mieter/neu",
          "fehler",
          `Das Bett ist im gewählten Zeitraum bereits an ${conflict.tenant.firstName} ${conflict.tenant.lastName} vergeben ` +
            `(ab ${formatDate(conflict.startDate)}).`,
        ),
      );
    }
  }

  const tenant = await prisma.tenant.create({ data });
  await audit(user.email, "create", "Tenant", tenant.id, `${data.firstName} ${data.lastName}`);

  if (bedId && startDate) {
    const bed = await prisma.bed.findUnique({ where: { id: bedId } });
    const tenancy = await prisma.tenancy.create({
      data: {
        tenantId: tenant.id,
        bedId,
        startDate,
        endDate,
        monthlyRentCents: cents(formData, "monthlyRentCents", bed?.monthlyRentCents ?? 35000),
        depositCents: cents(formData, "depositCents", 0),
        utilitiesCents: cents(formData, "utilitiesCents", 0),
        billingDay: Math.min(Math.max(int(formData, "billingDay", 1), 1), 28),
        reference: await nextReference(startDate),
        status: "DRAFT",
        contract: {
          create: {
            contractNumber: await nextContractNumber(startDate),
            token: randomToken(),
            status: "DRAFT",
          },
        },
      },
      include: { contract: true },
    });

    await audit(user.email, "create", "Tenancy", tenancy.id, tenancy.reference);
    refresh(tenant.id);
    redirect(
      flash(
        `/vertraege/${tenancy.contract!.id}`,
        "ok",
        "Mieter und Vertragsentwurf wurden angelegt. Jetzt den Link an den Mieter senden.",
      ),
    );
  }

  refresh(tenant.id);
  redirect(flash(`/mieter/${tenant.id}`, "ok", "Mieter wurde angelegt."));
}

export async function updateTenant(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  await prisma.tenant.update({ where: { id }, data: tenantData(formData) });
  await audit(user.email, "update", "Tenant", id);

  refresh(id);
  redirect(flash(`/mieter/${id}`, "ok", "Mieterdaten wurden gespeichert."));
}

export async function deleteTenant(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const active = await prisma.tenancy.count({
    where: { tenantId: id, status: { in: ["SENT", "ACTIVE"] } },
  });
  if (active > 0) {
    redirect(
      flash(
        `/mieter/${id}`,
        "fehler",
        "Der Mieter hat ein laufendes Mietverhältnis. Bitte dieses zuerst beenden.",
      ),
    );
  }

  await prisma.tenant.delete({ where: { id } });
  await audit(user.email, "delete", "Tenant", id);
  refresh();
  redirect(flash("/mieter", "ok", "Mieter wurde gelöscht."));
}

// --- Mietverhaeltnisse -----------------------------------------------------

/** Weist einem bestehenden Mieter ein (weiteres) Bett zu. */
export async function createTenancy(formData: FormData) {
  const user = await requireAdmin();

  const tenantId = str(formData, "tenantId");
  const bedId = str(formData, "bedId");
  const startDate = date(formData, "startDate");
  const endDate = date(formData, "endDate");

  const back = `/mieter/${tenantId}`;
  if (!bedId || !startDate) {
    redirect(flash(back, "fehler", "Bitte Bett und Mietbeginn auswählen."));
  }
  if (endDate && endDate < startDate) {
    redirect(flash(back, "fehler", "Das Mietende darf nicht vor dem Mietbeginn liegen."));
  }

  const conflict = await findConflictingTenancy({ bedId, startDate, endDate });
  if (conflict) {
    redirect(
      flash(
        back,
        "fehler",
        `Das Bett ist im gewählten Zeitraum an ${conflict.tenant.firstName} ${conflict.tenant.lastName} vergeben.`,
      ),
    );
  }

  const bed = await prisma.bed.findUnique({ where: { id: bedId } });
  const tenancy = await prisma.tenancy.create({
    data: {
      tenantId,
      bedId,
      startDate,
      endDate,
      monthlyRentCents: cents(formData, "monthlyRentCents", bed?.monthlyRentCents ?? 35000),
      depositCents: cents(formData, "depositCents", 0),
      utilitiesCents: cents(formData, "utilitiesCents", 0),
      billingDay: Math.min(Math.max(int(formData, "billingDay", 1), 1), 28),
      reference: await nextReference(startDate),
      status: "DRAFT",
      contract: {
        create: {
          contractNumber: await nextContractNumber(startDate),
          token: randomToken(),
          status: "DRAFT",
        },
      },
    },
    include: { contract: true },
  });

  await audit(user.email, "create", "Tenancy", tenancy.id, tenancy.reference);
  refresh(tenantId);
  redirect(flash(`/vertraege/${tenancy.contract!.id}`, "ok", "Vertragsentwurf wurde angelegt."));
}

export async function updateTenancy(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const tenancy = await prisma.tenancy.findUnique({ where: { id }, include: { contract: true } });
  if (!tenancy) redirect(flash("/vertraege", "fehler", "Mietverhältnis nicht gefunden."));

  const back = tenancy.contract ? `/vertraege/${tenancy.contract.id}` : `/mieter/${tenancy.tenantId}`;
  const startDate = date(formData, "startDate") ?? tenancy.startDate;
  const endDate = date(formData, "endDate");

  if (endDate && endDate < startDate) {
    redirect(flash(back, "fehler", "Das Mietende darf nicht vor dem Mietbeginn liegen."));
  }

  const conflict = await findConflictingTenancy({
    bedId: tenancy.bedId,
    startDate,
    endDate,
    excludeTenancyId: id,
  });
  if (conflict) {
    redirect(
      flash(
        back,
        "fehler",
        `Der Zeitraum überschneidet sich mit ${conflict.tenant.firstName} ${conflict.tenant.lastName}.`,
      ),
    );
  }

  await prisma.tenancy.update({
    where: { id },
    data: {
      startDate,
      endDate,
      monthlyRentCents: cents(formData, "monthlyRentCents", tenancy.monthlyRentCents),
      depositCents: cents(formData, "depositCents", tenancy.depositCents),
      utilitiesCents: cents(formData, "utilitiesCents", tenancy.utilitiesCents),
      billingDay: Math.min(Math.max(int(formData, "billingDay", tenancy.billingDay), 1), 28),
      notes: optionalStr(formData, "notes"),
    },
  });

  // Kaution auf 0 gesetzt: die noch unbezahlte Kautionsforderung verschwindet
  // mit. Eine bereits bezahlte bleibt stehen - Geld, das geflossen ist,
  // verschwindet nicht durch eine Formularänderung.
  const neueKaution = cents(formData, "depositCents", tenancy.depositCents);
  if (neueKaution === 0) {
    await prisma.rentCharge.deleteMany({
      where: { tenancyId: id, kind: "DEPOSIT", status: { in: ["OPEN", "PARTIAL"] } },
    });
  }

  await ensureRentCharges({ tenancyId: id });
  await audit(user.email, "update", "Tenancy", id);
  refresh(tenancy.tenantId);
  redirect(flash(back, "ok", "Mietverhältnis wurde aktualisiert."));
}

/** Beendet ein Mietverhaeltnis zum angegebenen Datum. */
export async function endTenancy(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const endDate = date(formData, "endDate") ?? new Date();

  const tenancy = await prisma.tenancy.update({
    where: { id },
    data: { endDate, status: "ENDED" },
  });

  await audit(user.email, "end", "Tenancy", id, formatDate(endDate));
  refresh(tenancy.tenantId);
  redirect(
    flash(
      `/mieter/${tenancy.tenantId}`,
      "ok",
      `Mietverhältnis wurde zum ${formatDate(endDate)} beendet. Das Bett ist ab dann wieder frei.`,
    ),
  );
}
