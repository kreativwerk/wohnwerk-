import { NextResponse } from "next/server";

import { postfachAbrufen, postfachZugang } from "@/lib/postfach";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Taeglicher Postfach-Abruf, ausgeloest von Vercel Cron (vercel.json). Holt
 * neue Mails, legt Rechnungen als Belege ab und ordnet sie Buchungen zu.
 * Ausserdem holt die App das Postfach beim Oeffnen der Postfach-Seite.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const vonVercel = (request.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
  if (secret ? auth !== `Bearer ${secret}` : !vonVercel) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await postfachZugang())) return NextResponse.json({ ok: true, postfach: "nicht eingerichtet" });

  const ergebnis = await postfachAbrufen("cron", { hoechstens: 80 });
  return NextResponse.json({
    ok: ergebnis.ok,
    neu: ergebnis.neu,
    belege: ergebnis.belege,
    zugeordnet: ergebnis.belegeZugeordnet + ergebnis.nachZugeordnet,
    kuendigungen: ergebnis.kuendigungen,
    weitere: Boolean(ergebnis.weitere),
    fehler: ergebnis.fehler ?? null,
  });
}
