import { loadContract } from "@/lib/contract";
import { buildDocumentsFromTemplates } from "@/lib/property-documents";

/**
 * Wohnungsgeberbestaetigung fuer den Mieter selbst - ueber seinen
 * persoenlichen Link, aber erst nach der Unterschrift. Gefuellt wird der
 * Vordruck des Objekts; ohne Vordruck gibt es einen Hinweis.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const contract = await loadContract({ token });
  if (!contract) return new Response("Vertrag nicht gefunden", { status: 404 });
  if (contract.status !== "SIGNED") {
    return new Response("Erst nach der Unterschrift verfügbar.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  let dokument;
  try {
    dokument = (await buildDocumentsFromTemplates(contract)).find((d) => d.istWohnungsgeberbestaetigung);
  } catch (error) {
    console.error("[wohnungsgeber] Vordruck konnte nicht gefüllt werden:", error);
  }
  if (!dokument) {
    return new Response("Die Wohnungsgeberbestätigung bekommen Sie von der Hausverwaltung.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(new Uint8Array(dokument.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Wohnungsgeberbestaetigung-${contract.contractNumber}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
