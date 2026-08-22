import { getSessionUser } from "@/lib/auth";
import { buildDocumentCsv, buildRentCsv, buildTransactionCsv } from "@/lib/export";
import { buildDatevCsv } from "@/lib/datev";

/** Direkter CSV-Download fuer den Steuerberater-Export. */
export async function GET(request: Request, context: { params: Promise<{ type: string }> }) {
  if (!(await getSessionUser())) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const { type } = await context.params;
  const url = new URL(request.url);

  const year = Number(url.searchParams.get("jahr") ?? new Date().getUTCFullYear());
  const monthRaw = Number(url.searchParams.get("monat") ?? 0);
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : undefined;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return new Response("Ungueltiges Jahr", { status: 400 });
  }

  const suffix = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);

  // DATEV liefert Bytes in Windows-1252 statt UTF-8-Text.
  if (type === "datev") {
    const bytes = await buildDatevCsv(year, month);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "text/csv; charset=windows-1252",
        "content-disposition": `attachment; filename="EXTF_Buchungsstapel_${suffix}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  }

  let csv: string;
  let fileName: string;

  switch (type) {
    case "buchungen":
      csv = await buildTransactionCsv(year, month);
      fileName = `Buchungen ${suffix}.csv`;
      break;
    case "belege":
      csv = await buildDocumentCsv(year, month);
      fileName = `Belegliste ${suffix}.csv`;
      break;
    case "mieten":
      csv = await buildRentCsv(year);
      fileName = `Mieten ${year}.csv`;
      break;
    default:
      return new Response("Unbekannter Export", { status: 404 });
  }

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "private, no-store",
    },
  });
}
