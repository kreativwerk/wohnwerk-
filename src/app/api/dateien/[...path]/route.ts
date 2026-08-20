import { getSessionUser } from "@/lib/auth";
import { readLocalFile } from "@/lib/storage";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  csv: "text/csv; charset=utf-8",
  xml: "application/xml",
  txt: "text/plain; charset=utf-8",
};

/**
 * Ausliefern von Dokumenten aus der lokalen Ablage (Fallback, wenn Google
 * Drive nicht konfiguriert ist). Nur fuer angemeldete Benutzer.
 */
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!(await getSessionUser())) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const { path } = await context.params;
  const relative = path.map(decodeURIComponent).join("/");

  const data = await readLocalFile(relative);
  if (!data) return new Response("Datei nicht gefunden", { status: 404 });

  const extension = relative.split(".").pop()?.toLowerCase() ?? "";
  const fileName = relative.split("/").pop() ?? "datei";

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": MIME[extension] ?? "application/octet-stream",
      "content-disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}
