"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { flash, optionalStr, str } from "@/lib/form";
import { uebersetzer } from "@/lib/i18n";
import { MAHN_SPRACHEN, type MahnSprache } from "@/lib/mahnung";
import { MIETER_DOKUMENT_ARTEN } from "@/lib/mieterdokumente";
import {
  anhangAlsBeleg,
  anhangZumMieter,
  gespeichertesPasswort,
  postfachAbrufen,
  postfachSenden,
  postfachTesten,
  postfachTestMerken,
  postfachZugang,
  postfachZugangEntfernen,
  postfachZugangSpeichern,
  zugangAusEingabe,
  type SendeAnhang,
} from "@/lib/postfach";
import { adressenLesen } from "@/lib/postfach-regeln";

function ruecksprung(back: string, vorgabe: string): string {
  return back.startsWith("/") && !back.startsWith("//") ? back : vorgabe;
}

function auffrischen() {
  revalidatePath("/postfach");
  revalidatePath("/buchhaltung");
  revalidatePath("/buchhaltung/belege");
  revalidatePath("/einstellungen");
}

/** Einstellungen: Postfach eintragen - wird erst gespeichert, wenn die Anmeldung klappt. */
export async function postfachZugangSichern(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const benutzer = str(formData, "benutzer");
  const passwort = str(formData, "passwort") || (await gespeichertesPasswort()) || "";
  if (!benutzer || !passwort) {
    redirect(flash("/einstellungen?bereich=postfach#postfach", "fehler", t("Bitte E-Mail-Adresse und Passwort des Postfachs eintragen.")));
  }

  const zugang = zugangAusEingabe({
    anbieter: str(formData, "anbieter"),
    benutzer,
    passwort,
    absenderName: str(formData, "absenderName"),
    imapHost: str(formData, "imapHost"),
    imapPort: str(formData, "imapPort"),
    smtpHost: str(formData, "smtpHost"),
    smtpPort: str(formData, "smtpPort"),
  });
  if (!zugang.imapHost) {
    redirect(flash("/einstellungen?bereich=postfach#postfach", "fehler", t("Bitte den Anbieter wählen oder den IMAP-Server eintragen.")));
  }

  const test = await postfachTesten(zugang);
  await postfachTestMerken({ ok: test.ok, fehler: test.fehler ?? null, benutzer: zugang.benutzer, anbieter: zugang.anbieter, imapHost: zugang.imapHost });
  if (!test.ok) redirect(flash("/einstellungen?bereich=postfach#postfach", "fehler", t(test.fehler ?? "Die Verbindung zum Postfach ist fehlgeschlagen.")));

  await postfachZugangSpeichern(zugang);
  await audit(user.email, "update", "Settings", null, `Postfach ${zugang.benutzer}`);
  const ergebnis = await postfachAbrufen(user.email, { hoechstens: 25 });
  auffrischen();
  redirect(
    flash(
      "/einstellungen?bereich=postfach#postfach",
      "ok",
      t("Postfach verbunden: {neu} E-Mail(s) abgeholt, {belege} Beleg(e) abgelegt.", { neu: ergebnis.neu, belege: ergebnis.belege }),
    ),
  );
}

export async function postfachZugangLoeschen() {
  const t = await uebersetzer();
  const user = await requireAdmin();
  await postfachZugangEntfernen();
  await audit(user.email, "delete", "Settings", null, "Postfach-Zugang");
  auffrischen();
  redirect(flash("/einstellungen?bereich=postfach#postfach", "ok", t("Postfach-Zugang entfernt. Bereits abgeholte E-Mails bleiben in der App.")));
}

/** Knopf "Jetzt abrufen". */
export async function postfachJetztAbrufen(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const back = ruecksprung(str(formData, "back"), "/postfach");
  const ergebnis = await postfachAbrufen(user.email, { hoechstens: 30 });
  auffrischen();
  if (!ergebnis.ok) redirect(flash(back, "fehler", t(ergebnis.fehler ?? "Das Postfach konnte nicht abgerufen werden.")));
  redirect(
    flash(
      back,
      "ok",
      t("{neu} neue E-Mail(s), {belege} Beleg(e) abgelegt, {zugeordnet} Buchung(en) zugeordnet.", {
        neu: ergebnis.neu,
        belege: ergebnis.belege,
        zugeordnet: ergebnis.belegeZugeordnet + ergebnis.nachZugeordnet,
      }) + (ergebnis.weitere ? ` ${t("Weitere E-Mails folgen beim nächsten Abruf.")}` : ""),
    ),
  );
}

export async function emailErledigt(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const erledigt = str(formData, "erledigt") === "1";
  await prisma.emailNachricht.update({ where: { id }, data: { erledigt, gelesen: true } });
  revalidatePath("/postfach");
  redirect(ruecksprung(str(formData, "back"), `/postfach/${id}`));
}

export async function emailUngelesen(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  await prisma.emailNachricht.update({ where: { id }, data: { gelesen: false } });
  revalidatePath("/postfach");
  redirect("/postfach");
}

/** Mail einem Mieter zuordnen - steht dann auch im Profil. */
export async function emailMieterZuordnen(formData: FormData) {
  const t = await uebersetzer();
  await requireAdmin();
  const id = str(formData, "id");
  const tenantId = optionalStr(formData, "tenantId");
  await prisma.emailNachricht.update({ where: { id }, data: { tenantId } });
  revalidatePath("/postfach");
  if (tenantId) revalidatePath(`/mieter/${tenantId}`);
  redirect(flash(`/postfach/${id}`, "ok", tenantId ? t("Dem Mieter zugeordnet.") : t("Zuordnung entfernt.")));
}

export async function emailAnhangAlsBeleg(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const nachrichtId = str(formData, "nachrichtId");
  const ergebnis = await anhangAlsBeleg(str(formData, "anhangId"), optionalStr(formData, "bankTransactionId"));
  if (ergebnis.ok) await audit(user.email, "upload", "Document", null, `Beleg aus E-Mail: ${ergebnis.meldung}`);
  auffrischen();
  redirect(flash(`/postfach/${nachrichtId}`, ergebnis.ok ? "ok" : "fehler", t(ergebnis.meldung)));
}

export async function emailAnhangZumMieter(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const nachrichtId = str(formData, "nachrichtId");
  const tenantId = str(formData, "tenantId");
  if (!tenantId) redirect(flash(`/postfach/${nachrichtId}`, "fehler", t("Bitte einen Mieter wählen.")));
  const artRoh = str(formData, "art");
  const art = (MIETER_DOKUMENT_ARTEN as readonly string[]).includes(artRoh) ? artRoh : "Sonstiges";
  const ergebnis = await anhangZumMieter(str(formData, "anhangId"), tenantId, art);
  if (ergebnis.ok) await audit(user.email, "upload", "Document", null, ergebnis.meldung);
  revalidatePath(`/mieter/${tenantId}`);
  auffrischen();
  redirect(flash(`/postfach/${nachrichtId}`, ergebnis.ok ? "ok" : "fehler", t(ergebnis.meldung)));
}

const MAX_ANHANG = 15 * 1024 * 1024;

/** Neue Mail oder Antwort senden. */
export async function emailSenden(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const antwortAufId = optionalStr(formData, "antwortAufId");
  const zurueck = antwortAufId ? `/postfach/${antwortAufId}` : "/postfach/neu";

  const an = adressenLesen(str(formData, "an"));
  const cc = adressenLesen(str(formData, "cc"));
  const betreff = str(formData, "betreff");
  const text = String(formData.get("text") ?? "");
  if (an.length === 0) redirect(flash(zurueck, "fehler", t("Bitte eine gültige Empfänger-Adresse eintragen.")));
  if (!betreff) redirect(flash(zurueck, "fehler", t("Bitte einen Betreff eintragen.")));

  const anhaenge: SendeAnhang[] = [];
  let summe = 0;
  for (const datei of formData.getAll("dateien")) {
    if (!(datei instanceof File) || datei.size === 0) continue;
    summe += datei.size;
    if (summe > MAX_ANHANG) redirect(flash(zurueck, "fehler", t("Anhänge zusammen höchstens 15 MB.")));
    anhaenge.push({ dateiname: datei.name, mimeType: datei.type || "application/octet-stream", daten: Buffer.from(await datei.arrayBuffer()) });
  }

  const ergebnis = await postfachSenden({
    an,
    cc,
    betreff,
    text,
    antwortAufId,
    tenantId: optionalStr(formData, "tenantId"),
    anhaenge,
    ausgeloestVon: user.email,
  });
  if (!ergebnis.ok) redirect(flash(zurueck, "fehler", t(ergebnis.fehler ?? "Senden fehlgeschlagen.")));
  revalidatePath("/postfach");
  redirect(flash(`/postfach/${ergebnis.nachrichtId}`, "ok", t("E-Mail wurde gesendet.")));
}

/**
 * Aus dem Nachricht-Fenster: Erinnerung, Mahnung oder Kautionsabrechnung
 * per E-Mail an den Mieter. Wird wie WhatsApp/Kopieren vermerkt.
 */
export async function nachrichtPerEmail(angaben: {
  tenantId: string;
  sprache: string;
  text: string;
  betreff: string;
  betragCents: number;
  art: "RUECKSTAND" | "MAHNUNG" | "KAUTION";
}): Promise<{ ok: boolean; fehler?: string; sentAt?: string; an?: string }> {
  const user = await requireAdmin();
  if (!(await postfachZugang())) return { ok: false, fehler: "Kein Postfach eingerichtet (Einstellungen → Postfach)." };
  const mieter = await prisma.tenant.findUnique({ where: { id: angaben.tenantId }, select: { email: true } });
  const an = adressenLesen(mieter?.email ?? "");
  if (an.length === 0) return { ok: false, fehler: "Beim Mieter ist keine E-Mail-Adresse hinterlegt." };

  const ergebnis = await postfachSenden({
    an,
    betreff: angaben.betreff.slice(0, 200),
    text: angaben.text,
    tenantId: angaben.tenantId,
    ausgeloestVon: user.email,
  });
  if (!ergebnis.ok) return { ok: false, fehler: ergebnis.fehler };

  const sprache: string = [...MAHN_SPRACHEN, "de"].includes(angaben.sprache as MahnSprache) ? angaben.sprache : "sq";
  const eintrag = await prisma.reminderLog.create({
    data: {
      tenantId: angaben.tenantId,
      channel: "EMAIL",
      language: sprache,
      amountCents: Math.max(0, Math.round(angaben.betragCents)),
      actor: user.email,
      kind: ["RUECKSTAND", "MAHNUNG", "KAUTION"].includes(angaben.art) ? angaben.art : "RUECKSTAND",
    },
  });
  revalidatePath("/buchhaltung/mieteingaenge");
  revalidatePath("/buchhaltung/rueckstaende");
  revalidatePath(`/mieter/${angaben.tenantId}`);
  return { ok: true, sentAt: eintrag.sentAt.toISOString(), an: an.join(", ") };
}
