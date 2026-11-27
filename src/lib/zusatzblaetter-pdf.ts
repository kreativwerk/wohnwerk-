import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

import { LOGO_HELL_PNG_BASE64, LOGO_HELL_SEITENVERHAELTNIS } from "./logo-png";
import type { KautionSprache } from "./mahnung";
import { LIBERATION_SANS_BOLD, LIBERATION_SANS_REGULAR } from "./schriften/liberation-sans";
import { TONNEN_REIHENFOLGE, zusatzTexte, type TonnenArt } from "./zusatzblaetter-texte";

const BREITE = 595.28;
const HOEHE = 841.89;
const RAND = 36;
const UNTEN = 30;
const GRUEN = rgb(0.165, 0.337, 0.329);
const GRAU = rgb(0.38, 0.42, 0.42);
const HELLGRAU = rgb(0.75, 0.78, 0.78);
const DUNKEL = rgb(0.086, 0.125, 0.122);
const STREIFEN = rgb(0.955, 0.965, 0.965);
const ROT = rgb(0.7, 0.2, 0.08);
const WEISS = rgb(1, 1, 1);

const TONNEN_FARBE: Record<TonnenArt, RGB> = {
  gelb: rgb(0.96, 0.78, 0.07),
  papier: rgb(0.13, 0.38, 0.78),
  bio: rgb(0.5, 0.32, 0.16),
  rest: rgb(0.33, 0.33, 0.33),
  glas: rgb(0.25, 0.62, 0.5),
  pfand: rgb(0.2, 0.55, 0.25),
  sonder: rgb(0.78, 0.18, 0.18),
};

export type ZusatzAngaben = {
  /** Sprache des Mieters; bei "de" nur Deutsch */
  sprache: KautionSprache;
  mieter?: string | null;
  objekt?: string | null;
  vertragsnummer?: string | null;
};

/** Ein Stueck Fliesstext mit eigener Schrift und Farbe. */
type Lauf = { text: string; fett?: boolean; farbe?: RGB };

/**
 * Zusatzblatt zum Mietvertrag: Hausregeln und Muelltrennung auf EINER Seite,
 * unten die Unterschrift. Deutsch links, die Sprache des Mieters rechts auf
 * gleicher Hoehe. Passt es nicht, wird alles schrittweise kleiner gesetzt,
 * bis die Unterschrift vollstaendig auf die Seite passt.
 */
export async function renderZusatzblaetter(angaben: ZusatzAngaben): Promise<Buffer> {
  let ergebnis = await zeichnen(angaben, 1);
  for (let k = 0.97; !ergebnis.passt && k >= 0.7; k -= 0.03) ergebnis = await zeichnen(angaben, k);
  return ergebnis.pdf;
}

async function zeichnen(angaben: ZusatzAngaben, k: number): Promise<{ pdf: Buffer; passt: boolean }> {
  const de = zusatzTexte("de");
  const ue = angaben.sprache === "de" ? null : zusatzTexte(angaben.sprache);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const normal = await doc.embedFont(Buffer.from(LIBERATION_SANS_REGULAR, "base64"), { subset: true });
  const fett = await doc.embedFont(Buffer.from(LIBERATION_SANS_BOLD, "base64"), { subset: true });
  const logo: PDFImage = await doc.embedPng(Buffer.from(LOGO_HELL_PNG_BASE64, "base64"));
  doc.setTitle(`Hausregeln und Mülltrennung${angaben.mieter ? ` – ${angaben.mieter}` : ""}`);
  doc.setAuthor("Wohnwerk");

  const innen = BREITE - 2 * RAND;
  const luecke = 14;
  const spalte = ue ? (innen - luecke) / 2 : innen;
  const rechts = RAND + spalte + luecke;
  const groesse = (ue ? 8.4 : 9.6) * k;
  const zeilenAbstand = groesse * 1.25;

  const seite: PDFPage = doc.addPage([BREITE, HOEHE]);
  let y = HOEHE;

  /** Laeufe mit gemischter Schrift umbrechen - Wort fuer Wort. */
  type Wort = { text: string; schrift: PDFFont; farbe: RGB };
  const umbrechen = (laeufe: Lauf[], breite: number, g: number): Wort[][] => {
    const zeilen: Wort[][] = [[]];
    let belegt = 0;
    const leer = normal.widthOfTextAtSize(" ", g);
    for (const lauf of laeufe) {
      const schrift = lauf.fett ? fett : normal;
      for (const text of lauf.text.split(" ").filter(Boolean)) {
        const w = schrift.widthOfTextAtSize(text, g);
        const zeile = zeilen[zeilen.length - 1];
        const mitLeer = zeile.length ? leer + w : w;
        if (belegt + mitLeer > breite && zeile.length) {
          zeilen.push([{ text, schrift, farbe: lauf.farbe ?? DUNKEL }]);
          belegt = w;
        } else {
          zeile.push({ text, schrift, farbe: lauf.farbe ?? DUNKEL });
          belegt += mitLeer;
        }
      }
    }
    return zeilen;
  };
  const laeufeZeichnen = (x: number, oben: number, zeilen: Wort[][], g: number) => {
    const leer = normal.widthOfTextAtSize(" ", g);
    zeilen.forEach((zeile, i) => {
      let px = x;
      for (const wort of zeile) {
        seite.drawText(wort.text, { x: px, y: oben - g - i * g * 1.25, size: g, font: wort.schrift, color: wort.farbe });
        px += wort.schrift.widthOfTextAtSize(wort.text, g) + leer;
      }
    });
  };

  /** Deutsch | Uebersetzung nebeneinander; gibt Hoehe und Zeichenfunktion zurueck. */
  const paar = (links: Lauf[], rechtsLaeufe: Lauf[] | null, o: { einzug?: number; g?: number } = {}) => {
    const einzug = o.einzug ?? 0;
    const g = o.g ?? groesse;
    const zl = umbrechen(links, spalte - einzug, g);
    const zr = rechtsLaeufe ? umbrechen(rechtsLaeufe, spalte - einzug, g) : [];
    return {
      hoehe: Math.max(zl.length, zr.length) * g * 1.25,
      zeichnen: (oben: number) => {
        laeufeZeichnen(RAND + einzug, oben, zl, g);
        if (rechtsLaeufe) laeufeZeichnen(rechts + einzug, oben, zr, g);
      },
    };
  };

  // --- Kopf ---------------------------------------------------------------
  seite.drawRectangle({ x: 0, y: HOEHE - 14, width: BREITE, height: 14, color: GRUEN });
  const logoHoehe = 22;
  const logoBreite = logoHoehe * LOGO_HELL_SEITENVERHAELTNIS;
  seite.drawImage(logo, { x: BREITE - RAND - logoBreite, y: HOEHE - 24 - logoHoehe, width: logoBreite, height: logoHoehe });
  y = HOEHE - 24;
  seite.drawText(ue ? `${de.zusatz} · ${ue.zusatz}` : de.zusatz, { x: RAND, y: y - 7.5, size: 7.5, font: normal, color: GRAU });
  y -= 11;
  const titel = `${de.hausregeln} & ${de.muell}`;
  seite.drawText(titel, { x: RAND, y: y - 17, size: 17, font: fett, color: GRUEN });
  y -= 20;
  if (ue) {
    seite.drawText(`${ue.hausregeln} & ${ue.muell}`, { x: RAND, y: y - 12, size: 12, font: fett, color: GRAU });
    y -= 15;
  }
  const angabe = [angaben.mieter, angaben.objekt, angaben.vertragsnummer].filter((t) => t && t.trim()).join("  ·  ");
  if (angabe) {
    y -= 2;
    seite.drawText(angabe, { x: RAND, y: y - 8.5, size: 8.5, font: fett, color: DUNKEL });
    y -= 11;
  }
  y -= 5;

  /** Gruener Balken als Abschnittsueberschrift, beide Sprachen. */
  const abschnitt = (titelDe: string, titelUe: string | null) => {
    const h = 15 * Math.max(k, 0.85);
    seite.drawRectangle({ x: RAND - 4, y: y - h, width: innen + 8, height: h, color: GRUEN });
    const g = 10 * Math.max(k, 0.85);
    seite.drawText(titelDe, { x: RAND, y: y - h + (h - g) / 2 + 1.5, size: g, font: fett, color: WEISS });
    if (titelUe) seite.drawText(titelUe, { x: rechts, y: y - h + (h - g) / 2 + 1.5, size: g, font: fett, color: WEISS });
    y -= h + 3;
  };

  // --- Hausregeln -----------------------------------------------------------
  abschnitt(de.hausregeln, ue?.hausregeln ?? null);
  {
    const intro = paar([{ text: de.hausregelnIntro, farbe: GRAU }], ue ? [{ text: ue.hausregelnIntro, farbe: GRAU }] : null);
    intro.zeichnen(y);
    y -= intro.hoehe + 3;
  }
  de.regeln.forEach((regel, i) => {
    const u = ue?.regeln[i];
    const p = paar(
      [{ text: `${i + 1}. ${regel.titel}:`, fett: true, farbe: GRUEN }, { text: regel.text }],
      u ? [{ text: `${i + 1}. ${u.titel}:`, fett: true, farbe: GRUEN }, { text: u.text }] : null,
    );
    const hoehe = p.hoehe + 3 * k;
    if (i % 2 === 0) seite.drawRectangle({ x: RAND - 4, y: y - hoehe, width: innen + 8, height: hoehe, color: STREIFEN });
    p.zeichnen(y - 1.5 * k);
    y -= hoehe;
  });
  y -= 6 * k;

  // --- Muelltrennung ------------------------------------------------------
  abschnitt(de.muell, ue?.muell ?? null);
  {
    const intro = paar([{ text: de.muellIntro, farbe: GRAU }], ue ? [{ text: ue.muellIntro, farbe: GRAU }] : null);
    intro.zeichnen(y);
    y -= intro.hoehe + 3;
  }
  const laeufeTonne = (t: ReturnType<typeof zusatzTexte>, art: TonnenArt): Lauf[] => {
    const tonne = t.tonnen[art];
    const laeufe: Lauf[] = [{ text: `${tonne.name}:`, fett: true }, { text: tonne.rein }];
    if (tonne.nicht) laeufe.push({ text: `${t.nicht}:`, fett: true, farbe: ROT }, { text: tonne.nicht, farbe: ROT });
    return laeufe;
  };
  for (const art of TONNEN_REIHENFOLGE) {
    const p = paar(laeufeTonne(de, art), ue ? laeufeTonne(ue, art) : null, { einzug: 8 });
    const hoehe = p.hoehe + 3 * k;
    seite.drawRectangle({ x: RAND - 4, y: y - hoehe, width: innen + 8, height: hoehe, color: STREIFEN });
    seite.drawRectangle({ x: RAND - 4, y: y - hoehe, width: 7, height: hoehe, color: TONNEN_FARBE[art] });
    p.zeichnen(y - 1.5 * k);
    y -= hoehe + 2 * k;
  }
  {
    y -= 1;
    const abfuhr = paar([{ text: de.abfuhr, farbe: GRAU }], ue ? [{ text: ue.abfuhr, farbe: GRAU }] : null);
    abfuhr.zeichnen(y);
    y -= abfuhr.hoehe + 8 * k;
  }

  // --- Bestaetigung mit Unterschrift -------------------------------------
  seite.drawLine({ start: { x: RAND, y }, end: { x: BREITE - RAND, y }, thickness: 0.8, color: HELLGRAU });
  y -= 5;
  const bestaetigung = paar([{ text: de.bestaetigung, fett: true }], ue ? [{ text: ue.bestaetigung, fett: true }] : null, { g: 8.8 });
  bestaetigung.zeichnen(y);
  y -= bestaetigung.hoehe + 24;

  const felder: Array<[string, string | null, number, string | null]> = [
    [de.name, ue?.name ?? null, 0.36, angaben.mieter ?? null],
    [de.ortDatum, ue?.ortDatum ?? null, 0.26, null],
    [de.unterschrift, ue?.unterschrift ?? null, 0.38, null],
  ];
  let x = RAND;
  for (const [beschriftungDe, beschriftungUe, anteil, vorbelegt] of felder) {
    const breite = innen * anteil - 12;
    if (vorbelegt) seite.drawText(vorbelegt, { x, y: y + 4, size: 10, font: normal, color: DUNKEL });
    seite.drawLine({ start: { x, y }, end: { x: x + breite, y }, thickness: 0.8, color: DUNKEL });
    const beschriftung = beschriftungUe ? `${beschriftungDe} / ${beschriftungUe}` : beschriftungDe;
    seite.drawText(beschriftung, { x, y: y - 10, size: 7.5, font: normal, color: GRAU });
    x += innen * anteil;
  }
  // Unterhalb der Beschriftung muss noch Rand bleiben, sonst ist die
  // Unterschrift beim Drucken abgeschnitten.
  const passt = y - 10 >= UNTEN;
  seite.drawText("Wohnwerk GbR", { x: RAND, y: 16, size: 7, font: normal, color: GRAU });

  return { pdf: Buffer.from(await doc.save()), passt };
}
