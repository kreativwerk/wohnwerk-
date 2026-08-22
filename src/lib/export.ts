import "server-only";

import { prisma } from "./db";
import { FOLDER, uploadFile } from "./storage";
import { buildDatevCsv } from "./datev";
import { formatDate } from "./dates";
import { CHARGE_STATUS_LABEL, DOCUMENT_KIND_LABEL, TX_REVIEW_STATUS_LABEL } from "./enums";

/**
 * Ausgabe fuer den Steuerberater.
 *
 * Bewusst als CSV mit Semikolon und UTF-8-BOM: das oeffnet in Excel und
 * LibreOffice ohne Nachfragen und laesst sich in jede Buchhaltungssoftware
 * importieren. Zu jeder Buchung steht der Link zum Beleg in Drive daneben,
 * damit der Steuerberater nicht suchen muss.
 */

const BOM = "﻿";

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[";\n\r]/.test(text)) return `"${text.split('"').join('""')}"`;
  return text;
}

function csv(rows: Array<Array<unknown>>): string {
  return BOM + rows.map((row) => row.map(csvValue).join(";")).join("\r\n") + "\r\n";
}

function amount(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function periodRange(year: number, month?: number): { from: Date; to: Date } {
  if (month) {
    return {
      from: new Date(Date.UTC(year, month - 1, 1)),
      to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
    };
  }
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

/** Alle Bankbuchungen des Zeitraums inklusive Beleg- und Mietzuordnung. */
export async function buildTransactionCsv(year: number, month?: number): Promise<string> {
  const { from, to } = periodRange(year, month);

  const transactions = await prisma.bankTransaction.findMany({
    where: { bookingDate: { gte: from, lte: to } },
    include: {
      bankAccount: { select: { name: true, iban: true } },
      property: { select: { name: true } },
      documents: { select: { title: true, driveUrl: true, localPath: true, fileName: true } },
      allocations: {
        include: {
          rentCharge: {
            include: {
              tenancy: {
                include: { tenant: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
  });

  const rows: Array<Array<unknown>> = [
    [
      "Buchungsdatum",
      "Valuta",
      "Konto",
      "IBAN Konto",
      "Betrag EUR",
      "Soll/Haben",
      "Kategorie",
      "Gegenpartei",
      "IBAN Gegenpartei",
      "Verwendungszweck",
      "Objekt",
      "Mieter",
      "Mietmonat",
      "Belegtitel",
      "Beleg-Link",
      "Status",
      "Notiz",
    ],
  ];

  for (const tx of transactions) {
    const tenants = tx.allocations
      .map((a) => `${a.rentCharge.tenancy.tenant.firstName} ${a.rentCharge.tenancy.tenant.lastName}`.trim())
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .join(", ");
    const periods = tx.allocations
      .map((a) => `${String(a.rentCharge.periodMonth).padStart(2, "0")}/${a.rentCharge.periodYear}`)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .join(", ");

    rows.push([
      formatDate(tx.bookingDate),
      tx.valueDate ? formatDate(tx.valueDate) : "",
      tx.bankAccount.name,
      tx.bankAccount.iban,
      amount(tx.amountCents),
      tx.direction === "CREDIT" ? "Haben" : "Soll",
      tx.category ?? "",
      tx.counterpartyName ?? "",
      tx.counterpartyIban ?? "",
      tx.purpose ?? "",
      tx.property?.name ?? "",
      tenants,
      periods,
      tx.documents.map((d) => d.title).join(" | "),
      tx.documents.map((d) => d.driveUrl ?? d.localPath ?? "").filter(Boolean).join(" | "),
      TX_REVIEW_STATUS_LABEL[tx.reviewStatus] ?? tx.reviewStatus,
      tx.notes ?? "",
    ]);
  }

  return csv(rows);
}

/** Belegliste mit Ablageort – die Gegenprobe zur Buchungsliste. */
export async function buildDocumentCsv(year: number, month?: number): Promise<string> {
  const { from, to } = periodRange(year, month);

  const documents = await prisma.document.findMany({
    where: {
      OR: [
        { documentDate: { gte: from, lte: to } },
        { documentDate: null, uploadedAt: { gte: from, lte: to } },
      ],
    },
    include: {
      property: { select: { name: true } },
      tenant: { select: { firstName: true, lastName: true } },
      bankTransaction: { select: { bookingDate: true, amountCents: true, purpose: true } },
    },
    orderBy: [{ documentDate: "asc" }, { uploadedAt: "asc" }],
  });

  const rows: Array<Array<unknown>> = [
    [
      "Belegdatum",
      "Art",
      "Titel",
      "Lieferant",
      "Betrag EUR",
      "USt-Satz %",
      "Kategorie",
      "Objekt",
      "Mieter",
      "Zugeordnete Buchung",
      "Dateiname",
      "Ablage",
      "Notiz",
    ],
  ];

  for (const doc of documents) {
    rows.push([
      formatDate(doc.documentDate ?? doc.uploadedAt),
      DOCUMENT_KIND_LABEL[doc.kind] ?? doc.kind,
      doc.title,
      doc.supplier ?? "",
      amount(doc.amountCents),
      doc.vatRatePct ?? "",
      doc.category ?? "",
      doc.property?.name ?? "",
      doc.tenant ? `${doc.tenant.firstName} ${doc.tenant.lastName}`.trim() : "",
      doc.bankTransaction
        ? `${formatDate(doc.bankTransaction.bookingDate)} / ${amount(doc.bankTransaction.amountCents)} EUR`
        : "",
      doc.fileName,
      doc.driveUrl ?? doc.localPath ?? "",
      doc.notes ?? "",
    ]);
  }

  return csv(rows);
}

/** Mietuebersicht: was war je Monat gefordert, was ist eingegangen. */
export async function buildRentCsv(year: number): Promise<string> {
  const charges = await prisma.rentCharge.findMany({
    where: { periodYear: year },
    include: {
      allocations: { include: { bankTransaction: { select: { bookingDate: true } } } },
      tenancy: {
        include: {
          tenant: { select: { firstName: true, lastName: true, company: true } },
          bed: { include: { room: { include: { property: true } } } },
        },
      },
    },
    orderBy: [{ periodMonth: "asc" }, { dueDate: "asc" }],
  });

  const rows: Array<Array<unknown>> = [
    [
      "Monat",
      "Faellig am",
      "Objekt",
      "Zimmer",
      "Bett",
      "Mieter",
      "Firma",
      "Referenz",
      "Soll EUR",
      "Bezahlt EUR",
      "Offen EUR",
      "Status",
      "Zahlungseingang",
    ],
  ];

  for (const charge of charges) {
    const paid = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    const bed = charge.tenancy.bed;
    rows.push([
      `${String(charge.periodMonth).padStart(2, "0")}/${charge.periodYear}`,
      formatDate(charge.dueDate),
      bed.room.property.name,
      bed.room.name,
      bed.label,
      `${charge.tenancy.tenant.firstName} ${charge.tenancy.tenant.lastName}`.trim(),
      charge.tenancy.tenant.company ?? "",
      charge.tenancy.reference,
      amount(charge.amountCents),
      amount(paid),
      amount(Math.max(0, charge.amountCents - paid)),
      CHARGE_STATUS_LABEL[charge.status] ?? charge.status,
      charge.allocations
        .map((a) => formatDate(a.bankTransaction.bookingDate))
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .join(", "),
    ]);
  }

  return csv(rows);
}

export type ExportResult = {
  year: number;
  month?: number;
  files: Array<{ name: string; url: string | null; backend: string }>;
};

/**
 * Legt den kompletten Export im Drive-Ordner des Jahres ab. Der Steuerberater
 * bekommt genau diesen Ordner freigegeben und findet dort Auswertung und Belege.
 */
export async function exportToDrive(year: number, month?: number): Promise<ExportResult> {
  const suffix = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);

  const parts: Array<{ name: string; data: Buffer }> = [
    { name: `Buchungen ${suffix}.csv`, data: Buffer.from(await buildTransactionCsv(year, month), "utf8") },
    { name: `Belegliste ${suffix}.csv`, data: Buffer.from(await buildDocumentCsv(year, month), "utf8") },
    // DATEV-Buchungsstapel: die Datei, die die Kanzlei direkt einliest.
    { name: `EXTF_Buchungsstapel_${suffix}.csv`, data: await buildDatevCsv(year, month) },
  ];
  if (!month) {
    parts.push({ name: `Mieten ${year}.csv`, data: Buffer.from(await buildRentCsv(year), "utf8") });
  }

  const files: ExportResult["files"] = [];
  for (const part of parts) {
    const stored = await uploadFile({
      fileName: part.name,
      mimeType: "text/csv",
      data: part.data,
      folderSegments: FOLDER.exports(year),
    });
    files.push({ name: part.name, url: stored.url, backend: stored.backend });

    // Jeder abgelegte Export erscheint im Exportordner der Anwendung -
    // damit nachvollziehbar bleibt, welcher Stand wann uebergeben wurde.
    await prisma.document.create({
      data: {
        kind: "EXPORT",
        title: part.name.replace(/\.csv$/, ""),
        fileName: part.name,
        mimeType: "text/csv",
        sizeBytes: part.data.byteLength,
        driveFileId: stored.fileId,
        driveUrl: stored.url,
        driveFolder: stored.folder,
        localPath: stored.localPath,
        documentDate: new Date(),
        category: "Steuerberater-Export",
      },
    });
  }

  return { year, month, files };
}
