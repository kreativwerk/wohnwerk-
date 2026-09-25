import { getSessionUser } from "@/lib/auth";
import { loadContract } from "@/lib/contract";
import { buildDocumentsFromTemplates } from "@/lib/property-documents";

/**
 * Wohnungsgeberbestaetigung zum Mietverhaeltnis - jederzeit, auch vor der
 * Unterschrift des Mieters und fuer Vertraege, die vor dem Einrichten des
 * Vordrucks unterschrieben wurden. Gefuellt wird der kommunale Vordruck
 * des Objekts; ohne Vordruck gibt es einen Hinweis statt einer Datei.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const { id } = await context.params;
  const contract = await loadContract({ id });
  if (!contract) return new Response("Vertrag nicht gefunden", { status: 404 });

  let dokument;
  try {
    dokument = (await buildDocumentsFromTemplates(contract)).find((d) => d.istWohnungsgeberbestaetigung);
  } catch (error) {
    console.error("[wohnungsgeber] Vordruck konnte nicht gefüllt werden:", error);
    return new Response("Der Vordruck konnte nicht gefüllt werden.", { status: 500 });
  }
  if (!dokument) {
    return new Response(
      "Für dieses Objekt ist kein Vordruck der Wohnungsgeberbestätigung hinterlegt. Auf der Objektseite unter „Vordrucke“ hochladen.",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const mieter = `${contract.tenancy.tenant.firstName} ${contract.tenancy.tenant.lastName}`.trim();
  return new Response(new Uint8Array(dokument.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Wohnungsgeberbestaetigung ${contract.contractNumber} ${mieter}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
