"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { flash, str } from "@/lib/form";
import { DEFAULT_SETTINGS, saveSettings, type AppSettings } from "@/lib/settings";

const KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>;

export async function updateSettings(formData: FormData) {
  const user = await requireUser();

  const patch: Partial<AppSettings> = {};
  for (const key of KEYS) {
    if (formData.has(key)) patch[key] = str(formData, key);
  }

  await saveSettings(patch);
  await audit(user.email, "update", "Settings", null, Object.keys(patch).join(", "));

  revalidatePath("/einstellungen");
  revalidatePath("/vertraege");
  redirect(flash("/einstellungen", "ok", "Einstellungen wurden gespeichert."));
}

export async function createUser(formData: FormData) {
  const user = await requireUser();

  const email = str(formData, "email").toLowerCase();
  const name = str(formData, "name");
  const password = str(formData, "password");
  const back = "/einstellungen";

  if (!email || !name || password.length < 10) {
    redirect(flash(back, "fehler", "Name, E-Mail und ein Passwort mit mindestens 10 Zeichen sind nötig."));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect(flash(back, "fehler", "Diese E-Mail-Adresse wird bereits verwendet."));

  await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(password), role: "admin" },
  });

  await audit(user.email, "create", "User", null, email);
  revalidatePath(back);
  redirect(flash(back, "ok", `Zugang für ${name} wurde angelegt.`));
}

export async function changePassword(formData: FormData) {
  const user = await requireUser();

  const password = str(formData, "password");
  const back = "/einstellungen";

  if (password.length < 10) {
    redirect(flash(back, "fehler", "Das Passwort muss mindestens 10 Zeichen haben."));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password) },
  });

  await audit(user.email, "change-password", "User", user.id);
  revalidatePath(back);
  redirect(flash(back, "ok", "Passwort wurde geändert."));
}

export async function deactivateUser(formData: FormData) {
  const actor = await requireUser();
  const id = str(formData, "id");
  const back = "/einstellungen";

  if (id === actor.id) {
    redirect(flash(back, "fehler", "Das eigene Konto kann nicht deaktiviert werden."));
  }

  await prisma.user.update({ where: { id }, data: { active: false } });
  await audit(actor.email, "deactivate", "User", id);
  revalidatePath(back);
  redirect(flash(back, "ok", "Zugang wurde deaktiviert."));
}
