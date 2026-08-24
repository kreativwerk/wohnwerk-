/**
 * Hinterlegt die Original-Vertragsvorlage bei den passenden Objekten.
 *
 * Ohne Vorlage erzeugt die Anwendung einen eigenen Vertrag; mit Vorlage
 * fuellt sie das Originaldokument aus - mit Logo, Kopf- und Fusszeile
 * genau so, wie es unterschrieben wird.
 *
 * Die Wohnungsgeberbestaetigung auf Seite 3 ist an die Meldebehoerde
 * gerichtet und sieht in jeder Kommune anders aus. Die hier abgelegte
 * Vorlage gilt fuer Erlangen und wird deshalb nur Objekten in Erlangen
 * zugeordnet. Fuer die uebrigen Objekte muss die jeweilige Kommune ihre
 * eigene Bestaetigung liefern - die Objektuebersicht weist darauf hin.
 *
 * Laeuft als Schritt im Vercel-Build, ist idempotent und bricht den Build
 * nicht ab.
 */

import fs from "node:fs";
import path from "node:path";

const DATEI = path.resolve("vorlagen/mietvertrag-wohnungsgeberbestaetigung-erlangen.pdf");

if (!fs.existsSync(DATEI)) {
  console.log("[vorlagen] Keine Vorlagendatei - nichts zu tun.");
  process.exit(0);
}

/**
 * Feldzuordnung des Vordrucks.
 *
 * Die Anschrift des Mietobjekts steht im Vordruck als fester Text - er
 * ist fuer Sankt Michael 27 gesetzt. Die beiden Adressfelder gehoeren
 * zum Mieter (Block unter dem Namen und "Angaben zur Person" in der
 * Wohnungsgeberbestaetigung).
 */
const FELDZUORDNUNG = {
  Vorname: "mieter.vorname",
  Name: "mieter.nachname",
  "Strasse Hausnr": "mieter.strasse",
  "PLZ Ort": "mieter.plzOrt",
  "Ort Datum": "ortDatum",
  "Startdatum der Miete": "mietbeginn",
};

/**
 * Weil Objektanschrift und Meldebehoerde fest im Vordruck stehen, passt
 * er zu genau einem Objekt. Andere Objekte brauchen ihren eigenen
 * Vordruck - die Objektuebersicht weist darauf hin.
 */
const PASST_ZU = { strasse: "Sankt Michael 27", ort: "Erlangen" };

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const daten = fs.readFileSync(DATEI);

  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(new Uint8Array(daten), { ignoreEncryption: true });
  const feldNamen = doc
    .getForm()
    .getFields()
    .map((f) => f.getName());
  const seiten = doc.getPageCount();

  const objekte = await prisma.property.findMany({
    where: {
      street: { contains: PASST_ZU.strasse, mode: "insensitive" },
      city: { contains: PASST_ZU.ort, mode: "insensitive" },
    },
    include: { templates: { select: { id: true } } },
  });

  let angelegt = 0;
  for (const objekt of objekte) {
    if (objekt.templates.length > 0) continue;

    await prisma.propertyTemplate.create({
      data: {
        propertyId: objekt.id,
        kind: "COMBINED",
        title: "Mietvertrag mit Wohnungsgeberbestätigung",
        fileName: path.basename(DATEI),
        sizeBytes: daten.byteLength,
        data: new Uint8Array(daten),
        pageCount: seiten,
        fieldNames: JSON.stringify(feldNamen),
        fieldMap: JSON.stringify(FELDZUORDNUNG),
        active: true,
      },
    });
    angelegt += 1;
    console.log(`[vorlagen] Vorlage hinterlegt bei "${objekt.name}".`);
  }

  const ohne = await prisma.property.count({
    where: { active: true, templates: { none: {} } },
  });
  console.log(
    `[vorlagen] ${angelegt} neu hinterlegt; ${ohne} aktive Objekte warten noch auf ihre kommunale Wohnungsgeberbestätigung.`,
  );
} catch (error) {
  console.error("[vorlagen] Einrichten fehlgeschlagen (Build läuft weiter):", error);
} finally {
  await prisma.$disconnect();
}
