import { buildContractData, loadContract } from "@/lib/contract";
import { renderContractPdf } from "@/lib/contract-pdf";
import { buildDocumentsFromTemplates } from "@/lib/property-documents";

/**
 * Oeffentlicher Download: nur mit gueltigem Token und nur nach Unterschrift.
 *
 * Der Mieter bekommt dasselbe Dokument, das auch abgelegt wurde: die
 * ausgefuellte Originalvorlage des Objekts, sonst den von der Anwendung
 * gesetzten Vertrag.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const contract = await loadContract({ token });

  if (!contract) {
    return new Response("Vertrag nicht gefunden", { status: 404 });
  }
  if (contract.status !== "SIGNED") {
    return new Response("Der Vertrag ist noch nicht unterschrieben.", { status: 403 });
  }

  let pdf: Buffer | null = null;
  try {
    const ausVorlage = await buildDocumentsFromTemplates(contract);
    pdf = ausVorlage.find((dokument) => dokument.istMietvertrag)?.pdf ?? null;
  } catch (error) {
    // Lieber der selbst gesetzte Vertrag als gar keiner.
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
