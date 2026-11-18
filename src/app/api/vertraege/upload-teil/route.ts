import { isAdmin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Groesse eines Stuecks - unter der Grenze von Vercel (4,5 MB je Anfrage). */
const MAX_TEIL = 3.5 * 1024 * 1024;

/**
 * Nimmt ein Stueck einer grossen Datei entgegen (Scan eines Mietvertrags).
 * Die Stuecke liegen kurz in der Zwischenablage, bis der Upload sie zu einer
 * Datei zusammensetzt - so gibt es keine Groessengrenze je Anfrage.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireApiUser();
  } catch (response) {
    return response as Response;
  }
  if (!isAdmin(user)) return new Response("Keine Berechtigung", { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const nr = Number(url.searchParams.get("nr"));
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id) || !Number.isInteger(nr) || nr < 0 || nr > 20) {
    return new Response("Ungültiger Teil", { status: 400 });
  }
  const daten = Buffer.from(await request.arrayBuffer());
  if (daten.byteLength === 0 || daten.byteLength > MAX_TEIL) return new Response("Teil zu groß", { status: 413 });

  const pfad = `Zwischenablage/${id}/${String(nr).padStart(3, "0")}`;
  await prisma.ablageDatei.upsert({
    where: { pfad },
    create: { pfad, mimeType: "application/octet-stream", sizeBytes: daten.byteLength, daten },
    update: { sizeBytes: daten.byteLength, daten },
  });
  return Response.json({ ok: true });
}
