/**
 * Einmalige Uebernahme der eingescannten Bestands-Mietvertraege.
 *
 * Laeuft als Schritt im Vercel-Build (nach den Migrationen): liest die
 * PDFs aus vertraege-import/, legt sie in der Dokumentenablage der
 * Datenbank ab (Tabelle AblageDatei) und verzeichnet je Datei ein
 * Dokument - dem Mieter zugeordnet, wenn das Manifest einen Namen nennt.
 *
 * Idempotent: bereits uebernommene Dateien werden am Ablagepfad erkannt
 * und uebersprungen. Fehlt der Ordner, passiert nichts. Ein Fehler bricht
 * den Build nicht ab - die Uebernahme wird beim naechsten Deploy erneut
 * versucht.
 */

import fs from "node:fs";
import path from "node:path";

const ORDNER = path.resolve("vertraege-import");
const MANIFEST = path.join(ORDNER, "manifest.json");

if (!fs.existsSync(MANIFEST)) {
  console.log("[vertraege] Kein Importordner - nichts zu tun.");
  process.exit(0);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  let uebernommen = 0;
  let uebersprungen = 0;
  let ohneMieter = 0;

  for (const eintrag of manifest.vertraege) {
    const pfad = `Mietvertraege/Bestand/${eintrag.datei}`;
    const vorhanden = await prisma.ablageDatei.findUnique({ where: { pfad }, select: { id: true } });
    if (vorhanden) {
      uebersprungen += 1;
      continue;
    }

    const quelle = path.join(ORDNER, eintrag.datei);
    if (!fs.existsSync(quelle)) {
      console.warn(`[vertraege] Datei fehlt im Ordner: ${eintrag.datei}`);
      continue;
    }
    const daten = fs.readFileSync(quelle);

    // Mieter anhand des Manifest-Namens finden (Vor- und Nachname exakt).
    let tenantId = null;
    if (eintrag.mieter) {
      const [firstName, ...rest] = eintrag.mieter.split(" ");
      const treffer = await prisma.tenant.findMany({
        where: { firstName, lastName: rest.join(" ") },
        select: { id: true },
      });
      if (treffer.length === 1) tenantId = treffer[0].id;
      else console.warn(`[vertraege] Mieter nicht eindeutig: ${eintrag.mieter} (${treffer.length} Treffer)`);
    }
    if (!tenantId) ohneMieter += 1;

    await prisma.ablageDatei.create({
      data: {
        pfad,
        mimeType: "application/pdf",
        sizeBytes: daten.byteLength,
        daten: new Uint8Array(daten),
      },
    });

    await prisma.document.create({
      data: {
        kind: "CONTRACT",
        title: `Mietvertrag ${eintrag.name} (Bestand)`,
        fileName: eintrag.datei,
        mimeType: "application/pdf",
        sizeBytes: daten.byteLength,
        driveFileId: pfad,
        driveUrl: `/api/ablage/${pfad.split("/").map(encodeURIComponent).join("/")}`,
        driveFolder: "Mietvertraege/Bestand",
        documentDate: eintrag.beginn ? new Date(`${eintrag.beginn}T00:00:00Z`) : null,
        category: tenantId ? "Mietvertrag Bestand" : "Mietvertrag Bestand (ohne Mieterzuordnung)",
        tenantId,
      },
    });

    uebernommen += 1;
  }

  console.log(
    `[vertraege] ${uebernommen} übernommen, ${uebersprungen} bereits vorhanden, davon neu ohne Mieterzuordnung: ${ohneMieter}.`,
  );
} catch (error) {
  console.error("[vertraege] Übernahme fehlgeschlagen (Build läuft weiter):", error);
} finally {
  await prisma.$disconnect();
}
