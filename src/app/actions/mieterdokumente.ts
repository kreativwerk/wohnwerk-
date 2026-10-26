"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { date, flash, str } from "@/lib/form";
import { FOLDER, deleteFile, uploadFile } from "@/lib/storage";
import { uebersetzer } from "@/lib/i18n";
import { MIETER_DOKUMENT_ARTEN } from "@/lib/mieterdokumente";

const MAX_BYTES = 20 * 1024 * 1024;

function zurueck(tenantId: string): string {
  return `/mieter/${tenantId}#dokumente`;
}

/**
 * Dokument zum Bewohner ablegen - Kuendigung, Ausweis, unterschriebener
 * Vertrag, alles, was zur Person gehoert. Landet in der Ablage unter
 * "Mieterunterlagen / Nachname Vorname".
 */
export async function uploadMieterDokument(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const tenantId = str(formData, "tenantId");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, firstName: true, lastName: true } });
  if (!tenant) redirect("/mieter");

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    redirect(flash(zurueck(tenant.id), "fehler", t("Bitte eine Datei auswählen.")));
  }
  if (datei.size > MAX_BYTES) redirect(flash(zurueck(tenant.id), "fehler", t("Die Datei ist größer als 20 MB.")));

  const artRoh = str(formData, "art");
  const art = (MIETER_DOKUMENT_ARTEN as readonly string[]).includes(artRoh) ? artRoh : "Sonstiges";
  const titel = str(formData, "titel") || art;
  const tag = date(formData, "datum") ?? new Date();
  const punkt = datei.name.lastIndexOf(".");
  const endung = punkt > 0 ? datei.name.slice(punkt).toLowerCase() : "";
  const daten = Buffer.from(await datei.arrayBuffer());

  let abgelegt: Awaited<ReturnType<typeof uploadFile>>;
  try {
    abgelegt = await uploadFile({
      fileName: `${tag.toISOString().slice(0, 10)} ${titel}${endung}`,
      mimeType: datei.type || "application/octet-stream",
      data: daten,
      folderSegments: [...FOLDER.tenants(), `${tenant.lastName} ${tenant.firstName}`],
    });
  } catch (fehler) {
    console.error("[mieterdokument] Ablage fehlgeschlagen:", fehler);
    redirect(flash(zurueck(tenant.id), "fehler", (fehler as Error).message));
  }

  const dokument = await prisma.document.create({
    data: {
      kind: art === "Mietvertrag (unterschrieben)" ? "CONTRACT" : "OTHER",
      title: titel,
      fileName: datei.name,
      mimeType: datei.type || "application/octet-stream",
      sizeBytes: daten.byteLength,
      driveFileId: abgelegt.fileId,
      driveUrl: abgelegt.url,
      driveFolder: abgelegt.folder,
      localPath: abgelegt.localPath,
      documentDate: tag,
      category: art,
      notes: str(formData, "notiz") || null,
      tenantId: tenant.id,
    },
  });

  await audit(user.email, "upload", "Document", dokument.id, `${art}: ${titel}`);
  revalidatePath(`/mieter/${tenant.id}`);
  redirect(flash(zurueck(tenant.id), "ok", t("Dokument „{titel}“ wurde abgelegt.", { titel })));
}

export async function deleteMieterDokument(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const id = str(formData, "id");
  const dokument = await prisma.document.findUnique({ where: { id } });
  if (!dokument?.tenantId) redirect("/mieter");

  // Aus dem Postfach: die Datei gehoert weiter zur E-Mail.
  if (!dokument.emailAnhangId) {
    await deleteFile({ driveFileId: dokument.driveFileId, localPath: dokument.localPath });
  }
  await prisma.document.delete({ where: { id } });
  await audit(user.email, "delete", "Document", id, dokument.title);
  revalidatePath(`/mieter/${dokument.tenantId}`);
  redirect(flash(zurueck(dokument.tenantId), "ok", t("Dokument wurde gelöscht.")));
}
