import { getSessionUser } from "@/lib/auth";
import { buildContractData, loadContract } from "@/lib/contract";
import { renderContractPdf } from "@/lib/contract-pdf";
import { buildDocumentsFromTemplates } from "@/lib/property-documents";

/**
 * Vorschau/Download fuer die Hausverwaltung - auch vor der Unterschrift.
 *
 * Hat das Objekt eine hinterlegte Vertragsvorlage, wird genau dieses
 * Originaldokument gefuellt - mit Logo, Kopf- und Fusszeile, so wie es
 * am Ende unterschrieben wird. Erst ohne Vorlage entsteht der von der
 * Anwendung gesetzte Vertrag.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const { id } = await context.params;
  const contract = await loadContract({ id });
  if (!contract) return new Response("Vertrag nicht gefunden", { status: 404 });

  let pdf: Buffer | null = null;
  try {
    const ausVorlage = await buildDocumentsFromTemplates(contract);
    pdf = ausVorlage.find((dokument) => dokument.istMietvertrag)?.pdf ?? null;
  } catch (error) {
    // Eine kaputte Vorlage darf die Vorschau nicht verhindern.
    console.error("[vertrag] Vorlage konnte nicht gefüllt werden:", error);
  }

  if (!pdf) {
    const data = await buildContractData(contract, { includeSignature: true });
    pdf = await renderContractPdf(data);
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Mietvertrag-${contract.contractNumber}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
