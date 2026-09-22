"use server";

import { revalidatePath } from "next/cache";

import { ensureRentCharges, forderungenAbgleichen } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uebersetzer } from "@/lib/i18n";
import { formatCents } from "@/lib/money";
import { randomToken } from "@/lib/storage";
import { findConflictingTenancy, nextContractNumber, nextReference } from "@/lib/tenancy";

/**
 * Der Zimmerplan: Personen per Drag-and-drop zwischen Betten schieben.
 *
 * Diese Aktionen antworten dem Browser statt umzuleiten - das Brett bleibt
 * stehen, die Meldung erscheint darauf. Jede Aktion sagt genau, was sie
 * getan hat, weil hinter einem kurzen Zug mehrere Dinge passieren koennen:
 * umziehen, tauschen, neu anlegen oder beenden.
 */
export type PlanAntwort = { ok: true; meldung: string } | { ok: false; fehler: string };

/** Betten, auf denen jemand liegt oder liegen wird - Entwurf zaehlt mit. */
const BEWOHNT = ["DRAFT", "SENT", "ACTIVE"] as const;

/**
 * Wer liegt heute (noch) auf einem Bett? Laufende Mietverhaeltnisse und
 * solche, die erst in der Zukunft enden - wer am 24. auszieht, wohnt am
 * 22. noch da. Ein heute beendetes zaehlt nicht mehr: Das ist der Fall
 * "gerade herausgenommen", der sich noch am selben Tag umkehren laesst.
 */
function bewohntHeute(jetzt: Date) {
  return {
    OR: [
      { status: { in: [...BEWOHNT] }, OR: [{ endDate: null }, { endDate: { gte: jetzt } }] },
      { status: "ENDED", endDate: { gt: jetzt } },
    ],
  };
}

/** Heute, 00:00 UTC des deutschen Kalendertags - so liegen alle Datumswerte in der Datenbank. */
function heute(): Date {
  const teile = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${teile}T00:00:00Z`);
}

function pfadeAuffrischen(propertyIds: string[], tenantIds: string[]) {
  revalidatePath("/");
  revalidatePath("/belegung");
  revalidatePath("/mieter");
  revalidatePath("/objekte");
  revalidatePath("/buchhaltung/mieteingaenge");
  revalidatePath("/buchhaltung/kautionen");
  for (const id of new Set(propertyIds)) {
    revalidatePath(`/objekte/${id}`);
    revalidatePath(`/objekte/${id}/zimmerplan`);
  }
  for (const id of new Set(tenantIds)) revalidatePath(`/mieter/${id}`);
}

/**
 * Person auf ein Bett ziehen.
 *
 *  - Hat sie schon ein Bett und das Ziel ist frei: Umzug, Vertrag und
 *    Forderungen bleiben (wie "Bett wechseln").
 *  - Hat sie ein Bett und im Ziel liegt jemand: die beiden tauschen.
 *  - Hat sie keins und wurde heute erst herausgenommen: das alte
 *    Mietverhaeltnis lebt wieder auf - nichts geht verloren.
 *  - Hat sie keins: neues Mietverhaeltnis ab heute mit Vertragsentwurf,
 *    Miete vom Bett, Kaution 200 Euro. Feinheiten auf der Mieterseite.
 */
export async function planVerschieben(angaben: { tenantId: string; bedId: string }): Promise<PlanAntwort> {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const jetzt = heute();

  const tenant = await prisma.tenant.findUnique({
    where: { id: angaben.tenantId },
    include: {
      tenancies: {
        where: { OR: [bewohntHeute(jetzt), { status: "ENDED", endDate: jetzt }] },
        include: { contract: { select: { status: true } }, bed: { include: { room: true } } },
        orderBy: { startDate: "desc" },
      },
    },
  });
  if (!tenant) return { ok: false, fehler: t("Mieter nicht gefunden.") };

  const bed = await prisma.bed.findUnique({
    where: { id: angaben.bedId },
    include: { room: { include: { property: true } } },
  });
  if (!bed || !bed.room.active || !bed.room.property.active) return { ok: false, fehler: t("Bett nicht gefunden.") };
  if (bed.status === "BLOCKED") return { ok: false, fehler: t("Dieses Bett ist gesperrt.") };
  const bettName = `${bed.room.name} · ${bed.label}`;
  const name = `${tenant.firstName} ${tenant.lastName}`.trim();

  const laufend = tenant.tenancies.find(
    (ty) =>
      ((BEWOHNT as readonly string[]).includes(ty.status) && (!ty.endDate || ty.endDate >= jetzt)) ||
      (ty.status === "ENDED" && ty.endDate && ty.endDate > jetzt),
  );
  const heuteBeendet = tenant.tenancies.find((ty) => ty.status === "ENDED" && ty.endDate?.getTime() === jetzt.getTime());

  // Wer liegt im Zielbett?
  const belegung = await prisma.tenancy.findFirst({
    where: {
      bedId: bed.id,
      ...bewohntHeute(jetzt),
      ...(laufend ? { id: { not: laufend.id } } : {}),
    },
    include: { tenant: { select: { id: true, firstName: true, lastName: true } } },
  });

  if (laufend) {
    if (laufend.bedId === bed.id) return { ok: false, fehler: t("Das ist bereits das aktuelle Bett.") };
    const vonBett = `${laufend.bed.room.name} · ${laufend.bed.label}`;

    if (belegung) {
      // Tausch: beide wechseln gleichzeitig, damit kein Bett doppelt belegt ist.
      await prisma.$transaction([
        prisma.tenancy.update({ where: { id: laufend.id }, data: { bedId: bed.id } }),
        prisma.tenancy.update({ where: { id: belegung.id }, data: { bedId: laufend.bedId } }),
      ]);
      const anderer = `${belegung.tenant.firstName} ${belegung.tenant.lastName}`.trim();
      await audit(user.email, "swap", "Tenancy", laufend.id, `${vonBett} ⇄ ${bettName} mit ${anderer}`);
      pfadeAuffrischen([bed.room.propertyId, laufend.bed.room.propertyId], [tenant.id, belegung.tenant.id]);
      return { ok: true, meldung: t("{name} und {anderer} haben getauscht: {a} ⇄ {b}.", { name, anderer, a: vonBett, b: bettName }) };
    }

    const konflikt = await findConflictingTenancy({ bedId: bed.id, startDate: laufend.startDate, endDate: laufend.endDate, excludeTenancyId: laufend.id });
    if (konflikt) {
      return { ok: false, fehler: t("Das Bett ist im Zeitraum bereits belegt: {name}.", { name: `${konflikt.tenant.firstName} ${konflikt.tenant.lastName}` }) };
    }
    await prisma.tenancy.update({ where: { id: laufend.id }, data: { bedId: bed.id } });
    await audit(user.email, "move", "Tenancy", laufend.id, `${vonBett} → ${bettName}`);
    pfadeAuffrischen([bed.room.propertyId, laufend.bed.room.propertyId], [tenant.id]);
    return { ok: true, meldung: t("{name} umgezogen: {a} → {b}. Vertrag und Forderungen bleiben.", { name, a: vonBett, b: bettName }) };
  }

  if (belegung) {
    return { ok: false, fehler: t("{bett} ist belegt. Zum Tauschen die Person mit Bett auf das andere Bett ziehen.", { bett: bettName }) };
  }

  if (heuteBeendet) {
    // Heute herausgenommen, heute wieder eingesetzt: nichts verloren.
    const vertrag = heuteBeendet.contract?.status;
    const status = vertrag === "SIGNED" ? "ACTIVE" : vertrag === "SENT" ? "SENT" : "DRAFT";
    await prisma.tenancy.update({ where: { id: heuteBeendet.id }, data: { bedId: bed.id, endDate: null, status } });
    await ensureRentCharges({ tenancyId: heuteBeendet.id });
    await forderungenAbgleichen(heuteBeendet.id);
    await audit(user.email, "reactivate", "Tenancy", heuteBeendet.id, bettName);
    pfadeAuffrischen([bed.room.propertyId, heuteBeendet.bed.room.propertyId], [tenant.id]);
    return { ok: true, meldung: t("{name} wieder eingesetzt: {bett}. Das Mietverhältnis läuft weiter.", { name, bett: bettName }) };
  }

  const konflikt = await findConflictingTenancy({ bedId: bed.id, startDate: jetzt, endDate: null });
  if (konflikt) {
    return { ok: false, fehler: t("Das Bett ist im Zeitraum bereits belegt: {name}.", { name: `${konflikt.tenant.firstName} ${konflikt.tenant.lastName}` }) };
  }
  const tenancy = await prisma.tenancy.create({
    data: {
      tenantId: tenant.id,
      bedId: bed.id,
      startDate: jetzt,
      monthlyRentCents: bed.monthlyRentCents,
      depositCents: 20000,
      reference: await nextReference(jetzt),
      status: "DRAFT",
      contract: { create: { contractNumber: await nextContractNumber(jetzt), token: randomToken(), status: "DRAFT" } },
    },
  });
  await audit(user.email, "create", "Tenancy", tenancy.id, `${tenancy.reference} (Zimmerplan)`);
  pfadeAuffrischen([bed.room.propertyId], [tenant.id]);
  revalidatePath("/vertraege");
  return {
    ok: true,
    meldung: t("{name} auf {bett} gesetzt – Vertragsentwurf ab heute mit {miete} und 200,00 € Kaution. Anpassen auf der Mieterseite.", {
      name,
      bett: bettName,
      miete: formatCents(bed.monthlyRentCents),
    }),
  };
}

/**
 * Person aus dem Zimmer nehmen - sie landet rechts unter "Ohne Bett".
 * Ein Entwurf ohne Zahlung wird geloescht; alles andere endet heute,
 * der letzte Monat wird tageweise gekuerzt. Wer heute noch ein anderes
 * Bett bekommt, behaelt sein Mietverhaeltnis (siehe planVerschieben).
 */
export async function planEntfernen(angaben: { tenancyId: string }): Promise<PlanAntwort> {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const jetzt = heute();

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: angaben.tenancyId },
    include: {
      tenant: { select: { id: true, firstName: true, lastName: true } },
      contract: { select: { status: true } },
      bed: { include: { room: true } },
      charges: { select: { status: true, allocations: { select: { id: true } } } },
    },
  });
  const wohntNoch =
    tenancy &&
    ((BEWOHNT as readonly string[]).includes(tenancy.status) || (tenancy.status === "ENDED" && tenancy.endDate && tenancy.endDate > jetzt));
  if (!tenancy || !wohntNoch) return { ok: false, fehler: t("Mietverhältnis nicht gefunden.") };
  const name = `${tenancy.tenant.firstName} ${tenancy.tenant.lastName}`.trim();
  const bettName = `${tenancy.bed.room.name} · ${tenancy.bed.label}`;

  const verbucht = tenancy.charges.some((c) => c.status === "PAID" || c.allocations.length > 0);
  if (tenancy.status === "DRAFT" && tenancy.contract?.status !== "SIGNED" && !verbucht) {
    await prisma.tenancy.delete({ where: { id: tenancy.id } });
    await audit(user.email, "delete", "Tenancy", tenancy.id, `${bettName} (Zimmerplan)`);
    pfadeAuffrischen([tenancy.bed.room.propertyId], [tenancy.tenant.id]);
    return { ok: true, meldung: t("{name} aus {bett} genommen – der Vertragsentwurf wurde gelöscht.", { name, bett: bettName }) };
  }

  const endDate = tenancy.startDate > jetzt ? tenancy.startDate : jetzt;
  await prisma.tenancy.update({ where: { id: tenancy.id }, data: { endDate, status: "ENDED" } });
  const abgleich = await forderungenAbgleichen(tenancy.id);
  await audit(user.email, "end", "Tenancy", tenancy.id, `${bettName} (Zimmerplan)`);
  pfadeAuffrischen([tenancy.bed.room.propertyId], [tenancy.tenant.id]);
  const zusatz = abgleich.gekuerzt
    ? " " + t("Letzter Monat auf {tage} Tage gekürzt: {nachher} statt {vorher}.", { tage: abgleich.gekuerzt.tage, nachher: formatCents(abgleich.gekuerzt.nachher), vorher: formatCents(abgleich.gekuerzt.vorher) })
    : "";
  return { ok: true, meldung: t("{name} aus {bett} genommen – Mietverhältnis endet heute. Bis heute Abend wieder einsetzen, und es läuft weiter.", { name, bett: bettName }) + zusatz };
}
