/**
 * Prüft vor dem Bauen, ob die nötigen Umgebungsvariablen gesetzt sind.
 *
 * Ohne diese Prüfung stirbt der Build in Prisma mit "Error validating
 * datasource" und einem Stapel Fehlermeldungen, aus denen niemand ableiten
 * kann, wo der Schalter sitzt. Diese Zeilen sagen es.
 */

const PFLICHT = [
  {
    name: "DATABASE_URL",
    zweck: "Verbindung zur PostgreSQL-Datenbank",
    hilfe: [
      "In Vercel: Storage → Create Database → Neon Postgres (Region Frankfurt),",
      "danach Connect Project → das Wohnwerk-Projekt wählen und dabei",
      "Production, Preview und Development ankreuzen.",
      "",
      "Ist die Datenbank bereits verbunden, unter Settings → Environment",
      "Variables nachsehen: manche Anbindungen setzen nur POSTGRES_URL.",
      "Wohnwerk liest DATABASE_URL - dann diese von Hand anlegen und den",
      "Wert der gepoolten Verbindung eintragen.",
    ],
  },
  {
    name: "AUTH_SECRET",
    zweck: "Unterschreibt die Sitzungs-Cookies",
    hilfe: [
      "Ein zufälliger Schlüssel mit mindestens 16 Zeichen. Erzeugen mit:",
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    ],
  },
];

const fehlend = PFLICHT.filter(({ name }) => !process.env[name]?.trim());

if (fehlend.length > 0) {
  const linie = "─".repeat(72);
  console.error(`\n${linie}`);
  console.error("  Der Build kann nicht starten: Umgebungsvariablen fehlen");
  console.error(linie);

  for (const { name, zweck, hilfe } of fehlend) {
    console.error(`\n  ${name} ist nicht gesetzt`);
    console.error(`  ${zweck}\n`);
    for (const zeile of hilfe) console.error(zeile ? `      ${zeile}` : "");
  }

  console.error(`\n${linie}`);
  console.error("  Nach dem Eintragen in Vercel auf Redeploy drücken.");
  console.error(`${linie}\n`);
  process.exit(1);
}

console.log("Umgebung vollständig:", PFLICHT.map((p) => p.name).join(", "));
