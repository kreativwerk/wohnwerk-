"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROLES, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { anmeldeLink, einladungMail, mailAbsender } from "@/lib/login-code";
import { sendMail } from "@/lib/mail";
import crypto from "node:crypto";
import { flash, str } from "@/lib/form";
import { DEFAULT_SETTINGS, saveSettings, type AppSettings } from "@/lib/settings";
import { unterschriftFreistellen } from "@/lib/unterschrift-bild";
import { uebersetzer } from "@/lib/i18n";

const KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>;

export async function updateSettings(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();

  const patch: Partial<AppSettings> = {};
  for (const key of KEYS) {
    if (formData.has(key)) patch[key] = str(formData, key);
  }

  await saveSettings(patch);
  await audit(user.email, "update", "Settings", null, Object.keys(patch).join(", "));

  revalidatePath("/einstellungen");
  revalidatePath("/vertraege");
  redirect(flash("/einstellungen", "ok", t("Einstellungen wurden gespeichert.")));
}

/**
 * Unterschrift der Hausverwaltung hochladen - als Bild (PNG, JPG). Sie
 * wird freigestellt und landet in der Wohnungsgeberbestaetigung im Feld
 * "Unterschrift des Wohnungsgebers", wenn der Vordruck ein solches Feld
 * hat und es dem Platzhalter zugeordnet ist.
 */
export async function uploadLandlordSignature(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const datei = formData.get("file");
  if (!(datei instanceof File) || datei.size === 0) {
    redirect(flash("/einstellungen", "fehler", t("Bitte eine Bilddatei mit der Unterschrift auswählen.")));
  }
  if (datei.size > 5 * 1024 * 1024) {
    redirect(flash("/einstellungen", "fehler", t("Das Bild ist größer als 5 MB.")));
  }
  let dataUrl: string;
  try {
    dataUrl = await unterschriftFreistellen(Buffer.from(await datei.arrayBuffer()));
  } catch {
    redirect(flash("/einstellungen", "fehler", t("Das Bild konnte nicht gelesen werden – bitte PNG oder JPG verwenden.")));
  }
  await saveSettings({ landlordSignature: dataUrl });
  await audit(user.email, "update", "Settings", null, "landlordSignature");
  revalidatePath("/einstellungen");
  redirect(flash("/einstellungen", "ok", t("Unterschrift gespeichert. Sie erscheint ab jetzt in der Wohnungsgeberbestätigung.")));
}

export async function removeLandlordSignature() {
  const t = await uebersetzer();
  const user = await requireAdmin();
  await saveSettings({ landlordSignature: "" });
  await audit(user.email, "update", "Settings", null, "landlordSignature entfernt");
  revalidatePath("/einstellungen");
  redirect(flash("/einstellungen", "ok", t("Unterschrift entfernt.")));
}

export async function createUser(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();

  const email = str(formData, "email").toLowerCase();
  const name = str(formData, "name");
  const password = str(formData, "password");
  const roleRaw = str(formData, "role");
  // Nur bekannte Rollen; alles Unerwartete wird zur Verwaltungsrolle.
  const role =
    roleRaw === ROLES.STEUERBERATER ? ROLES.STEUERBERATER : roleRaw === ROLES.BANK ? ROLES.BANK : ROLES.ADMIN;
  const back = "/einstellungen";

  if (!email || !name || password.length < 10) {
    redirect(flash(back, "fehler", t("Name, E-Mail und ein Passwort mit mindestens 10 Zeichen sind nötig.")));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect(flash(back, "fehler", t("Diese E-Mail-Adresse wird bereits verwendet.")));

  await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(password), role },
  });

  await audit(user.email, "create", "User", null, email);
  revalidatePath(back);
  redirect(flash(back, "ok", t("Zugang für {name} wurde angelegt.", { name })));
}

export async function changePassword(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();

  const password = str(formData, "password");
  const back = "/einstellungen";

  if (password.length < 10) {
    redirect(flash(back, "fehler", t("Das Passwort muss mindestens 10 Zeichen haben.")));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password) },
  });

  await audit(user.email, "change-password", "User", user.id);
  revalidatePath(back);
  redirect(flash(back, "ok", t("Passwort wurde geändert.")));
}

export async function deactivateUser(formData: FormData) {
  const t = await uebersetzer();
  const actor = await requireAdmin();
  const id = str(formData, "id");
  const back = "/einstellungen";

  if (id === actor.id) {
    redirect(flash(back, "fehler", t("Das eigene Konto kann nicht deaktiviert werden.")));
  }

  await prisma.user.update({ where: { id }, data: { active: false } });
  await audit(actor.email, "deactivate", "User", id);
  revalidatePath(back);
  redirect(flash(back, "ok", t("Zugang wurde deaktiviert.")));
}

/**
 * Bankberater einladen: Zugang ohne Passwort anlegen und die Einladung per
 * E-Mail schicken. Angemeldet wird spaeter mit einem Code per E-Mail.
 */
export async function bankberaterEinladen(formData: FormData) {
  const t = await uebersetzer();
  const actor = await requireAdmin();
  const back = "/einstellungen";
  const email = str(formData, "email").toLowerCase();
  const name = str(formData, "name");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(flash(back, "fehler", t("Bitte Name und eine gültige E-Mail-Adresse angeben.")));
  }

  const vorhanden = await prisma.user.findUnique({ where: { email } });
  if (vorhanden && vorhanden.role !== ROLES.BANK) {
    redirect(flash(back, "fehler", t("Diese E-Mail-Adresse wird bereits verwendet.")));
  }
  const user = vorhanden
    ? await prisma.user.update({ where: { id: vorhanden.id }, data: { name, active: true } })
    : await prisma.user.create({
        // Kein Passwort: ein zufaelliger Wert, den niemand kennt - die
        // Anmeldung laeuft ausschliesslich ueber den E-Mail-Code.
        data: { email, name, role: ROLES.BANK, passwordHash: hashPassword(crypto.randomBytes(32).toString("base64url")) },
      });
  await audit(actor.email, vorhanden ? "update" : "create", "User", user.id, `Bank-Zugang ${email}`);
  revalidatePath(back);
  await einladungVerschicken(user.id, back);
}

export async function bankEinladungErneut(formData: FormData) {
  await requireAdmin();
  await einladungVerschicken(str(formData, "id"), "/einstellungen");
}

async function einladungVerschicken(userId: string, back: string): Promise<never> {
  const t = await uebersetzer();
  const actor = await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== ROLES.BANK || !user.active) {
    redirect(flash(back, "fehler", t("Nur aktive Bank-Zugänge können eingeladen werden.")));
  }
  const link = await anmeldeLink(user.email);
  const ergebnis = await sendMail({ to: user.email, ...einladungMail({ name: user.name, link, ...(await mailAbsender()) }) });
  await audit(actor.email, "invite", "User", user.id, ergebnis.sent ? `Einladung an ${user.email} verschickt` : `Einladung nicht verschickt: ${ergebnis.message}`);
  if (!ergebnis.sent) {
    redirect(
      flash(
        back,
        "fehler",
        t("Zugang für {name} ist angelegt, aber die E-Mail ging nicht raus: {grund} Bitte das Postfach unten verbinden und „Einladung erneut senden“ drücken – oder diesen Link selbst schicken: {link}", {
          name: user.name,
          grund: ergebnis.message,
          link,
        }),
      ),
    );
  }
  redirect(flash(back, "ok", t("Einladung an {email} verschickt. Die Anmeldung läuft über einen Code per E-Mail.", { email: user.email })));
}
