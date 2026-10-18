"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { flash, optionalCents, str } from "@/lib/form";
import { istKautionGrund } from "@/lib/mahnung";
import { uebersetzer } from "@/lib/i18n";

/** Zurueck zur Notizkarte des Mieters - der Anker haelt die Stelle. */
function zurueck(tenantId: string): string {
  return `/mieter/${tenantId}#notizen`;
}

/**
 * Legt eine Notiz zum Bewohner an. Mit Grund und Betrag ist sie ein
 * Kautionsabzug, der beim Auszug aufpoppt und in die Abrechnung wandert.
 */
export async function addTenantNote(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const tenantId = str(formData, "tenantId");
  const text = str(formData, "text");
  const grundRoh = str(formData, "grund");
  const grund = istKautionGrund(grundRoh) ? grundRoh : null;
  const betrag = grund ? optionalCents(formData, "amountCents") : null;

  if (!text && !grund) redirect(flash(zurueck(tenantId), "fehler", t("Bitte einen Text für die Notiz eingeben.")));
  if (grund && (!betrag || betrag <= 0)) {
    redirect(flash(zurueck(tenantId), "fehler", t("Für einen Kautionsabzug bitte einen Betrag eingeben.")));
  }

  const notiz = await prisma.tenantNote.create({
    data: { tenantId, text, grund, amountCents: betrag, author: user.email },
  });

  await audit(user.email, "create", "TenantNote", notiz.id, grund ? `${grund} ${betrag}` : text.slice(0, 80));
  revalidatePath(`/mieter/${tenantId}`);
  redirect(flash(zurueck(tenantId), "ok", grund ? t("Kautionsabzug wurde notiert.") : t("Notiz wurde gespeichert.")));
}

/** Verrechnet / wieder offen - verrechnete Abzuege poppen beim Auszug nicht mehr auf. */
export async function toggleTenantNoteDone(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const notiz = await prisma.tenantNote.findUnique({ where: { id } });
  if (!notiz) redirect("/mieter");

  await prisma.tenantNote.update({ where: { id }, data: { erledigt: !notiz.erledigt } });
  await audit(user.email, notiz.erledigt ? "reopen" : "settle", "TenantNote", id);
  revalidatePath(`/mieter/${notiz.tenantId}`);
  redirect(zurueck(notiz.tenantId));
}

export async function deleteTenantNote(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");
  const notiz = await prisma.tenantNote.findUnique({ where: { id } });
  if (!notiz) redirect("/mieter");

  await prisma.tenantNote.delete({ where: { id } });
  await audit(user.email, "delete", "TenantNote", id, notiz.text.slice(0, 80));
  revalidatePath(`/mieter/${notiz.tenantId}`);
  redirect(flash(zurueck(notiz.tenantId), "ok", t("Notiz wurde gelöscht.")));
}
