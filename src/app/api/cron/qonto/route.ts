import { NextResponse } from "next/server";

import { autoMatch } from "@/lib/accounting";
import { eigenbelegeFuerGebuehren } from "@/lib/eigenbeleg";
import { qontoAbgleich, qontoBelegeNachholen, qontoZugang } from "@/lib/qonto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Taeglicher Qonto-Abgleich, ausgeloest von Vercel Cron (vercel.json).
 *
 * Ist CRON_SECRET gesetzt, schickt Vercel es als Bearer-Token mit - dann
 * muss es passen. Ohne Secret genuegt die Kennung des Vercel-Crons. Mehr
 * als einen Abgleich ausloesen kann ein Fremder damit nicht: keine Daten
 * in der Antwort, nur Zahlen.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const vonVercel = (request.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
  if (secret ? auth !== `Bearer ${secret}` : !vonVercel) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Ohne Qonto trotzdem zuordnen: Eingaenge aus hochgeladenen Auszuegen.
  if (!(await qontoZugang())) {
    const zuordnung = await autoMatch();
    const eigenbelege = await eigenbelegeFuerGebuehren();
    return NextResponse.json({ ok: true, qonto: "nicht eingerichtet", zugeordnet: zuordnung.matched, eigenbelege });
  }

  // Nachholen aller Belege ab einem Tag: /api/cron/qonto?belege_ab=2026-01-01
  const belegeAb = new URL(request.url).searchParams.get("belege_ab");
  if (belegeAb && /^\d{4}-\d{2}-\d{2}$/.test(belegeAb)) {
    const nach = await qontoBelegeNachholen("cron", new Date(`${belegeAb}T00:00:00Z`));
    return NextResponse.json({
      ok: nach.ok,
      belege: nach.belege ?? 0,
      ohneBuchung: nach.belegeOhneBuchung ?? 0,
      weitere: Boolean(nach.belegeWeitere),
      hinweis: nach.belegHinweis ?? null,
      fehler: nach.fehler ?? null,
    });
  }

  const ergebnis = await qontoAbgleich("cron");
  return NextResponse.json({
    ok: ergebnis.ok,
    neu: ergebnis.neu,
    doppelt: ergebnis.doppelt,
    zugeordnet: ergebnis.zugeordnet,
    fehler: ergebnis.fehler ?? null,
  });
}
