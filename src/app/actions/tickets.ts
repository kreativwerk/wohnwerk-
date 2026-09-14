"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { flash, optionalStr, str } from "@/lib/form";
import { FOLDER, uploadFile } from "@/lib/storage";
import { TICKET_ART, TICKET_PRIORITAET, TICKET_STATUS } from "@/lib/enums";
import { kontextText } from "@/lib/tickets";

const LISTE = "/tickets";

function refresh(ticketId?: string) {
  revalidatePath(LISTE);
  revalidatePath("/");
  if (ticketId) revalidatePath(`${LISTE}/${ticketId}`);
}

function geprueft(wert: string, erlaubt: readonly string[], vorgabe: string): string {
  return erlaubt.includes(wert) ? wert : vorgabe;
}

/**
 * Haengt eine Datei an ein Ticket. Fotos vom Handy sind der Normalfall,
 * PDFs (Kostenvoranschlag, Rechnung) genauso.
 *
 * Scheitert die Ablage, geht das Ticket trotzdem durch - der Text ist
 * das Wesentliche, das Bild die Beigabe.
 */
async function haengeDateiAn(
  ticketId: string,
  nummer: number,
  datei: File,
): Promise<string | null> {
  const puffer = Buffer.from(await datei.arrayBuffer());
  try {
    const abgelegt = await uploadFile({
      fileName: `Ticket-${nummer} ${datei.name}`,
      mimeType: datei.type || "application/octet-stream",
      data: puffer,
      folderSegments: ["Tickets", String(new Date().getFullYear())],
    });
    await prisma.document.create({
      data: {
        kind: "OTHER",
        title: `Ticket ${nummer}: ${datei.name}`,
        fileName: datei.name,
        mimeType: datei.type || "application/octet-stream",
        sizeBytes: puffer.byteLength,
        driveFileId: abgelegt.fileId,
        driveUrl: abgelegt.url,
        driveFolder: abgelegt.folder,
        localPath: abgelegt.localPath,
        documentDate: new Date(),
        category: "Ticket",
        ticketId,
      },
    });
    return null;
  } catch (error) {
    console.error("[ticket] Anhang konnte nicht abgelegt werden:", error);
    return (error as Error).message;
  }
}

/** Legt ein Ticket an; Anhang ist freiwillig. */
export async function createTicket(formData: FormData) {
  const user = await requireAdmin();
  const titel = str(formData, "titel");
  if (!titel) redirect(flash(LISTE, "fehler", "Bitte beschreiben Sie das Anliegen in einem Satz."));

  const ticket = await prisma.ticket.create({
    data: {
      art: "OBJEKT",
      titel,
      beschreibung: optionalStr(formData, "beschreibung"),
      prioritaet: geprueft(str(formData, "prioritaet"), TICKET_PRIORITAET, "NORMAL"),
      propertyId: optionalStr(formData, "propertyId"),
      tenantId: optionalStr(formData, "tenantId"),
      erstelltVon: user.name,
    },
  });

  let ablageFehler: string | null = null;
  const datei = formData.get("datei");
  if (datei instanceof File && datei.size > 0) {
    ablageFehler = await haengeDateiAn(ticket.id, ticket.nummer, datei);
  }

  await audit(user.email, "create", "Ticket", ticket.id, `#${ticket.nummer} ${titel}`);
  refresh(ticket.id);
  redirect(
    flash(
      `${LISTE}/${ticket.id}`,
      ablageFehler ? "fehler" : "ok",
      ablageFehler
        ? `Ticket #${ticket.nummer} wurde angelegt, der Anhang aber nicht gespeichert: ${ablageFehler}`
        : `Ticket #${ticket.nummer} wurde angelegt.`,
    ),
  );
}

/**
 * Meldet ein Problem mit dieser Anwendung an die IT.
 *
 * Anders als ein Objekt-Anliegen braucht so eine Meldung keine Zuordnung
 * zu Haus oder Mieter, dafuer aber den Kontext: auf welcher Seite es
 * auftrat und mit welchem Geraet. Den schickt das Formular automatisch
 * mit - sonst steht in jedem zweiten Ticket "geht nicht" und die IT muss
 * erst nachfragen.
 */
export async function createSupportTicket(formData: FormData) {
  const user = await requireAdmin();
  const titel = str(formData, "titel");
  const zurueck = str(formData, "back") || LISTE;
  if (!titel) {
    redirect(flash(zurueck, "fehler", "Bitte beschreiben Sie in einem Satz, was nicht stimmt."));
  }

  const ticket = await prisma.ticket.create({
    data: {
      art: "SUPPORT",
      titel,
      beschreibung: optionalStr(formData, "beschreibung"),
      prioritaet: geprueft(str(formData, "prioritaet"), TICKET_PRIORITAET, "NORMAL"),
      kontext: kontextText({
        seite: optionalStr(formData, "seite"),
        fenster: optionalStr(formData, "fenster"),
        browser: optionalStr(formData, "browser"),
      }),
      erstelltVon: user.name,
    },
  });

  let ablageFehler: string | null = null;
  const datei = formData.get("datei");
  if (datei instanceof File && datei.size > 0) {
    ablageFehler = await haengeDateiAn(ticket.id, ticket.nummer, datei);
  }

  await audit(user.email, "create", "Ticket", ticket.id, `#${ticket.nummer} Support: ${titel}`);
  refresh(ticket.id);
  redirect(
    flash(
      `${LISTE}/${ticket.id}`,
      ablageFehler ? "fehler" : "ok",
      ablageFehler
        ? `Meldung #${ticket.nummer} ging raus, der Anhang aber nicht: ${ablageFehler}`
        : `Danke - Meldung #${ticket.nummer} liegt bei der IT.`,
    ),
  );
}

/** Aendert Text, Zuordnung, Dringlichkeit und Status eines Tickets. */
export async function updateTicket(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const vorher = await prisma.ticket.findUnique({ where: { id } });
  if (!vorher) redirect(flash(LISTE, "fehler", "Ticket nicht gefunden."));

  const status = geprueft(str(formData, "status"), TICKET_STATUS, vorher.status);

  await prisma.ticket.update({
    where: { id },
    data: {
      titel: str(formData, "titel") || vorher.titel,
      beschreibung: optionalStr(formData, "beschreibung"),
      art: geprueft(str(formData, "art"), TICKET_ART, vorher.art),
      prioritaet: geprueft(str(formData, "prioritaet"), TICKET_PRIORITAET, vorher.prioritaet),
      propertyId: optionalStr(formData, "propertyId"),
      tenantId: optionalStr(formData, "tenantId"),
      bearbeiter: optionalStr(formData, "bearbeiter"),
      status,
      // Der Erledigt-Zeitpunkt entsteht beim Umschalten, nicht per Hand.
      erledigtAm:
        status === "ERLEDIGT" ? (vorher.erledigtAm ?? new Date()) : null,
    },
  });

  await audit(user.email, "update", "Ticket", id, `#${vorher.nummer}`);
  refresh(id);
  redirect(flash(`${LISTE}/${id}`, "ok", "Ticket wurde gespeichert."));
}

/** Setzt nur den Status - ein Klick aus der Liste heraus. */
export async function setTicketStatus(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || LISTE;
  const status = geprueft(str(formData, "status"), TICKET_STATUS, "OFFEN");

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) redirect(flash(back, "fehler", "Ticket nicht gefunden."));

  await prisma.ticket.update({
    where: { id },
    data: {
      status,
      bearbeiter: status === "IN_ARBEIT" ? (ticket.bearbeiter ?? user.name) : ticket.bearbeiter,
      erledigtAm: status === "ERLEDIGT" ? (ticket.erledigtAm ?? new Date()) : null,
    },
  });

  await audit(user.email, "status", "Ticket", id, `#${ticket.nummer} → ${status}`);
  refresh(id);
  redirect(flash(back, "ok", `Ticket #${ticket.nummer} ist jetzt „${status}“.`));
}

/** Ein Wortbeitrag zum Verlauf. */
export async function addTicketComment(formData: FormData) {
  const user = await requireAdmin();
  const ticketId = str(formData, "ticketId");
  const text = str(formData, "text");
  if (!text) redirect(flash(`${LISTE}/${ticketId}`, "fehler", "Bitte etwas schreiben."));

  await prisma.ticketKommentar.create({
    data: { ticketId, autor: user.name, text },
  });

  await audit(user.email, "comment", "Ticket", ticketId);
  refresh(ticketId);
  redirect(flash(`${LISTE}/${ticketId}`, "ok", "Notiz wurde hinzugefügt."));
}

/** Haengt nachtraeglich ein Foto oder Dokument an. */
export async function uploadTicketDocument(formData: FormData) {
  const user = await requireAdmin();
  const ticketId = str(formData, "ticketId");
  const datei = formData.get("datei");

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) redirect(flash(LISTE, "fehler", "Ticket nicht gefunden."));
  if (!(datei instanceof File) || datei.size === 0) {
    redirect(flash(`${LISTE}/${ticketId}`, "fehler", "Bitte eine Datei auswählen."));
  }

  const fehler = await haengeDateiAn(ticketId, ticket.nummer, datei);
  await audit(user.email, "upload", "Ticket", ticketId, datei.name);
  refresh(ticketId);
  redirect(
    flash(
      `${LISTE}/${ticketId}`,
      fehler ? "fehler" : "ok",
      fehler ? `Anhang nicht gespeichert: ${fehler}` : "Anhang wurde hinzugefügt.",
    ),
  );
}

/** Loescht ein Ticket samt Verlauf und Anhaengen. */
export async function deleteTicket(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) redirect(flash(LISTE, "fehler", "Ticket nicht gefunden."));

  await prisma.ticket.delete({ where: { id } });
  await audit(user.email, "delete", "Ticket", id, `#${ticket.nummer}`);
  refresh();
  redirect(flash(LISTE, "ok", `Ticket #${ticket.nummer} wurde gelöscht.`));
}
