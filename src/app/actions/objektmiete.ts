"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { cents, date, flash, int, optionalStr, str } from "@/lib/form";
import { uebersetzer } from "@/lib/i18n";

const SEITE = "/buchhaltung/mieten-zahlen";

function felder(formData: FormData) {
  return {
    propertyId: str(formData, "propertyId"),
    bezeichnung: optionalStr(formData, "bezeichnung"),
    vermieter: str(formData, "vermieter"),
    betragCents: cents(formData, "betrag", 0),
    faelligArt: str(formData, "faelligArt") === "TAG" ? "TAG" : "WERKTAG",
    faelligTag: Math.min(Math.max(int(formData, "faelligTag", 3), 1), 31),
    beginn: date(formData, "beginn"),
    ende: date(formData, "ende"),
    suchbegriffe: optionalStr(formData, "suchbegriffe"),
    kennung: optionalStr(formData, "kennung"),
    vertragUrl: optionalStr(formData, "vertragUrl"),
    notizen: optionalStr(formData, "notizen"),
  };
}

function aktualisieren() {
  revalidatePath(SEITE);
  revalidatePath("/");
}

export async function objektmieteAnlegen(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const d = felder(formData);
  if (!d.propertyId || !d.vermieter || d.betragCents <= 0 || !d.beginn) {
    redirect(flash(SEITE, "fehler", t("Objekt, Vermieter, Betrag und Mietbeginn sind nötig.")));
  }
  const neu = await prisma.objektmiete.create({ data: { ...d, beginn: d.beginn } });
  await audit(user.email, "create", "Objektmiete", neu.id, `${d.vermieter} ${d.betragCents}`);
  aktualisieren();
  redirect(flash(SEITE, "ok", t("Mietvertrag mit {name} wurde angelegt.", { name: d.vermieter })));
}

export async function objektmieteSpeichern(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");
  const d = felder(formData);
  if (!id || !d.propertyId || !d.vermieter || d.betragCents <= 0 || !d.beginn) {
    redirect(flash(SEITE, "fehler", t("Objekt, Vermieter, Betrag und Mietbeginn sind nötig.")));
  }
  await prisma.objektmiete.update({ where: { id }, data: { ...d, beginn: d.beginn } });
  await audit(user.email, "update", "Objektmiete", id);
  aktualisieren();
  redirect(flash(SEITE, "ok", t("Mietvertrag wurde gespeichert.")));
}

export async function objektmieteLoeschen(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");
  await prisma.objektmiete.delete({ where: { id } });
  await audit(user.email, "delete", "Objektmiete", id);
  aktualisieren();
  redirect(flash(SEITE, "ok", t("Mietvertrag wurde entfernt.")));
}
