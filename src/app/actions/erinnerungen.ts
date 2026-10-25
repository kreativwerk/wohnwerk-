"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAHN_SPRACHEN, type MahnSprache } from "@/lib/mahnung";

/**
 * Vermerkt, dass eine Zahlungserinnerung rausging - beim Klick auf
 * Kopieren oder WhatsApp. Kein Beweis, dass sie ankam, aber genau das,
 * was die Hausverwaltung wissen will: "Habe ich den schon angeschrieben,
 * und wann?" Steht danach in der Zeile: "Nachricht gesendet am ...".
 */
export async function vermerkeNachricht(angaben: {
  tenantId: string;
  kanal: "WHATSAPP" | "COPY";
  sprache: string;
  betragCents: number;
  /** RUECKSTAND (Vorgabe), MAHNUNG (letzte Mahnung mit Anwalt-Hinweis) oder KAUTION fuer die Abrechnung beim Auszug. */
  art?: "RUECKSTAND" | "MAHNUNG" | "KAUTION";
}): Promise<{ sentAt: string }> {
  const user = await requireAdmin();
  const sprache: string = [...MAHN_SPRACHEN, "de"].includes(angaben.sprache as MahnSprache)
    ? angaben.sprache
    : "sq";
  const kanal = angaben.kanal === "WHATSAPP" ? "WHATSAPP" : "COPY";

  const eintrag = await prisma.reminderLog.create({
    data: {
      tenantId: angaben.tenantId,
      channel: kanal,
      language: sprache,
      amountCents: Math.max(0, Math.round(angaben.betragCents)),
      actor: user.email,
      kind: angaben.art === "KAUTION" || angaben.art === "MAHNUNG" ? angaben.art : "RUECKSTAND",
    },
  });

  revalidatePath("/buchhaltung/mieteingaenge");
  revalidatePath(`/mieter/${angaben.tenantId}`);
  return { sentAt: eintrag.sentAt.toISOString() };
}
