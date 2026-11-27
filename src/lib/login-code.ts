import "server-only";

import crypto from "node:crypto";

import { hashPassword, ROLES, verifyPassword, type SessionUser } from "./auth";
import { prisma } from "./db";
import { sendMail } from "./mail";
import { getSettings } from "./settings";
import { CODE_GUELTIG_MINUTEN, codeMail, LOGO_CID } from "./login-mails";
import { LOGO_HELL_PNG_BASE64 } from "./logo-png";

export { CODE_GUELTIG_MINUTEN, codeMail, einladungMail } from "./login-mails";

/**
 * Anmeldung per E-Mail-Code fuer den Bank-Zugang: kein Passwort, sondern ein
 * sechsstelliger Code, der bei jeder Anmeldung an die hinterlegte Adresse
 * geht. Gespeichert wird nur der Hash; ein Code gilt 10 Minuten, einmal,
 * und laesst hoechstens 5 Fehlversuche zu.
 */

const MAX_VERSUCHE = 5;
const MAX_CODES_PRO_STUNDE = 5;

/** Wer darf sich per Code anmelden? Nur aktive Bank-Zugaenge. */
async function codeBerechtigt(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  return user && user.active && user.role === ROLES.BANK ? user : null;
}

export function neuerCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** "123 456" -> "123456"; alles ausser Ziffern faellt weg. */
export function codeBereinigen(eingabe: string): string {
  return eingabe.replace(/\D/g, "").slice(0, 6);
}

/** Das Logo als eingebettetes Bild fuer die HTML-Mails. */
export async function logoEingebettet() {
  const settings = await getSettings();
  const basis = (settings.appUrl || "https://wohnwerk.vercel.app").replace(/\/+$/, "");
  return [
    {
      cid: LOGO_CID,
      dateiname: "wohnwerk-logo.png",
      mimeType: "image/png",
      daten: Buffer.from(LOGO_HELL_PNG_BASE64, "base64"),
      oeffentlicheUrl: `${basis}/email-logo.png`,
    },
  ];
}

export async function anmeldeLink(email?: string): Promise<string> {
  const settings = await getSettings();
  const basis = (settings.appUrl || "https://wohnwerk.vercel.app").replace(/\/+$/, "");
  return `${basis}/bank/anmelden${email ? `?email=${encodeURIComponent(email)}` : ""}`;
}

export type CodeAnforderung = "gesendet" | "unbekannt" | "zu_oft" | "versand_fehlgeschlagen";

/**
 * Schickt einen neuen Code. Fuer unbekannte Adressen passiert nichts - die
 * Seite sagt in jedem Fall dasselbe, damit niemand ausprobieren kann, welche
 * Adressen freigeschaltet sind.
 */
export async function codeAnfordern(email: string): Promise<CodeAnforderung> {
  const user = await codeBerechtigt(email);
  if (!user) return "unbekannt";

  const letzteStunde = await prisma.loginCode.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (letzteStunde >= MAX_CODES_PRO_STUNDE) return "zu_oft";

  const code = neuerCode();
  // Ein neuer Code macht alle aelteren ungueltig.
  await prisma.loginCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.loginCode.create({
    data: {
      userId: user.id,
      codeHash: hashPassword(code),
      expiresAt: new Date(Date.now() + CODE_GUELTIG_MINUTEN * 60 * 1000),
    },
  });

  const mail = codeMail({ name: user.name, code, ...(await mailAbsender()) });
  const ergebnis = await sendMail({ to: user.email, ...mail, inline: await logoEingebettet() });
  if (!ergebnis.sent) {
    console.error("[bank-code] Versand fehlgeschlagen:", ergebnis.message);
    return "versand_fehlgeschlagen";
  }
  return "gesendet";
}

/** Prueft den Code; bei Erfolg ist er verbraucht und der Benutzer angemeldet. */
export async function codePruefen(email: string, eingabe: string): Promise<SessionUser | null> {
  const user = await codeBerechtigt(email);
  const code = codeBereinigen(eingabe);
  if (!user || code.length !== 6) return null;

  const offen = await prisma.loginCode.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!offen || offen.attempts >= MAX_VERSUCHE) return null;

  if (!verifyPassword(code, offen.codeHash)) {
    const versuche = offen.attempts + 1;
    await prisma.loginCode.update({
      where: { id: offen.id },
      // Nach dem letzten Fehlversuch ist der Code verbraucht.
      data: { attempts: versuche, ...(versuche >= MAX_VERSUCHE ? { usedAt: new Date() } : {}) },
    });
    return null;
  }

  await prisma.loginCode.update({ where: { id: offen.id }, data: { usedAt: new Date() } });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Absenderzeile unten in den Mails: Firma, Anschrift, Kontakt. */
export async function mailAbsender(): Promise<{ absender: string; fuss: string }> {
  const s = await getSettings();
  const absender = s.companyName || "Wohnwerk";
  const fuss = [absender, s.companyStreet, [s.companyZip, s.companyCity].filter(Boolean).join(" "), s.companyEmail].filter(Boolean).join(" · ");
  return { absender, fuss };
}

