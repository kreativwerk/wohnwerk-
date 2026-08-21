import { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts, rgb } from "pdf-lib";

/**
 * Vordrucke eines Objekts befuellen.
 *
 * Die Wohnungsgeberbestaetigung nach § 19 BMG gibt jede Kommune in eigener
 * Gestaltung heraus. Ein Nachbau waere jedes Mal falsch, sobald die Behoerde
 * ihr Formular aendert. Deshalb wird die hochgeladene Datei nie neu gezeichnet:
 * sie wird geladen, ihre Formularfelder werden gefuellt und anschliessend
 * festgeschrieben. Alles ausserhalb der Felder bleibt unberuehrt.
 */

export const TEMPLATE_KIND = {
  CONTRACT: "CONTRACT",
  LANDLORD_CONFIRMATION: "LANDLORD_CONFIRMATION",
  COMBINED: "COMBINED",
} as const;

export type TemplateKind = (typeof TEMPLATE_KIND)[keyof typeof TEMPLATE_KIND];

export const TEMPLATE_KIND_LABEL: Record<string, string> = {
  CONTRACT: "Mietvertrag",
  LANDLORD_CONFIRMATION: "Wohnungsgeberbestätigung",
  COMBINED: "Mietvertrag mit Wohnungsgeberbestätigung",
};

/** Deckt eine Vorlage dieser Art die Wohnungsgeberbestaetigung ab? */
export function coversLandlordConfirmation(kind: string): boolean {
  return kind === TEMPLATE_KIND.LANDLORD_CONFIRMATION || kind === TEMPLATE_KIND.COMBINED;
}

/** Deckt eine Vorlage dieser Art den Mietvertrag ab? */
export function coversContract(kind: string): boolean {
  return kind === TEMPLATE_KIND.CONTRACT || kind === TEMPLATE_KIND.COMBINED;
}

// --- Platzhalter -----------------------------------------------------------

export type PlaceholderKey =
  | "mieter.vorname"
  | "mieter.nachname"
  | "mieter.name"
  | "mieter.strasse"
  | "mieter.plz"
  | "mieter.ort"
  | "mieter.plzOrt"
  | "mieter.geburtsdatum"
  | "mieter.geburtsort"
  | "mieter.staatsangehoerigkeit"
  | "mieter.ausweisnummer"
  | "mieter.telefon"
  | "mieter.email"
  | "mieter.arbeitgeber"
  | "mietbeginn"
  | "mietende"
  | "objekt.name"
  | "objekt.strasse"
  | "objekt.plz"
  | "objekt.ort"
  | "objekt.plzOrt"
  | "zimmer"
  | "bett"
  | "miete"
  | "kaution"
  | "vertragsnummer"
  | "vermieter.name"
  | "vermieter.strasse"
  | "vermieter.plzOrt"
  | "heute"
  | "ort"
  | "ortDatum"
  | "mieter.unterschrift";

export const PLACEHOLDERS: Array<{ key: PlaceholderKey; label: string; group: string }> = [
  { key: "mieter.vorname", label: "Vorname", group: "Mieter" },
  { key: "mieter.nachname", label: "Nachname", group: "Mieter" },
  { key: "mieter.name", label: "Vor- und Nachname", group: "Mieter" },
  { key: "mieter.strasse", label: "Straße und Hausnummer", group: "Mieter" },
  { key: "mieter.plz", label: "PLZ", group: "Mieter" },
  { key: "mieter.ort", label: "Ort", group: "Mieter" },
  { key: "mieter.plzOrt", label: "PLZ und Ort", group: "Mieter" },
  { key: "mieter.geburtsdatum", label: "Geburtsdatum", group: "Mieter" },
  { key: "mieter.geburtsort", label: "Geburtsort", group: "Mieter" },
  { key: "mieter.staatsangehoerigkeit", label: "Staatsangehörigkeit", group: "Mieter" },
  { key: "mieter.ausweisnummer", label: "Ausweisnummer", group: "Mieter" },
  { key: "mieter.telefon", label: "Telefon", group: "Mieter" },
  { key: "mieter.email", label: "E-Mail", group: "Mieter" },
  { key: "mieter.arbeitgeber", label: "Arbeitgeber", group: "Mieter" },
  { key: "mieter.unterschrift", label: "Unterschrift (Bild)", group: "Mieter" },

  { key: "mietbeginn", label: "Mietbeginn / Einzugsdatum", group: "Mietverhältnis" },
  { key: "mietende", label: "Mietende", group: "Mietverhältnis" },
  { key: "zimmer", label: "Zimmer", group: "Mietverhältnis" },
  { key: "bett", label: "Bett", group: "Mietverhältnis" },
  { key: "miete", label: "Monatsmiete", group: "Mietverhältnis" },
  { key: "kaution", label: "Kaution", group: "Mietverhältnis" },
  { key: "vertragsnummer", label: "Vertragsnummer", group: "Mietverhältnis" },

  { key: "objekt.name", label: "Bezeichnung", group: "Objekt" },
  { key: "objekt.strasse", label: "Straße und Hausnummer", group: "Objekt" },
  { key: "objekt.plz", label: "PLZ", group: "Objekt" },
  { key: "objekt.ort", label: "Ort", group: "Objekt" },
  { key: "objekt.plzOrt", label: "PLZ und Ort", group: "Objekt" },

  { key: "vermieter.name", label: "Name", group: "Vermieter" },
  { key: "vermieter.strasse", label: "Straße und Hausnummer", group: "Vermieter" },
  { key: "vermieter.plzOrt", label: "PLZ und Ort", group: "Vermieter" },

  { key: "heute", label: "Heutiges Datum", group: "Ausstellung" },
  { key: "ort", label: "Ausstellungsort", group: "Ausstellung" },
  { key: "ortDatum", label: "Ort und heutiges Datum", group: "Ausstellung" },
];

const PLACEHOLDER_KEYS = new Set<string>(PLACEHOLDERS.map((p) => p.key));

export function isPlaceholder(value: string): value is PlaceholderKey {
  return PLACEHOLDER_KEYS.has(value);
}

// --- Vorlage einlesen ------------------------------------------------------

export type TemplateField = { name: string; type: "text" | "checkbox" | "sonstiges"; pages: number[] };

export type TemplateInfo = {
  pageCount: number;
  fields: TemplateField[];
};

/** Liest Seitenzahl und Formularfelder einer hochgeladenen PDF. */
export async function inspectTemplate(bytes: Uint8Array): Promise<TemplateInfo> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  let fields: TemplateField[] = [];
  try {
    fields = doc
      .getForm()
      .getFields()
      .map((field) => {
        const seiten = field.acroField
          .getWidgets()
          .map((widget) => pages.findIndex((page) => page.ref === widget.P()) + 1)
          .filter((nummer) => nummer > 0);
        return {
          name: field.getName(),
          type:
            field instanceof PDFTextField
              ? ("text" as const)
              : field instanceof PDFCheckBox
                ? ("checkbox" as const)
                : ("sonstiges" as const),
          pages: [...new Set(seiten)].sort((a, b) => a - b),
        };
      });
  } catch {
    // PDF ohne AcroForm: bleibt bei einer leeren Feldliste.
  }

  return { pageCount: pages.length, fields };
}

// --- Felder automatisch zuordnen ------------------------------------------

/**
 * Raet die Zuordnung anhand der Feldnamen. Behoerdenvordrucke benennen ihre
 * Felder erfahrungsgemaess nah an der gedruckten Beschriftung, deshalb trifft
 * das in den allermeisten Faellen zu. Korrigieren laesst es sich trotzdem.
 */
export function autoMap(fieldNames: string[]): Record<string, PlaceholderKey> {
  const map: Record<string, PlaceholderKey> = {};

  for (const name of fieldNames) {
    const n = name
      .toLowerCase()
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .replace(/ß/g, "ss");

    const hat = (...teile: string[]) => teile.some((t) => n.includes(t));

    // Reihenfolge zaehlt: "vorname" enthaelt "name".
    if (hat("unterschrift", "signatur")) map[name] = "mieter.unterschrift";
    else if (hat("vorname")) map[name] = "mieter.vorname";
    else if (hat("familienname", "nachname", "zuname")) map[name] = "mieter.nachname";
    else if (hat("geburtsdatum", "geboren am")) map[name] = "mieter.geburtsdatum";
    else if (hat("geburtsort")) map[name] = "mieter.geburtsort";
    else if (hat("staatsang")) map[name] = "mieter.staatsangehoerigkeit";
    else if (hat("ausweis", "personalausweis", "passnummer")) map[name] = "mieter.ausweisnummer";
    else if (hat("telefon", "mobil")) map[name] = "mieter.telefon";
    else if (hat("mail")) map[name] = "mieter.email";
    else if (hat("arbeitgeber", "firma")) map[name] = "mieter.arbeitgeber";
    else if (hat("ort datum", "ort, datum", "ort/datum")) map[name] = "ortDatum";
    else if (hat("startdatum", "mietbeginn", "beginn der miete", "einzug", "eingezogen"))
      map[name] = "mietbeginn";
    else if (hat("mietende", "ende der miete", "auszug")) map[name] = "mietende";
    else if (hat("vertragsnummer", "vertrags-nr")) map[name] = "vertragsnummer";
    else if (hat("kaution")) map[name] = "kaution";
    else if (hat("miete", "monatsmiete")) map[name] = "miete";
    else if (hat("zimmer")) map[name] = "zimmer";
    else if (hat("bett")) map[name] = "bett";
    else if (hat("strasse", "hausnr", "hausnummer")) map[name] = "mieter.strasse";
    else if (hat("plz") && hat("ort")) map[name] = "mieter.plzOrt";
    else if (hat("plz")) map[name] = "mieter.plz";
    else if (hat("datum")) map[name] = "heute";
    else if (hat("name")) map[name] = "mieter.nachname";
    else if (hat("ort")) map[name] = "mieter.ort";
  }

  return map;
}

/** Liest eine gespeicherte Zuordnung und verwirft unbekannte Platzhalter. */
export function parseFieldMap(json: string): Record<string, PlaceholderKey> {
  try {
    const roh = JSON.parse(json) as Record<string, unknown>;
    const sauber: Record<string, PlaceholderKey> = {};
    for (const [feld, wert] of Object.entries(roh)) {
      if (typeof wert === "string" && isPlaceholder(wert)) sauber[feld] = wert;
    }
    return sauber;
  } catch {
    return {};
  }
}

// --- Vorlage fuellen -------------------------------------------------------

export type FillValues = Partial<Record<PlaceholderKey, string>> & {
  /** PNG als Data-URL, wird in das Feld fuer die Unterschrift gezeichnet. */
  "mieter.unterschrift"?: string;
};

/**
 * Fuellt die Formularfelder und schreibt sie fest, damit im Amt niemand
 * versehentlich etwas veraendert. Unbekannte oder nicht zugeordnete Felder
 * bleiben leer, statt den Vorgang abzubrechen.
 */
export async function fillTemplate(
  bytes: Uint8Array,
  fieldMap: Record<string, PlaceholderKey>,
  values: FillValues,
): Promise<Buffer> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const [feldName, platzhalter] of Object.entries(fieldMap)) {
    let field;
    try {
      field = form.getField(feldName);
    } catch {
      continue; // Feld existiert in dieser Datei nicht mehr.
    }

    if (platzhalter === "mieter.unterschrift") {
      await drawSignature(doc, pages, field, values["mieter.unterschrift"]);
      continue;
    }

    const wert = values[platzhalter];
    if (wert === undefined || wert === "") continue;

    if (field instanceof PDFTextField) {
      field.setText(wert);
    } else if (field instanceof PDFCheckBox) {
      const an = ["ja", "true", "1", "x"].includes(wert.trim().toLowerCase());
      if (an) field.check();
      else field.uncheck();
    }
  }

  form.updateFieldAppearances(font);
  // Festschreiben: aus Eingabefeldern wird gedruckter Text.
  form.flatten();

  return Buffer.from(await doc.save());
}

/** Zeichnet die erfasste Unterschrift in das Rechteck ihres Formularfeldes. */
async function drawSignature(
  doc: PDFDocument,
  pages: ReturnType<PDFDocument["getPages"]>,
  field: ReturnType<ReturnType<PDFDocument["getForm"]>["getField"]>,
  dataUrl: string | undefined,
): Promise<void> {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return;

  const png = await doc.embedPng(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));

  for (const widget of field.acroField.getWidgets()) {
    const seite = pages.find((p) => p.ref === widget.P());
    if (!seite) continue;

    const rect = widget.getRectangle();
    // In das Feld einpassen, Seitenverhaeltnis behalten, etwas Luft lassen.
    const maxBreite = rect.width * 0.94;
    const maxHoehe = rect.height * 0.94;
    const faktor = Math.min(maxBreite / png.width, maxHoehe / png.height);
    const breite = png.width * faktor;
    const hoehe = png.height * faktor;

    seite.drawImage(png, {
      x: rect.x + (rect.width - breite) / 2,
      y: rect.y + (rect.height - hoehe) / 2,
      width: breite,
      height: hoehe,
    });
  }
}

/**
 * Haengt ein Blatt mit den Nachweisen der elektronischen Unterschrift an.
 * Wird gebraucht, wenn die Vorlage kein Feld dafuer vorsieht: die Unterschrift
 * selbst steht dann zwar nicht im Vordruck, der Nachweis geht aber nicht
 * verloren.
 */
export async function appendSignatureSheet(
  pdf: Buffer,
  angaben: {
    vertragsnummer: string;
    mieter: string;
    unterzeichner: string;
    signedAt: Date;
    ip: string | null;
    userAgent: string | null;
    signatureDataUrl: string | null;
  },
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const seite = doc.addPage([595.28, 841.89]);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const dunkel = rgb(0.086, 0.125, 0.122);

  let y = 780;
  seite.drawText("Nachweis der elektronischen Unterschrift", {
    x: 56, y, size: 16, font: fett, color: dunkel,
  });

  y -= 34;
  const zeilen: Array<[string, string]> = [
    ["Vertrag", angaben.vertragsnummer],
    ["Mieter", angaben.mieter],
    ["Unterzeichnet von", angaben.unterzeichner],
    ["Zeitpunkt", angaben.signedAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })],
    ["IP-Adresse", angaben.ip ?? "nicht erfasst"],
    ["Browser", (angaben.userAgent ?? "nicht erfasst").slice(0, 90)],
  ];

  for (const [bezeichnung, wert] of zeilen) {
    seite.drawText(bezeichnung, { x: 56, y, size: 9, font: fett, color: dunkel });
    seite.drawText(wert, { x: 180, y, size: 9, font: normal, color: dunkel });
    y -= 18;
  }

  if (angaben.signatureDataUrl?.startsWith("data:image/png;base64,")) {
    y -= 20;
    seite.drawText("Unterschrift", { x: 56, y, size: 9, font: fett, color: dunkel });
    y -= 96;
    const png = await doc.embedPng(
      Buffer.from(angaben.signatureDataUrl.split(",")[1] ?? "", "base64"),
    );
    const faktor = Math.min(240 / png.width, 90 / png.height);
    seite.drawImage(png, {
      x: 56, y, width: png.width * faktor, height: png.height * faktor,
    });
  }

  return Buffer.from(await doc.save());
}
