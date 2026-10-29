import { NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { isAdmin, requireApiUser } from "@/lib/auth";
import { ausgabeFuerBeleg, belegAnBuchung } from "@/lib/beleg-zuordnung";
import { prisma } from "@/lib/db";
import { pdfText } from "@/lib/postfach";
import { absenderWoerter, anhangTyp, betraegeAusText, datumAusText, einzugAusText, rechnungsnummerAusText } from "@/lib/postfach-regeln";
import { FOLDER, uploadFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel nimmt pro Anfrage hoechstens ~4,5 MB - die Seite schickt deshalb jede Datei einzeln. */
const MAX_BYTES = 4 * 1024 * 1024;

/** "Hornbach 25.07.2026(2).pdf" -> 25.07.2026 und "Hornbach". */
function ausDateiname(name: string): { datum: Date | null; lieferant: string } {
  const ohneEndung = name.replace(/\.[a-z0-9]+$/i, "");
  const t = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(ohneEndung);
  const datum = t ? new Date(Date.UTC(Number(t[3]), Number(t[2]) - 1, Number(t[1]))) : null;
  const lieferant = ohneEndung.replace(/\(\d+\)/g, "").replace(/\d{1,2}\.\d{1,2}\.\d{4}/, "").replace(/RG\b/i, "").trim();
  return { datum: datum && !Number.isNaN(datum.getTime()) ? datum : null, lieferant };
}

/**
 * Sammel-Upload: eine Datei pro Anfrage. Legt sie als Beleg ab und ordnet
 * sie einer Abbuchung zu, wenn Betrag (aus dem PDF-Text) und Zeitraum
 * eindeutig passen. Sonst bleibt sie zum Zuordnen in der Belegablage.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireApiUser();
  } catch (antwort) {
    return antwort as Response;
  }
  if (!isAdmin(user)) return NextResponse.json({ ok: false, meldung: "Nur für die Verwaltung." }, { status: 403 });

  const form = await request.formData();
  const datei = form.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return NextResponse.json({ ok: false, meldung: "Keine Datei." }, { status: 400 });
  if (datei.size > MAX_BYTES) return NextResponse.json({ ok: false, meldung: "Größer als 4 MB – bitte einzeln über „Beleg erfassen“." }, { status: 413 });

  const mimeType = anhangTyp(datei.name, datei.type) ?? (datei.type || "application/octet-stream");
  const daten = Buffer.from(await datei.arrayBuffer());

  // Schon einmal hochgeladen (gleicher Name, gleiche Groesse)? Dann nicht doppelt ablegen.
  const doppelt = await prisma.document.findFirst({ where: { fileName: datei.name, sizeBytes: daten.byteLength }, select: { id: true } });
  if (doppelt) return NextResponse.json({ ok: true, doppelt: true, meldung: "Schon vorhanden" });

  const ausName = ausDateiname(datei.name);
  const text = mimeType === "application/pdf" ? await pdfText(daten) : "";
  const betraege = betraegeAusText(text);
  const belegDatum = datumAusText(text) ?? ausName.datum ?? new Date();
  const rechnungsnummer = rechnungsnummerAusText(text);
  const einzug = einzugAusText(text);

  const abgelegt = await uploadFile({
    fileName: `${belegDatum.toISOString().slice(0, 10)} ${datei.name}`,
    mimeType,
    data: daten,
    folderSegments: FOLDER.receipts(belegDatum.getUTCFullYear(), belegDatum.getUTCMonth() + 1),
  });
  const dokument = await prisma.document.create({
    data: {
      kind: "RECEIPT",
      title: datei.name.replace(/\.[a-z0-9]+$/i, ""),
      fileName: datei.name,
      mimeType,
      sizeBytes: daten.byteLength,
      driveFileId: abgelegt.fileId,
      driveUrl: abgelegt.url,
      driveFolder: abgelegt.folder,
      localPath: abgelegt.localPath,
      documentDate: belegDatum,
      amountCents: betraege[0] ?? null,
      supplier: ausName.lieferant.slice(0, 120) || null,
      notes: ["Sammel-Upload.", rechnungsnummer ? `Rechnungsnr. ${rechnungsnummer}.` : null].filter(Boolean).join(" "),
    },
  });

  let zugeordnet: string | null = null;
  if (betraege.length > 0) {
    const treffer = await ausgabeFuerBeleg({
      betraege,
      datum: belegDatum,
      absenderWoerter: absenderWoerter("", ausName.lieferant),
      rechnungsnummer,
      einzug,
    });
    if (treffer) {
      await prisma.document.update({ where: { id: dokument.id }, data: { amountCents: Math.abs(treffer.amountCents) } });
      await belegAnBuchung(dokument.id, treffer.id);
      zugeordnet = `${treffer.bookingDate.toISOString().slice(0, 10).split("-").reverse().join(".")} · ${(Math.abs(treffer.amountCents) / 100).toFixed(2).replace(".", ",")} €`;
    }
  }

  await audit(user.email, "upload", "Document", dokument.id, `Sammel-Upload: ${datei.name}`);
  return NextResponse.json({ ok: true, zugeordnet, meldung: zugeordnet ? `Buchung ${zugeordnet}` : "Abgelegt" });
}
