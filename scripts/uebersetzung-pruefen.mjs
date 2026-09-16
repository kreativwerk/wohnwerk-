/**
 * Meldet Oberflächentexte ohne englische Entsprechung.
 *
 *   node scripts/uebersetzung-pruefen.mjs
 *
 * Gesammelt wird, was durch t("…") läuft, dazu die Beschriftungskarten in
 * enums.ts und pdf-template.ts und die Statusmeldungen der Ablage. Was im
 * Wörterbuch fehlt, erscheint in der englischen Ansicht auf Deutsch - der
 * stille Rückfall ist bequem, versteckt aber genau diese Lücken. Deshalb
 * diese Prüfung: sie endet mit Code 1, wenn etwas fehlt.
 *
 * Nicht geprüft wird, was in der Datenbank steht - Objekt- und Bettnamen,
 * Belegtitel, Kostenposten. Das sind Eingaben der Hausverwaltung und
 * bleiben so, wie sie getippt wurden.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function dateien(verzeichnis, gesammelt = []) {
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) dateien(pfad, gesammelt);
    else if (/\.tsx?$/.test(eintrag.name)) gesammelt.push(pfad);
  }
  return gesammelt;
}

const schluessel = new Set();

// 1. Alles, was der Code durch t("…") schickt.
for (const datei of dateien(WURZEL)) {
  const quelle = fs.readFileSync(datei, "utf8");
  for (const treffer of quelle.matchAll(/\bt\(\s*\n?\s*"((?:\\.|[^"\\])*)"/g)) {
    schluessel.add(JSON.parse(`"${treffer[1]}"`));
  }
}

// 2. Beschriftungskarten und Meldungen, die anderswo angezeigt werden.
//    Je Datei nur die Muster, die dort tatsächlich Oberfläche sind - in
//    storage.ts stehen daneben Modus-Kennungen ("db", "drive") und
//    Drive-Feldlisten, die niemand zu sehen bekommt.
const QUELLEN = [
  ["lib/enums.ts", [
    /^\s*[A-Za-z_"'][\w"' .:-]*:\s*"([^"]+)",\s*$/gm,
    /^\s{2}"([^"]+)",\s*$/gm, // Werte-Listen wie EXPENSE_CATEGORIES
  ]],
  ["lib/pdf-template.ts", [/\blabel:\s*"([^"]+)"/g]],
  ["lib/storage.ts", [/^\s*message:\s*\n?\s*"([^"]+)",?\s*$/gm]],
];

for (const [datei, muster] of QUELLEN) {
  const quelle = fs.readFileSync(path.join(WURZEL, datei), "utf8");
  for (const m of muster) {
    for (const treffer of quelle.matchAll(m)) {
      const text = treffer[1];
      if (/\p{L}/u.test(text) && !/^[A-Z_]+$/.test(text)) schluessel.add(text);
    }
  }
}

const woerterbuch = fs.readFileSync(path.join(WURZEL, "lib/woerterbuch-en.ts"), "utf8");
const uebersetzt = new Set();
for (const treffer of woerterbuch.matchAll(
  /^\s*(?:"((?:\\.|[^"\\])*)"|([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß]*))\s*:/gm,
)) {
  uebersetzt.add(treffer[1] ? JSON.parse(`"${treffer[1]}"`) : treffer[2]);
}

const fehlend = [...schluessel].filter((text) => !uebersetzt.has(text)).sort();

console.log(`${schluessel.size} Oberflächentexte, ${uebersetzt.size} Einträge im Wörterbuch`);
if (fehlend.length === 0) {
  console.log("Alles übersetzt.\n");
  process.exit(0);
}

console.error(`\n${fehlend.length} ohne englische Entsprechung:\n`);
for (const text of fehlend) console.error(`  ${JSON.stringify(text)}: "",`);
console.error("\nBitte in src/lib/woerterbuch-en.ts ergänzen.\n");
process.exit(1);
