"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { flash, str } from "@/lib/form";
import { buildContractData, contractLink, loadContract } from "@/lib/contract";
import { renderContractPdf } from "@/lib/contract-pdf";
import { buildDocumentsFromTemplates } from "@/lib/property-documents";
import { contractInviteMail, sendMail } from "@/lib/mail";
import { getAppUrl, getSettings } from "@/lib/settings";
import { FOLDER, backendLabel, randomToken, uploadFile } from "@/lib/storage";
import { formatDate } from "@/lib/dates";
import { ensureRentCharges } from "@/lib/accounting";
import { nextContractNumber } from "@/lib/tenancy";
import { ABLAGE_KATEGORIE, nameAusTitel, ordneVertragZu } from "@/lib/vertragsablage";

function refresh(contractId: string) {
  revalidatePath("/vertraege");
  revalidatePath(`/vertraege/${contractId}`);
  revalidatePath("/mieter");
  revalidatePath("/belegung");
  revalidatePath("/");
}

const ABLAGE = "/vertraege/ablage";

/** Ordnet ein abgelegtes Vertragsdokument einem vorhandenen Mieter zu. */
export async function assignContractDocument(formData: FormData) {
  const user = await requireAdmin();
  const documentId = str(formData, "documentId");
  const tenantId = str(formData, "tenantId");
  if (!tenantId) redirect(flash(ABLAGE, "fehler", "Bitte zuerst einen Mieter auswählen."));

  let ergebnis;
  try {
    ergebnis = await ordneVertragZu(documentId, tenantId);
  } catch (error) {
    redirect(flash(ABLAGE, "fehler", (error as Error).message));
  }

  await audit(user.email, "assign", "Document", documentId, ergebnis.mieterName);
  revalidatePath(ABLAGE);
  revalidatePath("/vertraege");
  revalidatePath("/mieter");
  revalidatePath(`/mieter/${tenantId}`);
  redirect(
    flash(
      ABLAGE,
      "ok",
      ergebnis.contractId
        ? `Vertrag wurde ${ergebnis.mieterName} zugeordnet und erscheint jetzt unter Mietverträge.`
        : `Vertrag wurde ${ergebnis.mieterName} zugeordnet (kein Mietverhältnis hinterlegt – der Vertrag liegt bei den Unterlagen des Mieters).`,
    ),
  );
}

/** Nimmt eine Zuordnung zurueck - das Dokument landet wieder in der Ablage. */
export async function unassignContractDocument(formData: FormData) {
  const user = await requireAdmin();
  const documentId = str(formData, "documentId");
  const back = str(formData, "back") || ABLAGE;

  const dokument = await prisma.document.findUnique({ where: { id: documentId } });
  if (!dokument) redirect(flash(back, "fehler", "Dokument nicht gefunden."));

  // Haengt am Vertrag nur dieser Scan, verliert der Vertrag sein PDF.
  if (dokument.contractId) {
    const vertrag = await prisma.contract.findUnique({ where: { id: dokument.contractId } });
    if (vertrag?.pdfFileId === dokument.driveFileId) {
      await prisma.contract.update({
        where: { id: vertrag.id },
        data: { pdfFileId: null, pdfUrl: null, pdfPath: null },
      });
    }
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      tenantId: null,
      contractId: null,
      category: ABLAGE_KATEGORIE,
      title: `Mietvertrag ${nameAusTitel(dokument.title)} (ohne Zuordnung)`,
    },
  });

  await audit(user.email, "unassign", "Document", documentId);
  revalidatePath(ABLAGE);
  revalidatePath("/vertraege");
  revalidatePath("/mieter");
  redirect(flash(back, "ok", "Zuordnung aufgehoben – der Vertrag liegt wieder in der Ablage."));
}

/**
 * Legt aus einem abgelegten Vertrag einen ehemaligen Mieter an. Fuer den
 * Altbestand: die Person wohnt laengst nicht mehr hier, der Vertrag gehoert
 * aber in die Unterlagen.
 */
export async function createFormerTenantFromDocument(formData: FormData) {
  const user = await requireAdmin();
  const documentId = str(formData, "documentId");

  const dokument = await prisma.document.findUnique({ where: { id: documentId } });
  if (!dokument) redirect(flash(ABLAGE, "fehler", "Dokument nicht gefunden."));

  const name = nameAusTitel(dokument.title);
  const [firstName, ...rest] = name.split(" ");
  if (!firstName) redirect(flash(ABLAGE, "fehler", "Im Titel steht kein Name."));

  const tenant = await prisma.tenant.create({
    data: {
      firstName,
      lastName: rest.join(" "),
      email: "",
      status: "EHEMALIG",
      notes: "Aus dem Vertragsscan übernommen (Altbestand).",
    },
  });

  await ordneVertragZu(documentId, tenant.id);
  await audit(user.email, "create", "Tenant", tenant.id, `${name} (ehemalig)`);
  revalidatePath(ABLAGE);
  revalidatePath("/vertraege");
  revalidatePath("/mieter");
  redirect(flash(ABLAGE, "ok", `${name} wurde als ehemaliger Mieter angelegt.`));
}

/** Nimmt einen weiteren Vertragsscan in die Ablage auf. */
export async function uploadContractDocument(formData: FormData) {
  const user = await requireAdmin();
  const datei = formData.get("file");
  if (!(datei instanceof File) || datei.size === 0) {
    redirect(flash(ABLAGE, "fehler", "Bitte eine Datei auswählen."));
  }

  const puffer = Buffer.from(await datei.arrayBuffer());
  const jahr = new Date().getFullYear();

  let abgelegt;
  try {
    abgelegt = await uploadFile({
      fileName: datei.name,
      mimeType: datei.type || "application/pdf",
      data: puffer,
      folderSegments: FOLDER.contracts(jahr),
    });
  } catch (error) {
    console.error("[vertragsablage] Ablage fehlgeschlagen:", error);
    redirect(flash(ABLAGE, "fehler", (error as Error).message));
  }

  const dokument = await prisma.document.create({
    data: {
      kind: "CONTRACT",
      title: `Mietvertrag ${str(formData, "name") || datei.name.replace(/\.[^.]+$/, "")} (ohne Zuordnung)`,
      fileName: datei.name,
      mimeType: datei.type || "application/pdf",
      sizeBytes: puffer.byteLength,
      driveFileId: abgelegt.fileId,
      driveUrl: abgelegt.url,
      driveFolder: abgelegt.folder,
      localPath: abgelegt.localPath,
      category: ABLAGE_KATEGORIE,
    },
  });

  await audit(user.email, "upload", "Document", dokument.id, "Vertragsablage");
  revalidatePath(ABLAGE);
  redirect(flash(ABLAGE, "ok", "Vertrag liegt in der Ablage und kann zugeordnet werden."));
}

/**
 * Beendet einen Vertrag: das Mietverhaeltnis endet, der Mieter gilt als
 * ehemalig. Die Unterlagen bleiben vollstaendig erhalten.
 */
export async function endContract(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/vertraege";
  const ende = str(formData, "endDate");

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { tenancy: { include: { tenant: true } } },
  });
  if (!contract) redirect(flash(back, "fehler", "Vertrag nicht gefunden."));

  const endDate = ende ? new Date(`${ende}T00:00:00.000Z`) : new Date();

  await prisma.$transaction([
    prisma.contract.update({ where: { id }, data: { status: "ENDED" } }),
    prisma.tenancy.update({
      where: { id: contract.tenancyId },
      data: { status: "ENDED", endDate: contract.tenancy.endDate ?? endDate },
    }),
    prisma.tenant.update({
      where: { id: contract.tenancy.tenantId },
      data: { status: "EHEMALIG" },
    }),
  ]);

  const name = `${contract.tenancy.tenant.firstName} ${contract.tenancy.tenant.lastName}`.trim();
  await audit(user.email, "end", "Contract", id, name);
  refresh(id);
  redirect(flash(back, "ok", `Vertrag von ${name} ist beendet.`));
}

/** Markiert einen Mieter als ehemalig oder holt ihn zurueck. */
export async function toggleTenantFormer(formData: FormData) {
  const user = await requireAdmin();
  const tenantId = str(formData, "tenantId");
  const back = str(formData, "back") || "/mieter";

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect(flash(back, "fehler", "Mieter nicht gefunden."));

  const jetztEhemalig = tenant.status !== "EHEMALIG";
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: jetztEhemalig ? "EHEMALIG" : "AKTIV" },
  });

  const name = `${tenant.firstName} ${tenant.lastName}`.trim();
  await audit(user.email, jetztEhemalig ? "mark-former" : "mark-active", "Tenant", tenantId, name);
  revalidatePath("/mieter");
  revalidatePath(`/mieter/${tenantId}`);
  revalidatePath("/vertraege");
  redirect(
    flash(back, "ok", jetztEhemalig ? `${name} gilt als ehemaliger Mieter.` : `${name} ist wieder aktiv.`),
  );
}

/**
 * Legt fuer ein bestehendes Mietverhaeltnis ohne Vertrag einen
 * Vertragsentwurf an - z. B. fuer die aus der Excel uebernommenen Mieter,
 * die ohne Vertragsdokument importiert wurden.
 */
export async function createContractForTenancy(formData: FormData) {
  const user = await requireAdmin();
  const tenancyId = str(formData, "tenancyId");
  const back = str(formData, "back") || "/vertraege";

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: { contract: true, tenant: true },
  });
  if (!tenancy) redirect(flash(back, "fehler", "Mietverhältnis nicht gefunden."));
  if (tenancy.contract) redirect(`/vertraege/${tenancy.contract.id}`);

  const contract = await prisma.contract.create({
    data: {
      tenancyId,
      contractNumber: await nextContractNumber(tenancy.startDate),
      token: randomToken(),
      status: "DRAFT",
    },
  });

  await audit(user.email, "create", "Contract", contract.id, tenancy.reference);
  refresh(contract.id);
  redirect(
    flash(
      `/vertraege/${contract.id}`,
      "ok",
      `Vertragsentwurf für ${tenancy.tenant.firstName} ${tenancy.tenant.lastName} wurde angelegt.`,
    ),
  );
}

/**
 * Friert die Vertragsdaten ein und markiert den Vertrag als versendet.
 * Ab diesem Moment aendern spaetere Anpassungen an den Einstellungen den
 * Vertragstext nicht mehr.
 */
export async function sendContract(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const contract = await loadContract({ id });
  if (!contract) redirect(flash("/vertraege", "fehler", "Vertrag nicht gefunden."));
  if (contract.status === "SIGNED") {
    redirect(flash(`/vertraege/${id}`, "fehler", "Der Vertrag ist bereits unterschrieben."));
  }

  const data = await buildContractData(contract);
  const appUrl = await getAppUrl();
  const link = contractLink(appUrl, contract.token);

  await prisma.$transaction([
    prisma.contract.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        snapshot: JSON.stringify(data),
        // Der Link ist 30 Tage gueltig; danach kann er neu erzeugt werden.
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.tenancy.update({ where: { id: contract.tenancyId }, data: { status: "SENT" } }),
  ]);

  const settings = await getSettings();
  const mail = contractInviteMail({
    tenantName: data.tenantName,
    landlordName: settings.companyName,
    propertyName: data.propertyName,
    roomName: data.roomName,
    bedLabel: data.bedLabel,
    startDate: formatDate(data.startDate),
    link,
  });

  const result = await sendMail({
    to: data.tenantEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: settings.companyEmail || undefined,
  });

  await audit(user.email, "send", "Contract", id, contract.contractNumber);
  refresh(id);
  redirect(
    flash(
      `/vertraege/${id}`,
      "ok",
      result.sent
        ? result.message
        : `Vertrag ist freigegeben. ${result.message} Bitte den Link unten kopieren und dem Mieter schicken.`,
    ),
  );
}

/** Erzeugt einen neuen Link, falls der alte abgelaufen oder verschickt wurde. */
export async function renewContractToken(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) redirect(flash("/vertraege", "fehler", "Vertrag nicht gefunden."));
  if (contract.status === "SIGNED") {
    redirect(flash(`/vertraege/${id}`, "fehler", "Ein unterschriebener Vertrag braucht keinen neuen Link."));
  }

  await prisma.contract.update({
    where: { id },
    data: {
      token: randomToken(),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      viewedAt: null,
    },
  });

  await audit(user.email, "renew-token", "Contract", id);
  refresh(id);
  redirect(flash(`/vertraege/${id}`, "ok", "Ein neuer Link wurde erzeugt. Der alte ist ungültig."));
}

export async function cancelContract(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) redirect(flash("/vertraege", "fehler", "Vertrag nicht gefunden."));

  await prisma.$transaction([
    prisma.contract.update({ where: { id }, data: { status: "CANCELLED" } }),
    prisma.tenancy.update({ where: { id: contract.tenancyId }, data: { status: "CANCELLED" } }),
  ]);

  await audit(user.email, "cancel", "Contract", id, contract.contractNumber);
  refresh(id);
  redirect(flash(`/vertraege/${id}`, "ok", "Vertrag wurde storniert. Das Bett ist wieder frei."));
}

/** Erzeugt das PDF neu und legt es in Google Drive ab. */
export async function regenerateContractPdf(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");

  const contract = await loadContract({ id });
  if (!contract) redirect(flash("/vertraege", "fehler", "Vertrag nicht gefunden."));

  const data = await buildContractData(contract, { includeSignature: true });
  const pdf = await renderContractPdf(data);

  const stored = await uploadFile({
    fileName: `${contract.contractNumber} ${data.tenantName}.pdf`,
    mimeType: "application/pdf",
    data: pdf,
    folderSegments: FOLDER.contracts(contract.tenancy.startDate.getUTCFullYear()),
  });

  await prisma.contract.update({
    where: { id },
    data: { pdfFileId: stored.fileId, pdfUrl: stored.url, pdfPath: stored.localPath },
  });

  await audit(user.email, "render-pdf", "Contract", id, stored.backend);
  refresh(id);
  redirect(
    flash(
      `/vertraege/${id}`,
      "ok",
      `PDF wurde neu erzeugt und in ${backendLabel(stored.backend)} abgelegt.`,
    ),
  );
}

/**
 * Unterschrift im Namen des Mieters erfassen – fuer den Fall, dass jemand vor
 * Ort unterschreibt statt ueber den Link.
 */
export async function markContractSignedManually(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const signerName = str(formData, "signerName");

  const contract = await loadContract({ id });
  if (!contract) redirect(flash("/vertraege", "fehler", "Vertrag nicht gefunden."));
  if (contract.status === "SIGNED") {
    redirect(flash(`/vertraege/${id}`, "fehler", "Der Vertrag ist bereits unterschrieben."));
  }
  if (!signerName) {
    redirect(flash(`/vertraege/${id}`, "fehler", "Bitte den Namen der unterschreibenden Person angeben."));
  }

  const snapshot = contract.snapshot ?? JSON.stringify(await buildContractData(contract));
  const signedAt = new Date();

  await prisma.$transaction([
    prisma.contract.update({
      where: { id },
      data: {
        status: "SIGNED",
        signedAt,
        signerName,
        signerIp: null,
        signerUserAgent: `manuell erfasst durch ${user.email}`,
        snapshot,
      },
    }),
    prisma.tenancy.update({ where: { id: contract.tenancyId }, data: { status: "ACTIVE" } }),
  ]);

  await finalizeSignedContract(id);
  await audit(user.email, "sign-manual", "Contract", id, signerName);
  refresh(id);
  redirect(flash(`/vertraege/${id}`, "ok", "Vertrag wurde als unterschrieben erfasst."));
}

/**
 * Nachlauf einer Unterschrift: PDF rendern, in Drive ablegen, als Dokument
 * verknuepfen und die Mietforderungen anlegen.
 */
export async function finalizeSignedContract(contractId: string): Promise<void> {
  const contract = await loadContract({ id: contractId });
  if (!contract) return;

  const data = await buildContractData(contract, { includeSignature: true });
  const year = contract.tenancy.startDate.getUTCFullYear();
  const propertyId = contract.tenancy.bed.room.propertyId;

  // Hat das Objekt Vordrucke, entstehen die Dokumente daraus. Nur wenn keiner
  // hinterlegt ist, greift der selbst gesetzte Mietvertrag.
  const ausVordruck = await buildDocumentsFromTemplates(contract);

  const dokumente =
    ausVordruck.length > 0
      ? ausVordruck
      : [
          {
            kind: "CONTRACT",
            title: `Mietvertrag ${contract.contractNumber} – ${data.tenantName}`,
            fileName: `${contract.contractNumber} ${data.tenantName}.pdf`,
            pdf: await renderContractPdf(data),
            istMietvertrag: true,
            istWohnungsgeberbestaetigung: false,
          },
        ];

  for (const dokument of dokumente) {
    // Die Unterschrift ist zu diesem Zeitpunkt gespeichert; scheitert die
    // Ablage, geht nichts verloren - das PDF laesst sich jederzeit aus den
    // Vertragsdaten neu erzeugen. Der Mieter darf keinen Fehler sehen.
    let stored: Awaited<ReturnType<typeof uploadFile>>;
    try {
      stored = await uploadFile({
        fileName: dokument.fileName,
        mimeType: "application/pdf",
        data: dokument.pdf,
        folderSegments: FOLDER.contracts(year),
      });
    } catch (error) {
      console.error("[vertrag] Ablage fehlgeschlagen:", error);
      continue;
    }

    // Der Mietvertrag ist das Dokument, das am Vertrag selbst haengt.
    if (dokument.istMietvertrag) {
      await prisma.contract.update({
        where: { id: contractId },
        data: { pdfFileId: stored.fileId, pdfUrl: stored.url, pdfPath: stored.localPath },
      });
    }

    await prisma.document.create({
      data: {
        kind: "CONTRACT",
        title: dokument.title,
        fileName: dokument.fileName,
        mimeType: "application/pdf",
        sizeBytes: dokument.pdf.byteLength,
        driveFileId: stored.fileId,
        driveUrl: stored.url,
        driveFolder: stored.folder,
        localPath: stored.localPath,
        documentDate: contract.signedAt ?? new Date(),
        contractId,
        tenantId: contract.tenancy.tenantId,
        propertyId,
        category:
          dokument.istMietvertrag && dokument.istWohnungsgeberbestaetigung
            ? "Mietvertrag mit Wohnungsgeberbestätigung"
            : dokument.istWohnungsgeberbestaetigung
              ? "Wohnungsgeberbestätigung"
              : "Mietvertrag",
      },
    });
  }

  await ensureRentCharges({ tenancyId: contract.tenancyId });
}
