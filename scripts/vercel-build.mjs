/**
 * Baut die Anwendung auf Vercel: Umgebung pruefen, Prisma-Client erzeugen,
 * Migrationen einspielen, Next bauen.
 *
 * Der Umweg ueber dieses Skript hat einen Grund: das Schema verlangt fuer
 * Migrationen eine DIRECT_URL (bei Supabase die Verbindung ohne Pooler).
 * Bei Anbietern ohne diese Unterscheidung - Neon, lokales Postgres - soll
 * niemand eine zweite Variable pflegen muessen, deshalb faellt sie hier
 * automatisch auf DATABASE_URL zurueck.
 */

import { spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.DIRECT_URL?.trim() && env.DATABASE_URL?.trim()) {
  env.DIRECT_URL = env.DATABASE_URL;
}

const schritte = [
  ["node", ["scripts/pruefe-umgebung.mjs"]],
  ["npx", ["prisma", "generate"]],
  ["npx", ["prisma", "migrate", "deploy"]],
  // Einmalige Uebernahme eingescannter Bestandsvertraege (no-op ohne Ordner)
  ["node", ["scripts/uebernehme-vertraege.mjs"]],
  // Aus zugeordneten Scans echte Vertraege machen (idempotent)
  ["node", ["scripts/vertraege-nacharbeiten.mjs"]],
  ["npx", ["next", "build"]],
];

for (const [befehl, argumente] of schritte) {
  const ergebnis = spawnSync(befehl, argumente, { stdio: "inherit", env });
  if (ergebnis.status !== 0) process.exit(ergebnis.status ?? 1);
}
