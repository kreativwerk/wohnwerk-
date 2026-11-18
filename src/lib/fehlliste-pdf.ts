import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

import { formatDate } from "./dates";
import { LOGO_HELL_PNG_BASE64, LOGO_HELL_SEITENVERHAELTNIS } from "./logo-png";
import { LIBERATION_SANS_BOLD, LIBERATION_SANS_REGULAR } from "./schriften/liberation-sans";
import { VERTRAGS_STATUS_NAME, type FehlenderVertrag } from "./vertrags-export";

const BREITE = 595.28;
const HOEHE = 841.89;
const RAND = 40;
const GRUEN = rgb(0.165, 0.337, 0.329);
const GRAU = rgb(0.38, 0.42, 0.42);
const DUNKEL = rgb(0.086, 0.125, 0.122);
const STREIFEN = rgb(0.96, 0.97, 0.97);
const ROT = rgb(0.7, 0.2, 0.08);

/** Fehlliste der Mietvertraege als PDF - gruppiert nach Objekt, Zeilen grau/weiss. */
export async function fehllistePdf(
  stand: { laufend: number; unterschrieben: number; fehlend: FehlenderVertrag[] },
  heute: Date,
): Promise<Uint8Array> {

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Fehlende Mietverträge – Stand ${formatDate(heute)}`);
  doc.setAuthor("Wohnwerk");
  const normal = await doc.embedFont(Buffer.from(LIBERATION_SANS_REGULAR, "base64"), { subset: true });
  const fett = await doc.embedFont(Buffer.from(LIBERATION_SANS_BOLD, "base64"), { subset: true });
  const logo = await doc.embedPng(Buffer.from(LOGO_HELL_PNG_BASE64, "base64"));

  // Spalten: Mieter, Zimmer, Einzug, Status, Telefon
  const spalten = [
    { titel: "Mieter", x: RAND, breite: 150 },
    { titel: "Zimmer", x: RAND + 152, breite: 80 },
    { titel: "Einzug", x: RAND + 234, breite: 58 },
    { titel: "Status", x: RAND + 294, breite: 140 },
    { titel: "Telefon", x: RAND + 436, breite: BREITE - RAND - (RAND + 436) },
  ];
  const kuerzen = (text: string, breite: number, groesse = 8.5) => {
    let t = text;
    while (t.length > 1 && normal.widthOfTextAtSize(t, groesse) > breite - 4) t = t.slice(0, -2) + "…";
    return t;
  };

  let seite: PDFPage = doc.addPage([BREITE, HOEHE]);
  let y = HOEHE - RAND;
  let seitenNr = 1;
  const fuss = () =>
    seite.drawText(`Wohnwerk · Fehlende Mietverträge · Stand ${formatDate(heute)} · Seite ${seitenNr}`, {
      x: RAND, y: 24, size: 7.5, font: normal, color: GRAU,
    });
  const neueSeite = () => {
    fuss();
    seite = doc.addPage([BREITE, HOEHE]);
    seitenNr += 1;
    y = HOEHE - RAND;
  };
  const kopfzeile = () => {
    seite.drawRectangle({ x: RAND - 4, y: y - 16, width: BREITE - 2 * RAND + 8, height: 16, color: GRUEN });
    for (const s of spalten) seite.drawText(s.titel, { x: s.x, y: y - 11.5, size: 8, font: fett, color: rgb(1, 1, 1) });
    y -= 18;
  };

  // Kopf
  const logoH = 22;
  seite.drawImage(logo, { x: BREITE - RAND - logoH * LOGO_HELL_SEITENVERHAELTNIS, y: y - logoH, width: logoH * LOGO_HELL_SEITENVERHAELTNIS, height: logoH });
  seite.drawText("Fehlende Mietverträge", { x: RAND, y: y - 18, size: 18, font: fett, color: DUNKEL });
  y -= 36;
  seite.drawText(`Stand ${formatDate(heute)} · laufende Mietverhältnisse ohne unterschriebenen Vertrag`, { x: RAND, y, size: 9, font: normal, color: GRAU });
  y -= 13;
  seite.drawText("versendet = Link verschickt, noch nicht geöffnet · angesehen = geöffnet, noch nicht unterschrieben", { x: RAND, y, size: 8, font: normal, color: GRAU });
  y -= 18;
  const kennzahlen: Array<[string, string]> = [
    ["Laufende Mietverhältnisse", String(stand.laufend)],
    ["Unterschrieben", String(stand.unterschrieben)],
    ["Fehlen noch", String(stand.fehlend.length)],
  ];
  kennzahlen.forEach(([titel, wert], i) => {
    const x = RAND + i * 175;
    seite.drawRectangle({ x, y: y - 38, width: 165, height: 38, color: STREIFEN });
    seite.drawText(titel, { x: x + 8, y: y - 13, size: 8, font: normal, color: GRAU });
    seite.drawText(wert, { x: x + 8, y: y - 31, size: 15, font: fett, color: i === 2 && stand.fehlend.length > 0 ? ROT : DUNKEL });
  });
  y -= 56;

  if (stand.fehlend.length === 0) {
    seite.drawText("Alle laufenden Mietverhältnisse haben einen unterschriebenen Vertrag.", { x: RAND, y, size: 10, font: fett, color: GRUEN });
  }

  // Gruppiert nach Objekt
  const objekte = [...new Set(stand.fehlend.map((f) => f.objekt))];
  for (const objekt of objekte) {
    const zeilen = stand.fehlend.filter((f) => f.objekt === objekt);
    if (y < RAND + 80) neueSeite();
    seite.drawText(`${objekt} (${zeilen.length})`, { x: RAND, y: y - 12, size: 11, font: fett, color: GRUEN });
    y -= 20;
    kopfzeile();
    zeilen.forEach((f, i) => {
      if (y < RAND + 30) {
        neueSeite();
        kopfzeile();
      }
      if (i % 2 === 0) seite.drawRectangle({ x: RAND - 4, y: y - 15, width: BREITE - 2 * RAND + 8, height: 15, color: STREIFEN });
      const kurz: Record<string, string> = { SENT: "versendet", VIEWED: "angesehen", DRAFT: "Entwurf", KEIN: "kein Vertrag" };
      const status =
        (kurz[f.status] ?? VERTRAGS_STATUS_NAME[f.status] ?? f.status) + (f.versendetAm ? ` ${formatDate(f.versendetAm)}` : "");
      const werte = [f.mieter, f.zimmer, formatDate(f.einzug), status, f.telefon ?? "–"];
      spalten.forEach((s, j) =>
        seite.drawText(kuerzen(werte[j], s.breite), { x: s.x, y: y - 11, size: 8.5, font: j === 0 ? fett : normal, color: DUNKEL }),
      );
      y -= 15;
    });
    y -= 12;
  }
  fuss();

  return doc.save();
}
