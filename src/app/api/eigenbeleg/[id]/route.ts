import { getSessionUser } from "@/lib/auth";
import { eigenbelegPdf } from "@/lib/eigenbeleg";

export const dynamic = "force-dynamic";

/** Eigenbeleg einer Buchung als PDF - nur fuer angemeldete Nutzer. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return new Response("Nicht angemeldet", { status: 401 });
  const { id } = await params;
  const pdf = await eigenbelegPdf(id);
  if (!pdf) return new Response("Buchung nicht gefunden", { status: 404 });
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Eigenbeleg-${id}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
