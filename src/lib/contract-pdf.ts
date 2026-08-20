import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { formatCents } from "./money";
import { formatDate, formatDateTime } from "./dates";

/** Alle Daten, die im Vertrag stehen – bewusst als flacher Snapshot. */
export type ContractData = {
  contractNumber: string;

  landlordName: string;
  landlordStreet: string;
  landlordZip: string;
  landlordCity: string;
  landlordCountry: string;
  landlordPhone: string;
  landlordEmail: string;
  landlordVatId: string;
  bankName: string;
  bankIban: string;
  bankBic: string;

  tenantName: string;
  tenantBirthDate: string | null;
  tenantNationality: string | null;
  tenantIdNumber: string | null;
  tenantStreet: string | null;
  tenantZip: string | null;
  tenantCity: string | null;
  tenantCountry: string | null;
  tenantEmail: string;
  tenantPhone: string | null;
  tenantCompany: string | null;

  propertyName: string;
  propertyStreet: string;
  propertyZip: string;
  propertyCity: string;
  roomName: string;
  bedLabel: string;

  startDate: Date;
  endDate: Date | null;
  monthlyRentCents: number;
  utilitiesCents: number;
  depositCents: number;
  billingDay: number;
  reference: string;

  intro: string;
  clauses: string;
  houseRules: string;
  noticePeriod: string;

  signature?: {
    name: string;
    signedAt: Date;
    ip: string | null;
    dataUrl: string | null;
  } | null;
};

const MARGIN = 56;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.05, 0.4, 0.35);
const RULE = rgb(0.85, 0.87, 0.89);

/** pdf-lib-Standardschriften koennen nur WinAnsi – alles andere wuerde werfen. */
function winAnsi(value: string): string {
  return (value ?? "")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u2022/g, "\u00B7")
    // WinAnsi deckt ASCII, Latin-1 und das Eurozeichen ab; alles andere wuerde pdf-lib werfen.
    .replace(/[^\x20-\x7E\u00A1-\u00FF\u20AC]/g, "");
}

type Cursor = { page: PDFPage; y: number };

class Layout {
  readonly doc: PDFDocument;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  private cursor: Cursor;
  private pages: PDFPage[] = [];

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(page);
    this.cursor = { page, y: PAGE_HEIGHT - MARGIN };
  }

  get contentWidth(): number {
    return PAGE_WIDTH - MARGIN * 2;
  }

  get allPages(): PDFPage[] {
    return this.pages;
  }

  get page(): PDFPage {
    return this.cursor.page;
  }

  get y(): number {
    return this.cursor.y;
  }

  private ensure(space: number): void {
    if (this.cursor.y - space >= MARGIN + 40) return;
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(page);
    this.cursor = { page, y: PAGE_HEIGHT - MARGIN };
  }

  space(amount: number): void {
    this.cursor.y -= amount;
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of winAnsi(text).split("\n")) {
      if (!paragraph.trim()) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  text(
    value: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      x?: number;
      width?: number;
      lineHeight?: number;
    } = {},
  ): void {
    const size = options.size ?? 9.5;
    const font = options.bold ? this.bold : this.regular;
    const width = options.width ?? this.contentWidth;
    const lineHeight = options.lineHeight ?? size * 1.45;
    const lines = this.wrap(value, font, size, width);

    for (const line of lines) {
      this.ensure(lineHeight);
      this.cursor.page.drawText(line, {
        x: options.x ?? MARGIN,
        y: this.cursor.y - size,
        size,
        font,
        color: options.color ?? INK,
      });
      this.cursor.y -= lineHeight;
    }
  }

  heading(value: string): void {
    this.ensure(34);
    this.space(10);
    this.text(value, { size: 11.5, bold: true, color: ACCENT });
    this.space(3);
  }

  rule(): void {
    this.ensure(12);
    this.cursor.page.drawLine({
      start: { x: MARGIN, y: this.cursor.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.cursor.y },
      thickness: 0.75,
      color: RULE,
    });
    this.cursor.y -= 10;
  }

  /** Zweispaltige Datenzeile: Label links, Wert rechts. */
  row(label: string, value: string): void {
    const size = 9.5;
    const labelWidth = 165;
    const valueWidth = this.contentWidth - labelWidth;
    const valueLines = this.wrap(value || "-", this.regular, size, valueWidth);
    const height = Math.max(1, valueLines.length) * (size * 1.45);

    this.ensure(height);
    const top = this.cursor.y;
    this.cursor.page.drawText(winAnsi(label), {
      x: MARGIN,
      y: top - size,
      size,
      font: this.bold,
      color: MUTED,
    });
    valueLines.forEach((line, index) => {
      this.cursor.page.drawText(line, {
        x: MARGIN + labelWidth,
        y: top - size - index * (size * 1.45),
        size,
        font: this.regular,
        color: INK,
      });
    });
    this.cursor.y = top - height;
  }
}

function fullAddress(street: string | null, zip: string | null, city: string | null, country?: string | null) {
  const parts = [street, [zip, city].filter(Boolean).join(" "), country].filter(
    (part) => part && String(part).trim(),
  );
  return parts.join(", ") || "-";
}

export async function renderContractPdf(data: ContractData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Mietvertrag ${data.contractNumber}`);
  doc.setAuthor(data.landlordName);
  doc.setSubject("Mietvertrag über einen möblierten Schlafplatz zum vorübergehenden Gebrauch");
  doc.setProducer("Wohnwerk");
  doc.setCreator("Wohnwerk");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const layout = new Layout(doc, regular, bold);

  // --- Kopf ---------------------------------------------------------------
  layout.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 26,
    width: PAGE_WIDTH,
    height: 26,
    color: ACCENT,
  });

  layout.text("MIETVERTRAG", { size: 20, bold: true });
  layout.text("Möblierter Schlafplatz zum vorübergehenden Gebrauch (Monteurunterkunft)", {
    size: 9.5,
    color: MUTED,
  });
  layout.space(4);
  layout.text(`Vertragsnummer ${data.contractNumber}`, { size: 9.5, bold: true, color: ACCENT });
  layout.space(6);
  layout.rule();

  // --- Parteien -----------------------------------------------------------
  layout.heading("1. Vertragsparteien");
  layout.text("Vermieter", { size: 9.5, bold: true });
  layout.row("Name", data.landlordName);
  layout.row(
    "Anschrift",
    fullAddress(data.landlordStreet, data.landlordZip, data.landlordCity, data.landlordCountry),
  );
  if (data.landlordPhone) layout.row("Telefon", data.landlordPhone);
  if (data.landlordEmail) layout.row("E-Mail", data.landlordEmail);
  if (data.landlordVatId) layout.row("USt-IdNr.", data.landlordVatId);

  layout.space(8);
  layout.text("Mieter", { size: 9.5, bold: true });
  layout.row("Name", data.tenantName);
  if (data.tenantBirthDate) layout.row("Geburtsdatum", data.tenantBirthDate);
  if (data.tenantNationality) layout.row("Staatsangehörigkeit", data.tenantNationality);
  if (data.tenantIdNumber) layout.row("Ausweisnummer", data.tenantIdNumber);
  layout.row(
    "Meldeanschrift",
    fullAddress(data.tenantStreet, data.tenantZip, data.tenantCity, data.tenantCountry),
  );
  layout.row("E-Mail", data.tenantEmail);
  if (data.tenantPhone) layout.row("Telefon", data.tenantPhone);
  if (data.tenantCompany) layout.row("Entsendendes Unternehmen", data.tenantCompany);

  // --- Mietgegenstand -----------------------------------------------------
  layout.heading("2. Mietgegenstand");
  layout.row("Objekt", data.propertyName);
  layout.row("Anschrift", fullAddress(data.propertyStreet, data.propertyZip, data.propertyCity));
  layout.row("Zimmer", data.roomName);
  layout.row("Schlafplatz", data.bedLabel);
  layout.space(4);
  layout.text(data.intro, { size: 9.5 });

  // --- Mietzeit und Entgelt ----------------------------------------------
  layout.heading("3. Mietzeit und Mietzins");
  layout.row("Mietbeginn", formatDate(data.startDate));
  layout.row("Mietende", data.endDate ? formatDate(data.endDate) : "unbefristet");
  layout.row("Miete monatlich", formatCents(data.monthlyRentCents));
  if (data.utilitiesCents > 0) {
    layout.row("davon Nebenkosten", formatCents(data.utilitiesCents));
  }
  layout.row("Kaution", data.depositCents > 0 ? formatCents(data.depositCents) : "keine");
  layout.row("Fälligkeit", `zum ${data.billingDay}. eines jeden Monats im Voraus`);
  layout.row("Verwendungszweck", data.reference);
  if (data.bankIban) {
    layout.row(
      "Zahlung auf",
      [data.bankName, `IBAN ${data.bankIban}`, data.bankBic ? `BIC ${data.bankBic}` : null]
        .filter(Boolean)
        .join(" · "),
    );
  }
  layout.space(4);
  layout.text(data.noticePeriod, { size: 9.5 });

  // --- Bedingungen --------------------------------------------------------
  layout.heading("4. Vertragsbedingungen");
  layout.text(data.clauses, { size: 9.5 });

  layout.heading("5. Hausordnung");
  layout.text(data.houseRules, { size: 9.5 });

  // --- Unterschriften -----------------------------------------------------
  layout.heading("6. Unterschriften");
  layout.text(
    "Der Mieter bestätigt, den Vertrag und die Hausordnung gelesen zu haben und mit deren " +
      "Inhalt einverstanden zu sein. Die elektronische Unterschrift erfolgt gemäß § 126b BGB in Textform.",
    { size: 9 },
  );
  layout.space(16);

  const columnWidth = (layout.contentWidth - 30) / 2;
  const signatureTop = layout.y;

  // Vermieterseite
  layout.page.drawText(winAnsi(data.landlordName), {
    x: MARGIN,
    y: signatureTop - 12,
    size: 9.5,
    font: regular,
    color: INK,
  });
  layout.page.drawLine({
    start: { x: MARGIN, y: signatureTop - 60 },
    end: { x: MARGIN + columnWidth, y: signatureTop - 60 },
    thickness: 0.75,
    color: RULE,
  });
  layout.page.drawText("Vermieter", {
    x: MARGIN,
    y: signatureTop - 74,
    size: 8,
    font: regular,
    color: MUTED,
  });

  // Mieterseite
  const rightX = MARGIN + columnWidth + 30;
  if (data.signature?.dataUrl) {
    try {
      const base64 = data.signature.dataUrl.split(",")[1] ?? "";
      const png = await doc.embedPng(Buffer.from(base64, "base64"));
      const maxWidth = columnWidth;
      const maxHeight = 46;
      const scale = Math.min(maxWidth / png.width, maxHeight / png.height, 1);
      layout.page.drawImage(png, {
        x: rightX,
        y: signatureTop - 58,
        width: png.width * scale,
        height: png.height * scale,
      });
    } catch (error) {
      console.error("[contract-pdf] Unterschrift konnte nicht eingebettet werden:", error);
    }
  }
  layout.page.drawLine({
    start: { x: rightX, y: signatureTop - 60 },
    end: { x: rightX + columnWidth, y: signatureTop - 60 },
    thickness: 0.75,
    color: RULE,
  });
  layout.page.drawText(winAnsi(data.signature ? data.signature.name : data.tenantName), {
    x: rightX,
    y: signatureTop - 74,
    size: 8,
    font: regular,
    color: MUTED,
  });
  layout.page.drawText("Mieter", {
    x: rightX,
    y: signatureTop - 86,
    size: 8,
    font: regular,
    color: MUTED,
  });

  layout.space(110);

  if (data.signature) {
    layout.text(
      `Elektronisch unterschrieben am ${formatDateTime(data.signature.signedAt)}` +
        (data.signature.ip ? ` von IP-Adresse ${data.signature.ip}` : "") +
        `. Signaturprotokoll zur Vertragsnummer ${data.contractNumber}.`,
      { size: 8, color: MUTED },
    );
  } else {
    layout.text(
      "Dieses Dokument ist ein Entwurf und wird mit der elektronischen Unterschrift des Mieters gültig.",
      { size: 8, color: MUTED },
    );
  }

  // --- Fusszeilen ---------------------------------------------------------
  const pages = layout.allPages;
  pages.forEach((page, index) => {
    page.drawText(
      winAnsi(`${data.landlordName} · Vertrag ${data.contractNumber} · Seite ${index + 1} von ${pages.length}`),
      { x: MARGIN, y: 28, size: 7.5, font: regular, color: MUTED },
    );
  });

  return Buffer.from(await doc.save());
}
