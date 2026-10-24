import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { prisma } from "./db";
import { formatDate } from "./dates";
import { formatCents } from "./money";
import { getSettings } from "./settings";
import { monateAusText } from "./zuordnung";
import { gebuehrArt, istKautionsRueckzahlung, istQontoGebuehr, objektZurMietzahlung } from "./eigenbeleg-regeln";
import { mieterPasst } from "./zuordnung";

export { adressSchluessel, gebuehrArt, istKautionsRueckzahlung, istQontoGebuehr, objektZurMietzahlung } from "./eigenbeleg-regeln";

/**
 * Eigenbelege fuer Qonto-Gebuehren. Qonto bucht Gebuehren (je Ueberweisung,
 * Abo, Zusatznutzer) direkt vom Konto ab, oft ohne eigene Rechnung. Damit
 * jede Ausgabe einen Beleg hat, entsteht dafuer ein Eigenbeleg: erzeugt bei
 * Bedarf als PDF aus der Buchung, ohne gespeicherte Datei.
 */

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

  const gebuehr = istQontoGebuehr(tx);
  const kaution = !gebuehr && istKautionsRueckzahlung(tx);
  const mietverhaeltnis = kaution && tx.tenantId
    ? await prisma.tenancy.findFirst({
        where: { tenantId: tx.tenantId },
        orderBy: { startDate: "desc" },
        include: { tenant: true, bed: { include: { room: { include: { property: true } } } } },
      })
    : null;
  const objekt = !gebuehr && !kaution && tx.propertyId
    ? await prisma.property.findUnique({ where: { id: tx.propertyId }, select: { name: true, street: true, zip: true, city: true, ownerName: true } })
    : null;
  const monate = monateAusText(tx.purpose, tx.bookingDate);
  const zeitraum = monate.length > 0
    ? monate.map((m) => `${String(m.monat).padStart(2, "0")}/${m.jahr}`).join(", ")
    : `${String(tx.bookingDate.getUTCMonth() + 1).padStart(2, "0")}/${tx.bookingDate.getUTCFullYear()}`;

  const doc = await PDFDocument.create();
  doc.setTitle(
    gebuehr
      ? `Eigenbeleg Qonto-Gebühr ${formatDate(tx.bookingDate)}`
      : kaution
        ? `Eigenbeleg Kautionsrückzahlung ${formatDate(tx.bookingDate)}`
        : `Eigenbeleg Objektmiete ${formatDate(tx.bookingDate)}`,
  );
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
  text(
    gebuehr ? "Bankgebühr ohne gesonderte Rechnung" : kaution ? "Rückzahlung der Mietkaution an den Mieter" : "Mietzahlung an den Vermieter (Objektmiete)",
    { color: grau },
  );
  y -= 40;

  const kautionZeilen: Array<[string, string]> = mietverhaeltnis
    ? [
        ["Belegdatum", formatDate(tx.bookingDate)],
        ["Zahlungsempfänger", `${mietverhaeltnis.tenant.firstName} ${mietverhaeltnis.tenant.lastName}`],
        ["Unterkunft", `${mietverhaeltnis.bed.room.property.name} · ${mietverhaeltnis.bed.room.name} · ${mietverhaeltnis.bed.label}`],
        ["Mietzeitraum", `${formatDate(mietverhaeltnis.startDate)} – ${mietverhaeltnis.endDate ? formatDate(mietverhaeltnis.endDate) : "laufend"}`],
        ["Vereinbarte Kaution", formatCents(mietverhaeltnis.depositCents)],
        ["Zurückgezahlt", formatCents(Math.abs(tx.amountCents))],
        ["Bezahlt über", `${tx.bankAccount.name} · ${tx.bankAccount.iban}`],
        ["Buchungstext", (tx.purpose ?? "–").slice(0, 70)],
      ]
    : [
        ["Belegdatum", formatDate(tx.bookingDate)],
        ["Zahlungsempfänger", tx.counterpartyName ?? "–"],
        ["Zurückgezahlt", formatCents(Math.abs(tx.amountCents))],
        ["Bezahlt über", `${tx.bankAccount.name} · ${tx.bankAccount.iban}`],
        ["Buchungstext", (tx.purpose ?? "–").slice(0, 70)],
      ];
  const zeilen: Array<[string, string]> = kaution ? kautionZeilen : gebuehr
    ? [
        ["Belegdatum", formatDate(tx.bookingDate)],
        ["Zahlungsempfänger", "Qonto (Kontoanbieter)"],
        ["Art der Ausgabe", gebuehrArt(tx.purpose)],
        ["Betrag", formatCents(Math.abs(tx.amountCents))],
        ["Bezahlt über", `${tx.bankAccount.name} · ${tx.bankAccount.iban}`],
        ["Buchungstext", tx.purpose ?? "–"],
        ["Kategorie", "Bankgebühren"],
      ]
    : [
        ["Belegdatum", formatDate(tx.bookingDate)],
        ["Zahlungsempfänger", tx.counterpartyName ?? objekt?.ownerName ?? "–"],
        ["Objekt", objekt ? [objekt.name, [objekt.street, [objekt.zip, objekt.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")].join(" · ") : "–"],
        ["Mietzeitraum", zeitraum],
        ["Betrag", formatCents(Math.abs(tx.amountCents))],
        ["Bezahlt über", `${tx.bankAccount.name} · ${tx.bankAccount.iban}`],
        ["Buchungstext", (tx.purpose ?? "–").slice(0, 70)],
        ["Kategorie", "Objektmiete (Ausgabe)"],
      ];
  for (const [k, v] of zeilen) {
    text(k, { color: grau, size: 10 });
    text(v, { x: 200 });
    y -= 22;
  }

  y -= 20;
  for (const zeile of kaution
    ? [
        "Begründung: Rückzahlung der beim Einzug hinterlegten Mietkaution nach dem Auszug.",
        "Die Kaution war eine Sicherheitsleistung des Mieters und keine Einnahme; die",
        "Rückzahlung ist daher keine Ausgabe. Nachweis durch den Kontoauszug.",
      ]
    : gebuehr
    ? [
        "Begründung: Die Gebühr wurde von Qonto direkt vom Geschäftskonto abgebucht.",
        "Eine gesonderte Rechnung liegt für diesen Einzelbetrag nicht vor; die Abbuchung",
        "ist durch den Kontoauszug nachgewiesen. Der Betrag ist betrieblich veranlasst.",
      ]
    : [
        "Begründung: Monatliche Miete für das angemietete Objekt laut Mietvertrag mit dem",
        "Vermieter. Der Mietvertrag gilt als Dauerbeleg; eine monatliche Rechnung wird",
        "nicht ausgestellt. Die Zahlung ist durch den Kontoauszug nachgewiesen.",
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
  const [kandidaten, objekte] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { direction: "DEBIT", reviewStatus: { not: "IGNORED" }, documents: { none: {} } },
      select: { id: true, direction: true, counterpartyName: true, bankTxCode: true, purpose: true, bookingDate: true, amountCents: true, propertyId: true, tenantId: true },
    }),
    prisma.property.findMany({ where: { tenure: "ANGEMIETET" }, select: { id: true, name: true, street: true, ownerName: true } }),
  ]);
  let anzahl = 0;
  const mieter = await prisma.tenant.findMany({
    select: { id: true, firstName: true, lastName: true, company: true, tenancies: { orderBy: { startDate: "desc" }, select: { id: true, depositRefundedAt: true, bed: { select: { room: { select: { propertyId: true } } } } } } },
  });
  for (const tx of kandidaten) {
    // Kautionsrueckzahlung an einen Mieter: Eigenbeleg, Kaution abhaken.
    if (istKautionsRueckzahlung(tx)) {
      const passend = mieter.filter((m) => mieterPasst(`${tx.counterpartyName ?? ""} ${tx.purpose ?? ""}`, m));
      const person = passend.length === 1 ? passend[0] : null;
      const mietverhaeltnis = person?.tenancies[0] ?? null;
      await prisma.document.create({
        data: {
          kind: "RECEIPT",
          title: `Eigenbeleg Kautionsrückzahlung – ${person ? `${person.firstName} ${person.lastName}` : tx.counterpartyName ?? "Mieter"}`,
          fileName: `Eigenbeleg Kaution ${tx.bookingDate.toISOString().slice(0, 10)}.pdf`,
          mimeType: "application/pdf",
          driveUrl: `/api/eigenbeleg/${tx.id}`,
          documentDate: tx.bookingDate,
          amountCents: Math.abs(tx.amountCents),
          supplier: tx.counterpartyName,
          category: "Kaution",
          notes: "Eigenbeleg – Rückzahlung der Mietkaution",
          bankTransactionId: tx.id,
          tenantId: person?.id ?? null,
          propertyId: tx.propertyId ?? mietverhaeltnis?.bed.room.propertyId ?? null,
        },
      });
      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          reviewStatus: "BOOKED",
          category: "Kaution",
          tenantId: person?.id ?? undefined,
          propertyId: tx.propertyId ?? mietverhaeltnis?.bed.room.propertyId ?? undefined,
        },
      });
      if (mietverhaeltnis && !mietverhaeltnis.depositRefundedAt) {
        await prisma.tenancy.update({
          where: { id: mietverhaeltnis.id },
          data: { depositRefundedAt: tx.bookingDate, depositRefundCents: Math.abs(tx.amountCents) },
        });
        // Offene Kautionsabzuege sind damit verrechnet.
        await prisma.tenantNote.updateMany({ where: { tenantId: person!.id, erledigt: false, grund: { not: null } }, data: { erledigt: true } });
      }
      anzahl += 1;
      continue;
    }
    // Mietzahlung an einen Vermieter: Eigenbeleg Objektmiete, Objekt zuordnen.
    const objekt = objektZurMietzahlung(tx, objekte);
    if (objekt) {
      await prisma.document.create({
        data: {
          kind: "RECEIPT",
          title: `Eigenbeleg Objektmiete – ${objekt.name}`,
          fileName: `Eigenbeleg Objektmiete ${tx.bookingDate.toISOString().slice(0, 10)}.pdf`,
          mimeType: "application/pdf",
          driveUrl: `/api/eigenbeleg/${tx.id}`,
          documentDate: tx.bookingDate,
          amountCents: Math.abs(tx.amountCents),
          supplier: tx.counterpartyName ?? objekt.ownerName,
          category: "Objektmiete (Ausgabe)",
          notes: "Eigenbeleg – Mietzahlung laut Mietvertrag (Dauerbeleg)",
          bankTransactionId: tx.id,
          propertyId: objekt.id,
        },
      });
      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: { reviewStatus: "BOOKED", category: "Objektmiete (Ausgabe)", propertyId: tx.propertyId ?? objekt.id },
      });
      anzahl += 1;
      continue;
    }
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
