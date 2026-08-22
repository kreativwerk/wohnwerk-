"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { cents, date, flash, int, optionalCents, optionalStr, str } from "@/lib/form";
import { dedupeHash, parseStatement } from "@/lib/bank";
import { FOLDER, deleteFile, folderLink, shareFolderWith, uploadFile } from "@/lib/storage";
import { allocate, autoMatch, deallocate, ensureRentCharges } from "@/lib/accounting";
import { exportToDrive } from "@/lib/export";
import { formatDate } from "@/lib/dates";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function refresh() {
  revalidatePath("/buchhaltung");
  revalidatePath("/buchhaltung/kontoauszuege");
  revalidatePath("/buchhaltung/belege");
  revalidatePath("/buchhaltung/offene-posten");
  revalidatePath("/");
}

// --- Bankkonten ------------------------------------------------------------

export async function createBankAccount(formData: FormData) {
  const user = await requireAdmin();

  const name = str(formData, "name");
  const iban = str(formData, "iban").replace(/\s/g, "").toUpperCase();
  const back = "/buchhaltung/kontoauszuege";

  if (!name || !iban) {
    redirect(flash(back, "fehler", "Bezeichnung und IBAN werden benötigt."));
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
    redirect(flash(back, "fehler", "Die IBAN sieht nicht gültig aus."));
  }

  const existing = await prisma.bankAccount.findUnique({ where: { iban } });
  if (existing) {
    redirect(flash(back, "fehler", "Für diese IBAN gibt es bereits ein Konto."));
  }

  const account = await prisma.bankAccount.create({
    data: {
      name,
      iban,
      bic: optionalStr(formData, "bic"),
      openingBalanceCents: cents(formData, "openingBalanceCents", 0),
    },
  });

  await audit(user.email, "create", "BankAccount", account.id, name);
  refresh();
  redirect(flash(back, "ok", `Bankkonto „${name}“ wurde angelegt.`));
}

export async function deleteBankAccount(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = "/buchhaltung/kontoauszuege";

  const count = await prisma.bankTransaction.count({ where: { bankAccountId: id } });
  if (count > 0) {
    redirect(
      flash(back, "fehler", `Das Konto hat ${count} Buchungen und kann nicht gelöscht werden.`),
    );
  }

  await prisma.bankAccount.delete({ where: { id } });
  await audit(user.email, "delete", "BankAccount", id);
  refresh();
  redirect(flash(back, "ok", "Bankkonto wurde gelöscht."));
}

// --- Kontoauszug einlesen --------------------------------------------------

/**
 * Kontoauszug hochladen: Datei parsen, Buchungen anlegen (Duplikate werden
 * uebersprungen), Originaldatei in Drive ablegen und anschliessend die
 * Zahlungseingaenge automatisch den Mietforderungen zuordnen.
 */
export async function importStatement(formData: FormData) {
  const user = await requireAdmin();
  const back = "/buchhaltung/kontoauszuege";

  const bankAccountId = str(formData, "bankAccountId");
  const file = formData.get("file");

  if (!bankAccountId) redirect(flash(back, "fehler", "Bitte ein Bankkonto auswählen."));
  if (!(file instanceof File) || file.size === 0) {
    redirect(flash(back, "fehler", "Bitte eine Datei auswählen."));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(flash(back, "fehler", "Die Datei ist größer als 20 MB."));
  }

  const account = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!account) redirect(flash(back, "fehler", "Bankkonto nicht gefunden."));

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // Dieselbe Datei zweimal hochzuladen soll die Ablage nicht mit Kopien fluten.
  const alreadyImported = await prisma.bankStatement.findFirst({
    where: { bankAccountId, contentHash },
    select: { importedAt: true, rowsImported: true },
  });
  if (alreadyImported) {
    redirect(
      flash(
        back,
        "fehler",
        `Diese Datei wurde bereits am ${formatDate(alreadyImported.importedAt)} eingelesen ` +
          `(${alreadyImported.rowsImported} Buchungen). Es wurde nichts erneut angelegt.`,
      ),
    );
  }

  let parsed: Awaited<ReturnType<typeof parseStatement>>;
  try {
    parsed = await parseStatement(file.name, buffer);
  } catch (error) {
    redirect(flash(back, "fehler", (error as Error).message));
  }

  // Warnung, wenn der Auszug offensichtlich zu einem anderen Konto gehoert.
  if (parsed.iban && parsed.iban !== account.iban) {
    redirect(
      flash(
        back,
        "fehler",
        `Der Auszug gehört zu IBAN ${parsed.iban}, ausgewählt war aber ${account.iban}.`,
      ),
    );
  }

  const year = (parsed.periodEnd ?? new Date()).getUTCFullYear();
  const stored = await uploadFile({
    fileName: `${formatDate(parsed.periodStart).replace(/\./g, "-")} bis ${formatDate(
      parsed.periodEnd,
    ).replace(/\./g, "-")} ${account.name}${file.name.slice(file.name.lastIndexOf("."))}`,
    mimeType: file.type || "application/octet-stream",
    data: buffer,
    folderSegments: FOLDER.statements(year),
  });

  const statement = await prisma.bankStatement.create({
    data: {
      bankAccountId,
      fileName: file.name,
      sourceFormat: parsed.format,
      contentHash,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      rowsTotal: parsed.transactions.length,
      closingBalanceCents: parsed.closingBalanceCents,
      driveFileId: stored.fileId,
      driveUrl: stored.url,
    },
  });

  let imported = 0;
  let duplicates = 0;

  for (const tx of parsed.transactions) {
    const hash = dedupeHash(account.iban, tx);
    const existing = await prisma.bankTransaction.findUnique({ where: { dedupeHash: hash } });
    if (existing) {
      duplicates += 1;
      continue;
    }

    await prisma.bankTransaction.create({
      data: {
        bankAccountId,
        statementId: statement.id,
        bookingDate: tx.bookingDate,
        valueDate: tx.valueDate,
        amountCents: tx.amountCents,
        currency: tx.currency,
        direction: tx.amountCents >= 0 ? "CREDIT" : "DEBIT",
        counterpartyName: tx.counterpartyName,
        counterpartyIban: tx.counterpartyIban,
        purpose: tx.purpose,
        endToEndId: tx.endToEndId,
        bankTxCode: tx.bankTxCode,
        dedupeHash: hash,
      },
    });
    imported += 1;
  }

  await prisma.bankStatement.update({
    where: { id: statement.id },
    data: { rowsImported: imported, rowsDuplicate: duplicates },
  });

  // Beleg-Charakter: der Auszug selbst gehoert in die Belegablage.
  await prisma.document.create({
    data: {
      kind: "STATEMENT",
      title: `Kontoauszug ${account.name} ${formatDate(parsed.periodStart)} – ${formatDate(parsed.periodEnd)}`,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: buffer.byteLength,
      driveFileId: stored.fileId,
      driveUrl: stored.url,
      driveFolder: stored.folder,
      localPath: stored.localPath,
      documentDate: parsed.periodEnd,
      category: "Kontoauszug",
    },
  });

  // Gehoert das Konto genau einem Objekt, tragen die neuen Buchungen dessen
  // Zuordnung gleich mit. Bei mehreren Objekten am selben Konto bleibt die
  // Zuordnung offen - raten waere falsch.
  const kontoObjekte = await prisma.property.findMany({
    where: { bankAccountId },
    select: { id: true },
  });
  let objektZugeordnet = 0;
  if (kontoObjekte.length === 1) {
    const zuordnung = await prisma.bankTransaction.updateMany({
      where: { statementId: statement.id, propertyId: null },
      data: { propertyId: kontoObjekte[0].id },
    });
    objektZugeordnet = zuordnung.count;
  }

  const match = await autoMatch({ bankAccountId });
  await audit(user.email, "import", "BankStatement", statement.id, `${imported} Buchungen`);
  refresh();

  const parts = [
    `${imported} Buchung(en) importiert`,
    duplicates > 0 ? `${duplicates} Duplikat(e) übersprungen` : null,
    match.matched > 0 ? `${match.matched} Zahlung(en) automatisch zugeordnet` : null,
    objektZugeordnet > 0 ? `${objektZugeordnet} Buchung(en) dem Objekt des Kontos zugewiesen` : null,
    parsed.warnings.length > 0 ? `${parsed.warnings.length} Hinweis(e) beim Einlesen` : null,
  ].filter(Boolean);

  redirect(flash(back, "ok", `${parts.join(", ")}.`));
}

export async function deleteStatement(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = "/buchhaltung/kontoauszuege";

  // Buchungen mit Zahlungszuordnung bleiben erhalten - sie sind Teil der Buchhaltung.
  const allocated = await prisma.bankTransaction.count({
    where: { statementId: id, allocations: { some: {} } },
  });
  if (allocated > 0) {
    redirect(
      flash(
        back,
        "fehler",
        `${allocated} Buchung(en) dieses Auszugs sind bereits Mieten zugeordnet. Bitte zuerst die Zuordnung lösen.`,
      ),
    );
  }

  await prisma.bankTransaction.deleteMany({ where: { statementId: id } });
  await prisma.bankStatement.delete({ where: { id } });

  await audit(user.email, "delete", "BankStatement", id);
  refresh();
  redirect(flash(back, "ok", "Kontoauszug und zugehörige Buchungen wurden entfernt."));
}

// --- Buchungen -------------------------------------------------------------

export async function updateTransaction(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/buchhaltung";

  const reviewStatus = str(formData, "reviewStatus");
  await prisma.bankTransaction.update({
    where: { id },
    data: {
      category: optionalStr(formData, "category"),
      propertyId: optionalStr(formData, "propertyId"),
      notes: optionalStr(formData, "notes"),
      ...(["OPEN", "MATCHED", "BOOKED", "IGNORED"].includes(reviewStatus) ? { reviewStatus } : {}),
    },
  });

  await audit(user.email, "update", "BankTransaction", id);
  refresh();
  redirect(flash(back, "ok", "Buchung wurde gespeichert."));
}

export async function runAutoMatch(formData: FormData) {
  const user = await requireAdmin();
  const back = str(formData, "back") || "/buchhaltung/offene-posten";

  const created = await ensureRentCharges();
  const result = await autoMatch();

  await audit(user.email, "auto-match", "BankTransaction", null, `${result.matched} Treffer`);
  refresh();
  redirect(
    flash(
      back,
      "ok",
      `${result.reviewed} offene Zahlungseingänge geprüft, ${result.matched} zugeordnet` +
        (created > 0 ? `, ${created} neue Mietforderung(en) angelegt.` : "."),
    ),
  );
}

export async function allocatePayment(formData: FormData) {
  const user = await requireAdmin();
  const back = str(formData, "back") || "/buchhaltung/offene-posten";

  const result = await allocate({
    bankTransactionId: str(formData, "bankTransactionId"),
    rentChargeId: str(formData, "rentChargeId"),
    amountCents: optionalCents(formData, "amountCents") ?? undefined,
  });

  await audit(user.email, "allocate", "Allocation", null, result.message);
  refresh();
  redirect(flash(back, result.ok ? "ok" : "fehler", result.message));
}

export async function removeAllocation(formData: FormData) {
  const user = await requireAdmin();
  const back = str(formData, "back") || "/buchhaltung/offene-posten";

  await deallocate(str(formData, "id"));
  await audit(user.email, "deallocate", "Allocation", str(formData, "id"));
  refresh();
  redirect(flash(back, "ok", "Zuordnung wurde aufgehoben."));
}

export async function generateCharges(formData: FormData) {
  const user = await requireAdmin();
  const back = str(formData, "back") || "/buchhaltung/offene-posten";

  const created = await ensureRentCharges();
  await audit(user.email, "generate-charges", "RentCharge", null, String(created));
  refresh();
  redirect(
    flash(
      back,
      "ok",
      created > 0
        ? `${created} Mietforderung(en) wurden angelegt.`
        : "Alle Mietforderungen sind bereits vorhanden.",
    ),
  );
}

export async function waiveCharge(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/buchhaltung/offene-posten";

  await prisma.rentCharge.update({
    where: { id },
    data: { status: "WAIVED", notes: optionalStr(formData, "notes") },
  });

  await audit(user.email, "waive", "RentCharge", id);
  refresh();
  redirect(flash(back, "ok", "Forderung wurde als erlassen markiert."));
}

// --- Belege ----------------------------------------------------------------

/** Beleg hochladen und optional direkt einer Bankbuchung zuordnen. */
export async function uploadDocument(formData: FormData) {
  const user = await requireAdmin();
  const back = str(formData, "back") || "/buchhaltung/belege";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(flash(back, "fehler", "Bitte eine Datei auswählen."));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(flash(back, "fehler", "Die Datei ist größer als 20 MB."));
  }

  const bankTransactionId = optionalStr(formData, "bankTransactionId");
  const documentDate =
    date(formData, "documentDate") ??
    (bankTransactionId
      ? (await prisma.bankTransaction.findUnique({ where: { id: bankTransactionId } }))?.bookingDate ??
        new Date()
      : new Date());

  const kindRaw = str(formData, "kind");
  const kind = ["RECEIPT", "INVOICE", "CONTRACT", "STATEMENT", "OTHER"].includes(kindRaw)
    ? kindRaw
    : "RECEIPT";

  const buffer = Buffer.from(await file.arrayBuffer());
  const title = str(formData, "title") || file.name;

  const stored = await uploadFile({
    fileName: `${documentDate.toISOString().slice(0, 10)} ${title}${file.name.slice(
      file.name.lastIndexOf("."),
    )}`,
    mimeType: file.type || "application/octet-stream",
    data: buffer,
    folderSegments: FOLDER.receipts(documentDate.getUTCFullYear(), documentDate.getUTCMonth() + 1),
  });

  const document = await prisma.document.create({
    data: {
      kind,
      title,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: buffer.byteLength,
      driveFileId: stored.fileId,
      driveUrl: stored.url,
      driveFolder: stored.folder,
      localPath: stored.localPath,
      documentDate,
      amountCents: optionalCents(formData, "amountCents"),
      vatRatePct: str(formData, "vatRatePct") ? Number(str(formData, "vatRatePct")) : null,
      supplier: optionalStr(formData, "supplier"),
      category: optionalStr(formData, "category"),
      notes: optionalStr(formData, "notes"),
      bankTransactionId,
      propertyId: optionalStr(formData, "propertyId"),
      tenantId: optionalStr(formData, "tenantId"),
    },
  });

  // Eine Ausgabe mit Beleg gilt als gebucht.
  if (bankTransactionId) {
    await prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { reviewStatus: "BOOKED", category: optionalStr(formData, "category") ?? undefined },
    });
  }

  await audit(user.email, "upload", "Document", document.id, `${title} (${stored.backend})`);
  refresh();
  redirect(
    flash(
      back,
      "ok",
      stored.backend === "drive"
        ? `Beleg „${title}“ wurde in Google Drive abgelegt.`
        : `Beleg „${title}“ wurde lokal abgelegt (Google Drive ist nicht konfiguriert).`,
    ),
  );
}

export async function updateDocument(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/buchhaltung/belege";

  await prisma.document.update({
    where: { id },
    data: {
      title: str(formData, "title"),
      documentDate: date(formData, "documentDate"),
      amountCents: optionalCents(formData, "amountCents"),
      vatRatePct: str(formData, "vatRatePct") ? Number(str(formData, "vatRatePct")) : null,
      supplier: optionalStr(formData, "supplier"),
      category: optionalStr(formData, "category"),
      notes: optionalStr(formData, "notes"),
      propertyId: optionalStr(formData, "propertyId"),
    },
  });

  await audit(user.email, "update", "Document", id);
  refresh();
  redirect(flash(back, "ok", "Beleg wurde gespeichert."));
}

export async function deleteDocument(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/buchhaltung/belege";

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) redirect(flash(back, "fehler", "Beleg nicht gefunden."));

  await deleteFile({ driveFileId: document.driveFileId, localPath: document.localPath });
  await prisma.document.delete({ where: { id } });

  await audit(user.email, "delete", "Document", id, document.title);
  refresh();
  redirect(flash(back, "ok", "Beleg wurde gelöscht (in Drive in den Papierkorb verschoben)."));
}

// --- Steuerberater ---------------------------------------------------------

export async function runExport(formData: FormData) {
  const user = await requireAdmin();
  const back = "/buchhaltung/export";

  const year = int(formData, "year", new Date().getUTCFullYear());
  const monthRaw = int(formData, "month", 0);
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : undefined;

  const result = await exportToDrive(year, month);
  await audit(user.email, "export", "Accounting", null, `${year}${month ? `-${month}` : ""}`);
  revalidatePath(back);

  const backend = result.files[0]?.backend === "drive" ? "Google Drive" : "der lokalen Ablage";
  redirect(
    flash(back, "ok", `${result.files.length} Datei(en) wurden in ${backend} abgelegt.`),
  );
}

export async function shareWithAccountant(formData: FormData) {
  const user = await requireAdmin();
  const back = "/buchhaltung/export";

  const email = str(formData, "email").toLowerCase();
  const year = int(formData, "year", new Date().getUTCFullYear());

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(flash(back, "fehler", "Bitte eine gültige E-Mail-Adresse angeben."));
  }

  // Der Steuerberater bekommt den kompletten Jahresordner, nicht nur den Export.
  const result = await shareFolderWith(["Buchhaltung", String(year)], email, "reader");
  await audit(user.email, "share", "DriveFolder", result.folderId ?? null, email);
  revalidatePath(back);
  redirect(flash(back, result.ok ? "ok" : "fehler", result.message));
}

export async function openDriveFolder(formData: FormData) {
  await requireAdmin();
  const year = int(formData, "year", new Date().getUTCFullYear());
  const link = await folderLink(["Buchhaltung", String(year)]);

  redirect(
    link ??
      flash("/buchhaltung/export", "fehler", "Google Drive ist nicht konfiguriert."),
  );
}

/** Kanzlei-Stammdaten fuer den DATEV-Export speichern. */
export async function saveDatevSettings(formData: FormData) {
  const user = await requireAdmin();
  const back = "/buchhaltung/export";

  const felder: Array<[string, string]> = [
    ["datevBeraterNr", str(formData, "beraterNr").replace(/\D/g, "").slice(0, 7)],
    ["datevMandantNr", str(formData, "mandantNr").replace(/\D/g, "").slice(0, 5)],
    ["datevKontoBank", str(formData, "kontoBank").replace(/\D/g, "").slice(0, 8) || "1200"],
    ["datevKontoErloes", str(formData, "kontoErloes").replace(/\D/g, "").slice(0, 8) || "8100"],
    ["datevKontoAufwand", str(formData, "kontoAufwand").replace(/\D/g, "").slice(0, 8) || "4900"],
  ];

  await prisma.$transaction(
    felder.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );

  await audit(user.email, "update", "Settings", null, "DATEV");
  revalidatePath(back);
  redirect(flash(back, "ok", "DATEV-Einstellungen gespeichert."));
}

/**
 * Mieteingang von Hand bestätigen - fuer den Blick ins Online-Banking,
 * bevor der Kontoauszug da ist. Wer bestaetigt hat, steht in der Notiz;
 * die spaetere Zuordnung der echten Kontobewegung bleibt moeglich.
 */
export async function markChargePaid(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/buchhaltung/offene-posten";

  const charge = await prisma.rentCharge.findUnique({ where: { id } });
  if (!charge) redirect(flash(back, "fehler", "Forderung nicht gefunden."));
  if (charge.status === "PAID") redirect(flash(back, "ok", "Bereits als bezahlt vermerkt."));

  const heute = formatDate(new Date());
  await prisma.rentCharge.update({
    where: { id },
    data: {
      status: "PAID",
      notes: [charge.notes, `Manuell bestätigt durch ${user.name} am ${heute}`]
        .filter(Boolean)
        .join(" · "),
    },
  });
  await audit(user.email, "mark-paid", "RentCharge", id);
  revalidatePath(back);
  revalidatePath("/");
  redirect(flash(back, "ok", "Als bezahlt vermerkt."));
}

/** Handbestätigung zurücknehmen - nur solange keine Kontobewegung zugeordnet ist. */
export async function reopenCharge(formData: FormData) {
  const user = await requireAdmin();
  const id = str(formData, "id");
  const back = str(formData, "back") || "/buchhaltung/offene-posten";

  const charge = await prisma.rentCharge.findUnique({
    where: { id },
    include: { allocations: { select: { id: true } } },
  });
  if (!charge) redirect(flash(back, "fehler", "Forderung nicht gefunden."));
  if (charge.allocations.length > 0) {
    redirect(
      flash(back, "fehler", "Dieser Forderung sind Kontobewegungen zugeordnet – bitte dort lösen."),
    );
  }

  await prisma.rentCharge.update({
    where: { id },
    data: {
      status: "OPEN",
      notes: [charge.notes, `Bestätigung zurückgenommen durch ${user.name} am ${formatDate(new Date())}`]
        .filter(Boolean)
        .join(" · "),
    },
  });
  await audit(user.email, "reopen", "RentCharge", id);
  revalidatePath(back);
  redirect(flash(back, "ok", "Forderung ist wieder offen."));
}
