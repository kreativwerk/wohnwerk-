import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { ContractData } from "./contract-pdf";
import { formatDate, formatDateTime } from "./dates";
import { formatCents } from "./money";
import { LIBERATION_SANS_BOLD, LIBERATION_SANS_REGULAR } from "./schriften/liberation-sans";
import { vertragsuebersetzung } from "./vertrag-uebersetzung";

const BREITE = 595.28;
const HOEHE = 841.89;
const RAND = 56;
const GRUEN = rgb(0.165, 0.337, 0.329);
const GRAU = rgb(0.38, 0.42, 0.42);
const DUNKEL = rgb(0.086, 0.125, 0.122);
const STREIFEN = rgb(0.96, 0.97, 0.97);

/**
 * Haengt an den unterschriebenen Vertrag die Uebersetzung in der Sprache an,
 * in der der Mieter gelesen hat. Maßgeblich bleibt die deutsche Fassung -
 * das steht oben auf jeder Seite der Uebersetzung.
 */
export async function uebersetzungAnhaengen(pdf: Buffer, data: ContractData, sprache: string | null | undefined): Promise<Buffer> {
  const ue = vertragsuebersetzung(sprache);
  if (!ue) return pdf;

  const doc = await PDFDocument.load(pdf);
  doc.registerFontkit(fontkit);
  const normal = await doc.embedFont(Buffer.from(LIBERATION_SANS_REGULAR, "base64"), { subset: true });
  const fett = await doc.embedFont(Buffer.from(LIBERATION_SANS_BOLD, "base64"), { subset: true });
  const b = (deutsch: string, werte?: Record<string, string | number>) => ue.beschriftung(deutsch, werte) ?? deutsch;

  let seite: PDFPage = doc.addPage([BREITE, HOEHE]);
  let y = HOEHE - RAND;

  const neueSeite = () => {
    seite = doc.addPage([BREITE, HOEHE]);
    y = HOEHE - RAND;
    seite.drawText(ue.hinweis, { x: RAND, y, size: 8, font: normal, color: GRAU });
    y -= 20;
  };
  const platz = (hoehe: number) => {
    if (y - hoehe < RAND) neueSeite();
  };
  const zeilen = (text: string, schrift: PDFFont, groesse: number, breite: number): string[] => {
    const ergebnis: string[] = [];
    for (const absatz of text.split("\n")) {
      let zeile = "";
      for (const wort of absatz.split(" ")) {
        const probe = zeile ? `${zeile} ${wort}` : wort;
        if (schrift.widthOfTextAtSize(probe, groesse) > breite && zeile) {
          ergebnis.push(zeile);
          zeile = wort;
        } else zeile = probe;
      }
      ergebnis.push(zeile);
    }
    return ergebnis;
  };
  const text = (inhalt: string, o: { groesse?: number; fett?: boolean; farbe?: ReturnType<typeof rgb>; abstand?: number } = {}) => {
    const groesse = o.groesse ?? 9.5;
    const schrift = o.fett ? fett : normal;
    for (const z of zeilen(inhalt, schrift, groesse, BREITE - 2 * RAND)) {
      platz(groesse + 4);
      seite.drawText(z, { x: RAND, y: y - groesse, size: groesse, font: schrift, color: o.farbe ?? DUNKEL });
      y -= groesse + 4;
    }
    y -= o.abstand ?? 4;
  };
  const ueberschrift = (titel: string) => {
    platz(40);
    y -= 8;
    text(titel, { groesse: 12, fett: true, farbe: GRUEN, abstand: 2 });
  };
  let streifen = 0;
  const zeile = (beschriftung: string, wert: string | null | undefined) => {
    if (!wert) return;
    const links = 150;
    const teile = zeilen(wert, normal, 9.5, BREITE - 2 * RAND - links - 8);
    const hoehe = teile.length * 13.5 + 6;
    platz(hoehe);
    if (streifen++ % 2 === 0) {
      seite.drawRectangle({ x: RAND - 4, y: y - hoehe + 2, width: BREITE - 2 * RAND + 8, height: hoehe, color: STREIFEN });
    }
    seite.drawText(beschriftung, { x: RAND, y: y - 12, size: 8.5, font: fett, color: GRAU });
    teile.forEach((t, i) => seite.drawText(t, { x: RAND + links, y: y - 12 - i * 13.5, size: 9.5, font: normal, color: DUNKEL }));
    y -= hoehe;
  };
  const adresse = (...teile: Array<string | null | undefined>) => teile.filter((t) => t && String(t).trim()).join(", ");

  // --- Kopf -------------------------------------------------------------
  seite.drawRectangle({ x: 0, y: HOEHE - 26, width: BREITE, height: 26, color: GRUEN });
  y -= 10;
  text(`${b("Mietvertrag für Wohnraum").toUpperCase()} – ${ue.titel.toUpperCase()}`, { groesse: 16, fett: true });
  text(b("Vertrag {nummer}", { nummer: data.contractNumber }), { groesse: 9.5, fett: true, farbe: GRUEN });
  text(ue.hinweis, { groesse: 9.5, fett: true, farbe: rgb(0.7, 0.2, 0.08), abstand: 8 });

  // --- 1. Parteien --------------------------------------------------------
  ueberschrift(b("1. Vertragsparteien"));
  streifen = 0;
  zeile(b("Vermieter"), data.landlordName);
  zeile(b("Anschrift"), adresse(data.landlordStreet, [data.landlordZip, data.landlordCity].filter(Boolean).join(" "), data.landlordCountry));
  zeile(b("E-Mail"), data.landlordEmail);
  zeile(b("Mieter"), data.tenantName);
  zeile(b("Geburtsdatum"), data.tenantBirthDate);
  zeile(b("Staatsangehörigkeit"), data.tenantNationality);
  zeile(b("Meldeanschrift"), adresse(data.tenantStreet, [data.tenantZip, data.tenantCity].filter(Boolean).join(" "), data.tenantCountry));

  // --- 2. Mietgegenstand ------------------------------------------------------
  ueberschrift(b("2. Mietgegenstand"));
  streifen = 0;
  zeile(b("Objekt"), data.propertyName);
  zeile(b("Anschrift"), adresse(data.propertyStreet, [data.propertyZip, data.propertyCity].filter(Boolean).join(" ")));
  zeile(b("Zimmer"), data.roomName);
  zeile(b("Schlafplatz"), b("wird vor Ort zugewiesen"));
  y -= 4;
  text(ue.intro(data.intro));

  // --- 3. Mietzeit und Mietzins ----------------------------------------------
  ueberschrift(b("3. Mietzeit und Mietzins"));
  streifen = 0;
  zeile(b("Mietbeginn"), formatDate(data.startDate));
  zeile(b("Mietende"), data.endDate ? formatDate(data.endDate) : b("unbefristet"));
  if (data.utilitiesCents > 0) {
    zeile(b("Miete monatlich"), formatCents(data.monthlyRentCents));
    zeile(b("davon Nebenkosten"), formatCents(data.utilitiesCents));
  } else {
    zeile(b("Miete monatlich (pauschal)"), b("{betrag} inkl. aller Nebenkosten", { betrag: formatCents(data.monthlyRentCents) }));
  }
  zeile(b("Kaution"), data.depositCents > 0 ? formatCents(data.depositCents) : b("keine"));
  zeile(b("Fälligkeit"), b("zum {tag}. eines Monats im Voraus", { tag: data.billingDay }));
  zeile(b("Verwendungszweck"), data.reference);
  if (data.bankIban) {
    zeile(b("Empfänger"), data.bankHolder || "Wohnwerk GbR");
    zeile(b("Zahlung auf"), [data.bankName, `IBAN ${data.bankIban}`, data.bankBic ? `BIC ${data.bankBic}` : null].filter(Boolean).join(" · "));
  }
  y -= 4;
  text(ue.kuendigung(data.noticePeriod));

  // --- 4. Bedingungen ------------------------------------------------------
  ueberschrift(b("4. Vertragsbedingungen"));
  for (const bedingung of ue.bedingungen(data.clauses)) text(bedingung, { abstand: 5 });

  // --- 5. Hausordnung ------------------------------------------------------
  ueberschrift(b("5. Hausordnung"));
  text(ue.hausordnung(data.houseRules));

  // --- 6. Unterschrift -----------------------------------------------------
  if (data.signature) {
    ueberschrift(b("6. Unterschrift"));
    text(`${data.signature.name} – ${ue.unterschriebenAm} ${formatDateTime(data.signature.signedAt)}`);
  }

  return Buffer.from(await doc.save());
}
