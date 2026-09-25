/**
 * Hinterlegt kommunale Wohnungsgeberbestaetigungen bei den passenden
 * Objekten und die Unterschrift der Hausverwaltung in den Einstellungen.
 *
 * Jede Gemeinde hat ihren eigenen Vordruck. Hier liegt je Vordruck: die
 * Datei aus dem Ordner "vorlagen", zu welchem Objekt sie gehoert, welches
 * Formularfeld welchen Platzhalter bekommt - und wo die Unterschrift des
 * Wohnungsgebers hin soll, falls der Vordruck dafuer kein Feld hat. Das
 * Feld wird dann beim Einrichten eingebaut, die Originaldatei bleibt
 * unveraendert im Ordner.
 *
 * Laeuft als Schritt im Vercel-Build, ist idempotent und bricht den Build
 * nicht ab. Eine bereits eingerichtete Vorlage wird nicht angefasst; ein
 * vorher hochgeladener Scan ohne Formularfelder am selben Objekt wird
 * ersetzt, weil er sich nicht ausfuellen laesst.
 */

import fs from "node:fs";
import path from "node:path";

const VORDRUCKE = [
  {
    datei: "vorlagen/wohnungsgeberbestaetigung-strullendorf.pdf",
    // Gemeinde Strullendorf, EIBL-Verlag 15013 - Objekt Forchheimer Str. 48
    passtZu: { strasse: "Forchheimer Str", ort: "Strullendorf" },
    kind: "LANDLORD_CONFIRMATION",
    // "Stand" im Titel: Aendert sich die Lage des Unterschriftsfelds, zaehlt
    // der Stand hoch, und die Vorlage wird beim naechsten Deploy ersetzt.
    title: "Wohnungsgeberbestätigung (Gemeinde Strullendorf) · Stand 3",
    // Das Unterschriftsfeld fuellt den Kasten unten rechts fast ganz aus und
    // sitzt tief - so wirkt die Unterschrift wie von Hand gesetzt.
    unterschriftsfeld: { name: "Unterschrift Wohnungsgeber", seite: 1, x: 378, y: 59, width: 226, height: 40 },
    feldzuordnung: {
      Kontrollkästchen25: "vermieter.istFirma",
      Text1: "vermieter.name",
      Text2: "vermieter.plzOrtStrasse",
      Text3: "vermieter.telefonEmail",
      Kontrollkästchen27: "vermieter.istEigentuemer",
      Kontrollkästchen28: "vermieter.nichtEigentuemer",
      Text6: "eigentuemer.name",
      Text7: "eigentuemer.anschrift",
      Text8: "eigentuemer.kontakt",
      Text12: "objekt.plzOrtStrasse",
      Text10: "lage",
      Text11: "mietbeginn",
      Text13: "mieter.name",
      Kontrollkästchen30: "mieter.maennlich",
      Kontrollkästchen31: "mieter.weiblich",
      Text19: "mieter.geburtsdatum",
      Text18: "ortDatum",
      "Unterschrift Wohnungsgeber": "vermieter.unterschrift",
    },
  },
];

/** Freigestellte Unterschrift der Hausverwaltung - nur gesetzt, wenn noch keine da ist. */
const UNTERSCHRIFT = "vorlagen/unterschrift-hausverwaltung.png";

const { PrismaClient } = await import("@prisma/client");
const { PDFDocument } = await import("pdf-lib");
const prisma = new PrismaClient();

function feldliste(doc) {
  const seiten = doc.getPages();
  return doc
    .getForm()
    .getFields()
    .map((f) => ({
      name: f.getName(),
      type: f.constructor?.name === "PDFCheckBox" ? "checkbox" : f.constructor?.name === "PDFTextField" ? "text" : "sonstiges",
      pages: [
        ...new Set(
          f.acroField
            .getWidgets()
            .map((w) => seiten.findIndex((s) => s.ref.toString() === w.P()?.toString()) + 1)
            .filter((n) => n > 0),
        ),
      ].sort((a, b) => a - b),
    }));
}

try {
  for (const vordruck of VORDRUCKE) {
    const datei = path.resolve(vordruck.datei);
    if (!fs.existsSync(datei)) {
      console.log(`[wohnungsgeber] ${vordruck.datei} fehlt - übersprungen.`);
      continue;
    }

    const doc = await PDFDocument.load(new Uint8Array(fs.readFileSync(datei)), { ignoreEncryption: true });
    const u = vordruck.unterschriftsfeld;
    if (u && !doc.getForm().getFields().some((f) => f.getName() === u.name)) {
      const feld = doc.getForm().createTextField(u.name);
      feld.addToPage(doc.getPage(u.seite - 1), { x: u.x, y: u.y, width: u.width, height: u.height, borderWidth: 0 });
    }
    const daten = Buffer.from(await doc.save({ useObjectStreams: false }));
    const felder = feldliste(doc);

    const objekte = await prisma.property.findMany({
      where: {
        street: { contains: vordruck.passtZu.strasse, mode: "insensitive" },
        city: { contains: vordruck.passtZu.ort, mode: "insensitive" },
      },
      include: { templates: { select: { id: true, kind: true, title: true, fieldNames: true, fieldMap: true, fileName: true } } },
    });

    for (const objekt of objekte) {
      // Gleicher Titel = gleicher Stand: nichts zu tun. Ein aelterer Stand
      // derselben Art wird unten mit ersetzt.
      const schonDa = objekt.templates.find((t) => t.kind === vordruck.kind && t.title === vordruck.title);
      if (schonDa) {
        console.log(`[wohnungsgeber] "${objekt.name}": Vorlage schon eingerichtet.`);
        continue;
      }

      // Scans ohne Formularfelder raeumen: sie lassen sich nicht ausfuellen
      // und wuerden als "Mietvertrag" einen leeren Vordruck erzeugen.
      const leere = objekt.templates.filter((t) => t.fieldNames === "[]" || t.fieldNames === "");
      const gleicheArt = objekt.templates.filter((t) => t.kind === vordruck.kind);
      const weg = [...new Set([...leere, ...gleicheArt].map((t) => t.id))];
      if (weg.length > 0) {
        await prisma.propertyTemplate.deleteMany({ where: { id: { in: weg } } });
        console.log(`[wohnungsgeber] "${objekt.name}": ${weg.length} alte Vorlage(n) ersetzt.`);
      }

      await prisma.propertyTemplate.create({
        data: {
          propertyId: objekt.id,
          kind: vordruck.kind,
          title: vordruck.title,
          fileName: path.basename(datei),
          sizeBytes: daten.byteLength,
          data: new Uint8Array(daten),
          pageCount: doc.getPageCount(),
          fieldNames: JSON.stringify(felder),
          fieldMap: JSON.stringify(vordruck.feldzuordnung),
          active: true,
        },
      });
      console.log(`[wohnungsgeber] Vorlage hinterlegt bei "${objekt.name}" (${felder.length} Felder).`);
    }
    if (objekte.length === 0) console.log(`[wohnungsgeber] Kein Objekt passt zu ${vordruck.passtZu.strasse}, ${vordruck.passtZu.ort}.`);
  }

  if (fs.existsSync(UNTERSCHRIFT)) {
    const vorhanden = await prisma.setting.findUnique({ where: { key: "landlordSignature" } });
    if (!vorhanden?.value) {
      const png = fs.readFileSync(UNTERSCHRIFT);
      await prisma.setting.upsert({
        where: { key: "landlordSignature" },
        create: { key: "landlordSignature", value: `data:image/png;base64,${png.toString("base64")}` },
        update: { value: `data:image/png;base64,${png.toString("base64")}` },
      });
      console.log("[wohnungsgeber] Unterschrift der Hausverwaltung hinterlegt.");
    }
  }
} catch (error) {
  console.error("[wohnungsgeber] Einrichten fehlgeschlagen (Build läuft weiter):", error);
} finally {
  await prisma.$disconnect();
}
