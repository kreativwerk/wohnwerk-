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

/**
 * Beim Import liest Vercel die Namen aus .env.example aus und legt sie an -
 * mitsamt der Beispielwerte. Eine Variable kann also gesetzt aussehen und
 * trotzdem nur den Platzhalter aus der Dokumentation enthalten.
 */
const PLATZHALTER = [
  "benutzer:passwort@host",
  "verwaltung@example.de",
  "verwaltung.example.de",
  "vertrag@example.de",
  "example.com",
  "dein-",
  "hier-",
  "changeme",
];

function istPlatzhalter(wert) {
  const klein = wert.toLowerCase();
  return PLATZHALTER.some((muster) => klein.includes(muster));
}

const fehlend = [];
const platzhalter = [];

for (const eintrag of PFLICHT) {
  const wert = process.env[eintrag.name]?.trim();
  if (!wert) fehlend.push(eintrag);
  else if (istPlatzhalter(wert)) platzhalter.push(eintrag);
}

if (fehlend.length > 0 || platzhalter.length > 0) {
  const linie = "─".repeat(72);
  const namen = [...fehlend, ...platzhalter].map((f) => f.name).join(", ");

  console.error(`\n${linie}`);
  console.error(`  Der Build kann nicht starten. Zu klären: ${namen}`);
  console.error(linie);

  if (platzhalter.length > 0) {
    console.error("");
    console.error("  Achtung: diese Variablen sind zwar angelegt, enthalten aber noch");
    console.error("  den Beispielwert aus .env.example. Vercel übernimmt beim Import");
    console.error("  die Namen aus dieser Datei - der echte Wert muss hinein.");
  }

  for (const { name, zweck, hilfe } of [...fehlend, ...platzhalter]) {
    const zustand = fehlend.includes(
      fehlend.find((f) => f.name === name) ?? {},
    )
      ? "ist nicht gesetzt"
      : "enthält noch den Beispielwert";
    console.error(`\n  ${name} ${zustand}`);
    console.error(`  ${zweck}\n`);
    for (const zeile of hilfe) console.error(zeile ? `      ${zeile}` : "");
  }

  // Die letzten Zeilen wiederholen die Namen: im Log ist meist nur das Ende
  // zu sehen, und dort muss stehen, was zu tun ist.
  console.error(`\n${linie}`);
  console.error("  Settings → Environment Variables, alle drei Umgebungen");
  console.error("  ankreuzen (Production, Preview, Development), speichern,");
  console.error("  danach Redeploy drücken.");
  console.error("");
  console.error(`  Zu klären: ${namen}`);
  console.error(`${linie}\n`);
  process.exit(1);
}

console.log("Umgebung vollständig:", PFLICHT.map((p) => p.name).join(", "));
