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
import { uebersetzer } from "@/lib/i18n";

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
    privateEmail: optionalStr(formData, "privateEmail")?.toLowerCase() ?? null,
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
  const t = await uebersetzer();
  const user = await requireAdmin();
  const data = tenantData(formData);

  // E-Mail ist keine Pflicht: viele Monteure haben keine oder nennen sie
  // erst spaeter. Ohne Adresse wird der Vertragslink zum Kopieren angezeigt
  // statt versendet. Nachname darf fehlen, solange ein Vorname da ist -
  // manche stehen nur mit Rufnamen in den Unterlagen.
  if (!data.firstName) {
    redirect(flash("/mieter/neu", "fehler", t("Mindestens der Vorname muss angegeben werden.")));
  }

  const bedId = str(formData, "bedId");
  const startDate = date(formData, "startDate");
  const endDate = date(formData, "endDate");

  if (bedId) {
    if (!startDate) {
      redirect(flash("/mieter/neu", "fehler", t("Für die Bettzuweisung wird ein Mietbeginn benötigt.")));
    }
    if (endDate && endDate < startDate) {
      redirect(flash("/mieter/neu", "fehler", t("Das Mietende darf nicht vor dem Mietbeginn liegen.")));
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
        t("Mieter und Vertragsentwurf wurden angelegt. Jetzt den Link an den Mieter senden."),
      ),
    );
  }

  refresh(tenant.id);
  redirect(flash(`/mieter/${tenant.id}`, "ok", t("Mieter wurde angelegt.")));
}

export async function updateTenant(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");

  await prisma.tenant.update({ where: { id }, data: tenantData(formData) });
  await audit(user.email, "update", "Tenant", id);

  refresh(id);
  redirect(flash(`/mieter/${id}`, "ok", t("Mieterdaten wurden gespeichert.")));
}

/**
 * Kontaktdaten aus der Kontaktliste - eine Zeile je Mieter.
 *
 * Alles freiwillig: ein leeres Namensfeld laesst den Namen stehen, statt
 * ihn zu loeschen; leeres Telefon oder leere private E-Mail entfernen den
 * Eintrag bewusst. Die Vertrags-E-Mail wird hier nicht angefasst.
 */
export async function updateTenantContact(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/mieter/kontakte";

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  if (!tenant) redirect(flash(back, "fehler", t("Mieter nicht gefunden.")));

  const privateEmail = optionalStr(formData, "privateEmail")?.toLowerCase() ?? null;
  if (privateEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(privateEmail)) {
    redirect(flash(back, "fehler", t("Bitte eine gültige E-Mail-Adresse angeben.")));
  }

  await prisma.tenant.update({
    where: { id },
    data: {
      firstName: str(formData, "firstName") || tenant.firstName,
      lastName: str(formData, "lastName") || tenant.lastName,
      phone: optionalStr(formData, "phone"),
      privateEmail,
    },
  });
  await audit(user.email, "update-contact", "Tenant", id);

  refresh(id);
  revalidatePath("/buchhaltung/mieteingaenge");
  redirect(flash(back, "ok", t("Kontakt von {name} gespeichert.", { name: `${str(formData, "firstName") || tenant.firstName} ${str(formData, "lastName") || tenant.lastName}`.trim() })));
}

export async function deleteTenant(formData: FormData) {
  const t = await uebersetzer();
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
        t("Der Mieter hat ein laufendes Mietverhältnis. Bitte dieses zuerst beenden."),
      ),
    );
  }

  await prisma.tenant.delete({ where: { id } });
  await audit(user.email, "delete", "Tenant", id);
  refresh();
  redirect(flash("/mieter", "ok", t("Mieter wurde gelöscht.")));
}

// --- Mietverhaeltnisse -----------------------------------------------------

/** Weist einem bestehenden Mieter ein (weiteres) Bett zu. */
export async function createTenancy(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();

  const tenantId = str(formData, "tenantId");
  const bedId = str(formData, "bedId");
  const startDate = date(formData, "startDate");
  const endDate = date(formData, "endDate");

  const back = `/mieter/${tenantId}`;
  if (!bedId || !startDate) {
    redirect(flash(back, "fehler", t("Bitte Bett und Mietbeginn auswählen.")));
  }
  if (endDate && endDate < startDate) {
    redirect(flash(back, "fehler", t("Das Mietende darf nicht vor dem Mietbeginn liegen.")));
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
  redirect(flash(`/vertraege/${tenancy.contract!.id}`, "ok", t("Vertragsentwurf wurde angelegt.")));
}

export async function updateTenancy(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");

  const tenancy = await prisma.tenancy.findUnique({ where: { id }, include: { contract: true } });
  if (!tenancy) redirect(flash("/vertraege", "fehler", t("Mietverhältnis nicht gefunden.")));

  const back = tenancy.contract ? `/vertraege/${tenancy.contract.id}` : `/mieter/${tenancy.tenantId}`;
  const startDate = date(formData, "startDate") ?? tenancy.startDate;
  const endDate = date(formData, "endDate");

  if (endDate && endDate < startDate) {
    redirect(flash(back, "fehler", t("Das Mietende darf nicht vor dem Mietbeginn liegen.")));
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
  redirect(flash(back, "ok", t("Mietverhältnis wurde aktualisiert.")));
}

/**
 * Kaution von der Kautionsseite aus nachtragen - ohne den Umweg ueber das
 * Mietverhaeltnis-Formular. Setzt den Betrag und erzeugt die Forderung
 * gleich mit, damit die Zeile sofort abgehakt werden kann. Dient auch
 * dazu, fuer eine vereinbarte Kaution die fehlende Forderung anzulegen.
 */
export async function setTenancyDeposit(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = optionalStr(formData, "back") ?? "/buchhaltung/kautionen";

  const tenancy = await prisma.tenancy.findUnique({ where: { id } });
  if (!tenancy) redirect(flash(back, "fehler", t("Mietverhältnis nicht gefunden.")));

  const depositCents = cents(formData, "depositCents", tenancy.depositCents);
  if (depositCents <= 0) {
    redirect(flash(back, "fehler", t("Bitte einen Kautionsbetrag über 0,00 € eingeben.")));
  }

  if (depositCents !== tenancy.depositCents) {
    await prisma.tenancy.update({ where: { id }, data: { depositCents } });
  }
  const erzeugt = await ensureRentCharges({ tenancyId: id });
  await audit(user.email, "update", "Tenancy", id);
  refresh(tenancy.tenantId);
  revalidatePath("/buchhaltung/kautionen");
  revalidatePath("/buchhaltung/mieteingaenge");
  redirect(
    flash(
      back,
      "ok",
      erzeugt > 0
        ? t("Kaution hinterlegt, Forderung erzeugt.")
        : t("Kaution hinterlegt. Die Forderung entsteht, sobald der Vertrag versandt ist."),
    ),
  );
}

/**
 * Umzug in ein anderes Bett - auch in eine andere Wohnung oder ein anderes
 * Objekt. Das Mietverhaeltnis bleibt, wie es ist: Beginn, Miete, Kaution,
 * Vertrag, Forderungen und Verwendungszweck aendern sich nicht. Es wechselt
 * nur der Schlafplatz - so, wie es in der Praxis passiert, wenn jemand
 * intern umzieht oder beim Anlegen das falsche Bett gewaehlt wurde.
 */
export async function moveTenancy(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");
  const bedId = str(formData, "bedId");

  const tenancy = await prisma.tenancy.findUnique({
    where: { id },
    include: { bed: { include: { room: true } } },
  });
  if (!tenancy) redirect(flash("/mieter", "fehler", t("Mietverhältnis nicht gefunden.")));
  const back = `/mieter/${tenancy.tenantId}`;

  if (!bedId) redirect(flash(back, "fehler", t("Bitte ein Bett wählen.")));
  if (bedId === tenancy.bedId) redirect(flash(back, "fehler", t("Das ist bereits das aktuelle Bett.")));

  const bed = await prisma.bed.findUnique({ where: { id: bedId }, include: { room: true } });
  if (!bed) redirect(flash(back, "fehler", t("Bett nicht gefunden.")));
  if (bed.status === "BLOCKED") redirect(flash(back, "fehler", t("Dieses Bett ist gesperrt.")));

  const conflict = await findConflictingTenancy({
    bedId,
    startDate: tenancy.startDate,
    endDate: tenancy.endDate,
    excludeTenancyId: id,
  });
  if (conflict) {
    redirect(
      flash(
        back,
        "fehler",
        t("Das Bett ist im Zeitraum bereits belegt: {name}.", {
          name: `${conflict.tenant.firstName} ${conflict.tenant.lastName}`,
        }),
      ),
    );
  }

  const vorher = `${tenancy.bed.room.name} · ${tenancy.bed.label}`;
  const nachher = `${bed.room.name} · ${bed.label}`;
  await prisma.tenancy.update({ where: { id }, data: { bedId } });
  await audit(user.email, "move", "Tenancy", id, `${vorher} → ${nachher}`);
  refresh(tenancy.tenantId);
  redirect(flash(back, "ok", t("Umgezogen: {vorher} → {nachher}. Vertrag und Forderungen bleiben unverändert.", { vorher, nachher })));
}

/**
 * Loescht ein Mietverhaeltnis, das versehentlich angelegt wurde - falsches
 * Bett, falsche Person. Geht nur, solange nichts Verbindliches dranhaengt:
 * kein unterschriebener Vertrag, keine verbuchte Zahlung. Alles andere
 * ist kein Versehen mehr, sondern Geschichte - dafuer gibt es "Beenden".
 * Vertrag und Forderungen gehen per Kaskade mit.
 */
export async function deleteTenancy(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");

  const tenancy = await prisma.tenancy.findUnique({
    where: { id },
    include: {
      contract: { select: { status: true } },
      charges: { select: { status: true, allocations: { select: { id: true } } } },
      bed: { select: { label: true, room: { select: { name: true } } } },
    },
  });
  if (!tenancy) redirect(flash("/mieter", "fehler", t("Mietverhältnis nicht gefunden.")));
  const back = `/mieter/${tenancy.tenantId}`;

  if (tenancy.contract?.status === "SIGNED") {
    redirect(flash(back, "fehler", t("Der Vertrag ist unterschrieben – ein solches Mietverhältnis wird beendet, nicht gelöscht.")));
  }
  const verbucht = tenancy.charges.some((c) => c.status === "PAID" || c.allocations.length > 0);
  if (verbucht) {
    redirect(flash(back, "fehler", t("Zu diesem Mietverhältnis sind schon Zahlungen verbucht – bitte beenden statt löschen.")));
  }

  await prisma.tenancy.delete({ where: { id } });
  await audit(user.email, "delete", "Tenancy", id, `${tenancy.bed.room.name} · ${tenancy.bed.label}`);
  refresh(tenancy.tenantId);
  revalidatePath("/buchhaltung/mieteingaenge");
  revalidatePath("/buchhaltung/kautionen");
  redirect(flash(back, "ok", t("Mietverhältnis gelöscht. Das Bett {bett} ist wieder frei.", { bett: `${tenancy.bed.room.name} · ${tenancy.bed.label}` })));
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
