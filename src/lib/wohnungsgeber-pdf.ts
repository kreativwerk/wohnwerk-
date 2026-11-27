import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

import { LIBERATION_SANS_BOLD, LIBERATION_SANS_REGULAR } from "./schriften/liberation-sans";

const BREITE = 595.28;
const HOEHE = 841.89;
const RAND = 56;
const SCHWARZ = rgb(0, 0, 0);
const GRAU = rgb(0.35, 0.35, 0.35);
const RAHMEN = rgb(0.25, 0.25, 0.25);
const KOPF = rgb(0.92, 0.92, 0.92);

export type WohnungsgeberAngaben = {
  wohnungsgeber: { name: string; anschrift: string; kontakt?: string | null };
  /** Wohnungsgeber ist selbst Eigentuemer - sonst Name und Anschrift des Eigentuemers */
  istEigentuemer: boolean;
  eigentuemer?: { name: string; anschrift: string } | null;
  wohnung: { anschrift: string; lage?: string | null };
  /** Ort der Meldebehoerde, z. B. "Höchstadt a.d. Aisch" */
  meldebehoerde?: string | null;
  art: "EINZUG" | "AUSZUG";
  /** TT.MM.JJJJ */
  datum: string;
  personen: Array<{ familienname: string; vornamen: string; geburtsdatum?: string | null }>;
  /** Ort und Datum der Ausstellung */
  ortDatum: string;
  /** PNG als Data-URL */
  unterschrift?: string | null;
  /** Kleine Referenz unten, z. B. die Vertragsnummer */
  referenz?: string | null;
};

/**
 * Wohnungsgeberbestaetigung nach § 19 BMG als neutrales Formular im Stil der
 * amtlichen Vordrucke - fuer Objekte ohne eigenen Vordruck der Gemeinde.
 * Enthaelt alle Angaben nach § 19 Abs. 3 BMG und den Hinweis nach § 54 BMG.
 * Die Unterschrift sitzt innerhalb ihres Feldes, nie ueber Text.
 */
export async function renderWohnungsgeberbestaetigung(a: WohnungsgeberAngaben): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const normal = await doc.embedFont(Buffer.from(LIBERATION_SANS_REGULAR, "base64"), { subset: true });
  const fett = await doc.embedFont(Buffer.from(LIBERATION_SANS_BOLD, "base64"), { subset: true });
  const personenNamen = a.personen.map((p) => `${p.vornamen} ${p.familienname}`.trim()).join(", ");
  doc.setTitle(`Wohnungsgeberbestätigung${personenNamen ? ` – ${personenNamen}` : ""}`);
  doc.setAuthor(a.wohnungsgeber.name);

  const seite: PDFPage = doc.addPage([BREITE, HOEHE]);
  const innen = BREITE - 2 * RAND;
  let y = HOEHE - 56;

  const umbrechen = (text: string, schrift: PDFFont, g: number, breite: number): string[] => {
    const zeilen: string[] = [];
    let zeile = "";
    for (const wort of text.split(" ")) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (schrift.widthOfTextAtSize(probe, g) > breite && zeile) {
        zeilen.push(zeile);
        zeile = wort;
      } else zeile = probe;
    }
    if (zeile) zeilen.push(zeile);
    return zeilen;
  };
  const text = (t: string, x: number, oben: number, g: number, schrift: PDFFont = normal, farbe: RGB = SCHWARZ) =>
    seite.drawText(t, { x, y: oben - g, size: g, font: schrift, color: farbe });
  const mittig = (t: string, oben: number, g: number, schrift: PDFFont = normal, farbe: RGB = SCHWARZ) =>
    text(t, RAND + (innen - schrift.widthOfTextAtSize(t, g)) / 2, oben, g, schrift, farbe);
  const absatz = (t: string, g: number, schrift: PDFFont = normal, farbe: RGB = SCHWARZ) => {
    for (const z of umbrechen(t, schrift, g, innen)) {
      text(z, RAND, y, g, schrift, farbe);
      y -= g * 1.38;
    }
  };
  const kaestchen = (x: number, oben: number, an: boolean) => {
    seite.drawRectangle({ x, y: oben - 9, width: 9, height: 9, borderColor: SCHWARZ, borderWidth: 0.8 });
    if (an) {
      seite.drawLine({ start: { x: x + 1.5, y: oben - 1.5 }, end: { x: x + 7.5, y: oben - 7.5 }, thickness: 1.1, color: SCHWARZ });
      seite.drawLine({ start: { x: x + 7.5, y: oben - 1.5 }, end: { x: x + 1.5, y: oben - 7.5 }, thickness: 1.1, color: SCHWARZ });
    }
  };
  /** Kasten mit kleiner Beschriftung oben links und Wert darunter. */
  const kasten = (x: number, oben: number, breite: number, hoehe: number, beschriftung: string, wert?: string) => {
    seite.drawRectangle({ x, y: oben - hoehe, width: breite, height: hoehe, borderColor: RAHMEN, borderWidth: 0.7 });
    text(beschriftung, x + 4, oben - 3, 6.8, normal, GRAU);
    if (wert) {
      const zeilen = umbrechen(wert, normal, 10.5, breite - 10);
      zeilen.slice(0, 2).forEach((z, i) => text(z, x + 5, oben - 13 - i * 12.5, 10.5));
    }
  };
  /** Abschnittskopf: grau hinterlegte Zeile mit Nummer und Titel. */
  const abschnitt = (nummer: number, titel: string) => {
    seite.drawRectangle({ x: RAND, y: y - 16, width: innen, height: 16, color: KOPF, borderColor: RAHMEN, borderWidth: 0.7 });
    text(`${nummer}.  ${titel}`, RAND + 6, y - 4, 9.5, fett);
    y -= 16;
  };

  // --- Kopf ------------------------------------------------------------------
  if (a.meldebehoerde) {
    text("Zur Vorlage bei der Meldebehörde", RAND, y, 7.5, normal, GRAU);
    text(`Bürgerbüro / Einwohnermeldeamt ${a.meldebehoerde}`, RAND, y - 10, 9.5, fett);
    y -= 32;
  }
  mittig("Wohnungsgeberbestätigung", y, 19, fett);
  y -= 25;
  mittig("Bestätigung des Wohnungsgebers nach § 19 des Bundesmeldegesetzes (BMG)", y, 9.5);
  y -= 24;

  // --- 1. Wohnung ------------------------------------------------------------
  abschnitt(1, "Anschrift der Wohnung");
  kasten(RAND, y, innen, 30, "Postleitzahl, Ort, Straße, Hausnummer", a.wohnung.anschrift);
  y -= 30;
  kasten(RAND, y, innen, 30, "Stockwerk, Wohnungsnummer bzw. Lagebeschreibung der Wohnung im Haus", a.wohnung.lage ?? "");
  y -= 30 + 12;

  // --- 2. Einzug / Auszug ----------------------------------------------------
  abschnitt(2, "Art der Meldung");
  {
    const hoehe = 30;
    seite.drawRectangle({ x: RAND, y: y - hoehe, width: innen, height: hoehe, borderColor: RAHMEN, borderWidth: 0.7 });
    const mitte = y - hoehe / 2 + 4.5;
    kaestchen(RAND + 10, mitte, a.art === "EINZUG");
    text("Einzug", RAND + 25, mitte + 0.5, 10.5, fett);
    kaestchen(RAND + 90, mitte, a.art === "AUSZUG");
    text("Auszug", RAND + 105, mitte + 0.5, 10.5, fett);
    const xDatum = RAND + innen * 0.5;
    seite.drawLine({ start: { x: xDatum, y }, end: { x: xDatum, y: y - hoehe }, thickness: 0.7, color: RAHMEN });
    text(a.art === "EINZUG" ? "Datum des Einzugs" : "Datum des Auszugs", xDatum + 4, y - 3, 6.8, normal, GRAU);
    text(a.datum, xDatum + 5, y - 13, 11.5, fett);
    y -= hoehe + 12;
  }

  // --- 3. Personen -------------------------------------------------------------
  abschnitt(3, a.art === "EINZUG" ? "In die Wohnung ist/sind folgende Person(en) eingezogen" : "Aus der Wohnung ist/sind folgende Person(en) ausgezogen");
  {
    const spalten = [
      { titel: "Nr.", breite: 30 },
      { titel: "Familienname", breite: 160 },
      { titel: "Vorname(n)", breite: 160 },
      { titel: "Geburtsdatum", breite: innen - 350 },
    ];
    const zeilen = Math.max(a.personen.length, 3);
    for (let i = 0; i < zeilen; i += 1) {
      const p = a.personen[i];
      const werte = [`${i + 1}.`, p?.familienname ?? "", p?.vornamen ?? "", p?.geburtsdatum ?? ""];
      let x = RAND;
      spalten.forEach((s, j) => {
        kasten(x, y, s.breite, 26, i === 0 ? s.titel : "", werte[j] && j > 0 ? werte[j] : undefined);
        if (j === 0) text(werte[0], x + 8, y - 13, 10.5);
        x += s.breite;
      });
      y -= 26;
    }
    y -= 12;
  }

  // --- 4. Wohnungsgeber ------------------------------------------------------
  abschnitt(4, "Wohnungsgeber");
  kasten(RAND, y, innen, 30, "Name des Wohnungsgebers (bei juristischen Personen: Firma)", a.wohnungsgeber.name);
  y -= 30;
  kasten(RAND, y, innen, 30, "Anschrift des Wohnungsgebers (Postleitzahl, Ort, Straße, Hausnummer)", a.wohnungsgeber.anschrift);
  y -= 30;
  {
    const hoehe = a.istEigentuemer ? 38 : 66;
    seite.drawRectangle({ x: RAND, y: y - hoehe, width: innen, height: hoehe, borderColor: RAHMEN, borderWidth: 0.7 });
    kaestchen(RAND + 10, y - 7, a.istEigentuemer);
    text("Der Wohnungsgeber ist gleichzeitig Eigentümer der Wohnung.", RAND + 25, y - 7, 9.5);
    kaestchen(RAND + 10, y - 22, !a.istEigentuemer);
    text("Der Wohnungsgeber ist nicht Eigentümer der Wohnung. Name und Anschrift des Eigentümers:", RAND + 25, y - 22, 9.5);
    if (!a.istEigentuemer) {
      const eig = [a.eigentuemer?.name, a.eigentuemer?.anschrift].filter(Boolean).join(", ");
      kasten(RAND + 25, y - 36, innen - 35, 24, "Name und Anschrift des Eigentümers", eig);
    }
    y -= hoehe + 12;
  }

  // --- Bestaetigung ------------------------------------------------------------
  absatz(
    "Ich bestätige mit meiner Unterschrift, dass die oben gemachten Angaben den Tatsachen entsprechen. Mir ist bekannt, dass es verboten ist, eine Wohnanschrift für eine Anmeldung einem Dritten anzubieten oder zur Verfügung zu stellen, obwohl ein tatsächlicher Bezug der Wohnung durch diesen weder stattfindet noch beabsichtigt ist. Ein Verstoß gegen dieses Verbot stellt ebenso eine Ordnungswidrigkeit dar wie die Ausstellung dieser Bestätigung, ohne dazu als Wohnungsgeber oder dessen Beauftragter berechtigt zu sein (§ 54 i. V. m. § 19 BMG).",
    8.3,
  );
  y -= 8;

  // --- Ort, Datum und Unterschrift: zwei Felder, die Unterschrift im rechten ---
  {
    const hoehe = 66;
    const breiteOrt = innen * 0.36;
    const xU = RAND + breiteOrt;
    const breiteU = innen - breiteOrt;
    seite.drawRectangle({ x: RAND, y: y - hoehe, width: innen, height: hoehe, borderColor: RAHMEN, borderWidth: 0.7 });
    seite.drawLine({ start: { x: xU, y }, end: { x: xU, y: y - hoehe }, thickness: 0.7, color: RAHMEN });
    // Schreiblinien mit Beschriftung darunter - wie auf dem Papiervordruck.
    const linie = y - hoehe + 16;
    seite.drawLine({ start: { x: RAND + 8, y: linie }, end: { x: xU - 8, y: linie }, thickness: 0.6, color: SCHWARZ });
    seite.drawLine({ start: { x: xU + 8, y: linie }, end: { x: RAND + innen - 8, y: linie }, thickness: 0.6, color: SCHWARZ });
    text("Ort, Datum", RAND + 8, linie - 3, 6.8, normal, GRAU);
    text("Unterschrift des Wohnungsgebers oder der beauftragten Person", xU + 8, linie - 3, 6.8, normal, GRAU);
    text(a.ortDatum, RAND + 10, linie + 15, 10.5);

    if (a.unterschrift?.startsWith("data:image/png;base64,")) {
      const png = await doc.embedPng(Buffer.from(a.unterschrift.split(",")[1] ?? "", "base64"));
      // Platz zwischen Oberkante des Feldes und Schreiblinie, mit etwas Luft.
      const maxBreite = breiteU - 40;
      const maxHoehe = y - 4 - (linie + 1);
      const faktor = Math.min(maxBreite / png.width, maxHoehe / png.height);
      const w = png.width * faktor;
      const h = png.height * faktor;
      seite.drawImage(png, { x: xU + (breiteU - w) / 2, y: linie + 1, width: w, height: h });
    }
    y -= hoehe;
    text(`für ${a.wohnungsgeber.name}`, xU + 8, y - 4, 7.5, normal, GRAU);
    y -= 18;
  }

  // --- Hinweis ---------------------------------------------------------------
  y = 70;
  seite.drawLine({ start: { x: RAND, y: y + 6 }, end: { x: RAND + innen, y: y + 6 }, thickness: 0.5, color: GRAU });
  absatz(
    "Hinweis für die meldepflichtige Person: Die Anmeldung muss innerhalb von zwei Wochen nach dem Einzug bei der Meldebehörde erfolgen (§ 17 Abs. 1 BMG). Bitte diese Bestätigung sowie Personalausweis oder Reisepass mitbringen.",
    7.3,
    normal,
    GRAU,
  );
  if (a.referenz) text(a.referenz, RAND + innen - normal.widthOfTextAtSize(a.referenz, 7), 30, 7, normal, GRAU);

  return Buffer.from(await doc.save());
}
