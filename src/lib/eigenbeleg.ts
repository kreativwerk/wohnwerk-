import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { prisma } from "./db";
import { formatDate } from "./dates";
import { formatCents } from "./money";
import { getSettings } from "./settings";

/**
 * Eigenbelege fuer Qonto-Gebuehren. Qonto bucht Gebuehren (je Ueberweisung,
 * Abo, Zusatznutzer) direkt vom Konto ab, oft ohne eigene Rechnung. Damit
 * jede Ausgabe einen Beleg hat, entsteht dafuer ein Eigenbeleg: erzeugt bei
 * Bedarf als PDF aus der Buchung, ohne gespeicherte Datei.
 */

const ART: Record<string, string> = {
  sepa_inbound_transfer: "Gebühr für eingehende SEPA-Überweisung",
  sepa_outbound_transfer: "Gebühr für ausgehende SEPA-Überweisung",
  sepa_instant_inbound_transfer: "Gebühr für eingehende Echtzeitüberweisung",
  sepa_instant_outbound_transfer: "Gebühr für ausgehende Echtzeitüberweisung",
  additional_user: "Monatsgebühr für zusätzlichen Nutzer",
  card: "Kartengebühr",
};

export function istQontoGebuehr(tx: { direction: string; counterpartyName: string | null; bankTxCode: string | null; purpose: string | null }): boolean {
  if (tx.direction !== "DEBIT") return false;
  if (tx.bankTxCode === "qonto_fee") return true;
  return /^qonto$/i.test((tx.counterpartyName ?? "").trim()) && /abonnement|gebühr|gebuehr|fee/i.test(tx.purpose ?? "");
}

/** "sepa_inbound_transfer" -> "Gebühr für eingehende SEPA-Überweisung"; Abo-Kennungen als Kontoführung. */
export function gebuehrArt(purpose: string | null): string {
  const roh = (purpose ?? "").trim();
  if (ART[roh]) return ART[roh];
  if (/^solo_|^standard_|^essential_|^basic_|_20\d{2}/i.test(roh)) return `Kontoführungsgebühr (Abonnement ${roh})`;
  return roh || "Bankgebühr";
}

function winAnsi(value: string): string {
  return (value ?? "")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ | /g, " ")
    .replace(/[^\x20-\x7E¡-ÿ€]/g, "");
}

export async function eigenbelegPdf(bankTransactionId: string): Promise<Uint8Array | null> {
  const [tx, settings] = await Promise.all([
    prisma.bankTransaction.findUnique({ where: { id: bankTransactionId }, include: { bankAccount: { select: { name: true, iban: true } } } }),
    getSettings(),
  ]);
  if (!tx) return null;

  const doc = await PDFDocument.create();
  doc.setTitle(`Eigenbeleg Qonto-Gebühr ${formatDate(tx.bookingDate)}`);
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grau = rgb(0.35, 0.38, 0.38);
  let y = 780;
  const text = (s: string, opt: { size?: number; font?: typeof regular; x?: number; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(winAnsi(s), { x: opt.x ?? 60, y, size: opt.size ?? 11, font: opt.font ?? regular, color: opt.color ?? rgb(0.1, 0.12, 0.12) });
  };

  text(settings.companyName, { font: bold, size: 12 });
  y -= 15;
  text(`${settings.companyStreet}, ${settings.companyZip} ${settings.companyCity}`, { color: grau, size: 10 });
  y -= 50;
  text("EIGENBELEG", { font: bold, size: 18 });
  y -= 20;
  text("Bankgebühr ohne gesonderte Rechnung", { color: grau });
  y -= 40;

  const zeilen: Array<[string, string]> = [
    ["Belegdatum", formatDate(tx.bookingDate)],
    ["Zahlungsempfänger", "Qonto (Kontoanbieter)"],
    ["Art der Ausgabe", gebuehrArt(tx.purpose)],
    ["Betrag", formatCents(Math.abs(tx.amountCents))],
    ["Bezahlt über", `${tx.bankAccount.name} · ${tx.bankAccount.iban}`],
    ["Buchungstext", tx.purpose ?? "–"],
    ["Kategorie", "Bankgebühren"],
  ];
  for (const [k, v] of zeilen) {
    text(k, { color: grau, size: 10 });
    text(v, { x: 200 });
    y -= 22;
  }

  y -= 20;
  for (const zeile of [
    "Begründung: Die Gebühr wurde von Qonto direkt vom Geschäftskonto abgebucht.",
    "Eine gesonderte Rechnung liegt für diesen Einzelbetrag nicht vor; die Abbuchung",
    "ist durch den Kontoauszug nachgewiesen. Der Betrag ist betrieblich veranlasst.",
  ]) {
    text(zeile, { size: 10 });
    y -= 15;
  }

  y -= 50;
  if (settings.landlordSignature?.startsWith("data:image/png;base64,")) {
    try {
      const bild = await doc.embedPng(Buffer.from(settings.landlordSignature.split(",")[1], "base64"));
      const hoehe = 40;
      const breite = (bild.width / bild.height) * hoehe;
      page.drawImage(bild, { x: 60, y: y - 5, width: Math.min(breite, 180), height: hoehe });
    } catch {
      // Ohne Unterschriftsbild bleibt die Linie zum Unterschreiben.
    }
  }
  y -= 10;
  page.drawLine({ start: { x: 60, y }, end: { x: 260, y }, thickness: 0.6, color: grau });
  y -= 14;
  text(`${settings.companyCity}, ${formatDate(tx.bookingDate)} · Unterschrift`, { color: grau, size: 9 });

  page.drawText(winAnsi(`Erstellt durch die Wohnwerk-Verwaltung · Buchung ${tx.id}`), { x: 60, y: 40, size: 8, font: regular, color: grau });
  return doc.save();
}

/**
 * Jede Qonto-Gebuehr ohne Beleg bekommt einen Eigenbeleg und gilt als
 * gebucht. Idempotent: Gebuehren mit Beleg werden uebersprungen.
 */
export async function eigenbelegeFuerGebuehren(): Promise<number> {
  const kandidaten = await prisma.bankTransaction.findMany({
    where: { direction: "DEBIT", reviewStatus: { not: "IGNORED" }, documents: { none: {} } },
    select: { id: true, direction: true, counterpartyName: true, bankTxCode: true, purpose: true, bookingDate: true, amountCents: true, propertyId: true },
  });
  let anzahl = 0;
  for (const tx of kandidaten) {
    if (!istQontoGebuehr(tx)) continue;
    await prisma.document.create({
      data: {
        kind: "RECEIPT",
        title: `Eigenbeleg Qonto-Gebühr – ${gebuehrArt(tx.purpose)}`,
        fileName: `Eigenbeleg Qonto ${tx.bookingDate.toISOString().slice(0, 10)}.pdf`,
        mimeType: "application/pdf",
        driveUrl: `/api/eigenbeleg/${tx.id}`,
        documentDate: tx.bookingDate,
        amountCents: Math.abs(tx.amountCents),
        supplier: "Qonto",
        category: "Bankgebühren",
        notes: "Eigenbeleg – Bankgebühr ohne gesonderte Rechnung",
        bankTransactionId: tx.id,
        propertyId: tx.propertyId,
      },
    });
    await prisma.bankTransaction.update({ where: { id: tx.id }, data: { reviewStatus: "BOOKED", category: "Bankgebühren" } });
    anzahl += 1;
  }
  return anzahl;
}
