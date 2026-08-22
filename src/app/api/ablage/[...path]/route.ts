import { requireApiUser } from "@/lib/auth";
import { readSupabaseFile } from "@/lib/storage";

/**
 * Liefert Dokumente aus der Supabase-Ablage aus - nur an angemeldete
 * Benutzer. Der geheime Schluessel bleibt auf dem Server; im Browser
 * taucht nie eine Supabase-Adresse auf.
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

  const datei = await readSupabaseFile(objektPfad);
  if (!datei) return new Response("Datei nicht gefunden", { status: 404 });

  return new Response(new Uint8Array(datei.data), {
    headers: {
      "content-type": datei.contentType,
      "content-disposition": `inline; filename="${objektPfad.split("/").pop() ?? "datei"}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
