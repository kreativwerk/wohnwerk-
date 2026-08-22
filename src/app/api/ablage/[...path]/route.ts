import { requireApiUser } from "@/lib/auth";
import { readStoredFile } from "@/lib/storage";

/**
 * Liefert Dokumente aus der Ablage aus (Supabase Storage oder Datenbank) -
 * nur an angemeldete Benutzer. Schluessel und Datenbank bleiben auf dem
 * Server; im Browser taucht nie eine Supabase-Adresse auf.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    await requireApiUser();
  } catch (response) {
    return response as Response;
  }

  const { path } = await context.params;
  const objektPfad = path.map(decodeURIComponent).join("/");
  if (objektPfad.includes("..")) return new Response("Ungültiger Pfad", { status: 400 });

  const datei = await readStoredFile(objektPfad);
  if (!datei) return new Response("Datei nicht gefunden", { status: 404 });

  return new Response(new Uint8Array(datei.data), {
    headers: {
      "content-type": datei.contentType,
      "content-disposition": `inline; filename="${objektPfad.split("/").pop() ?? "datei"}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
