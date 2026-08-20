import { getSessionUser } from "@/lib/auth";
import { buildContractData, loadContract } from "@/lib/contract";
import { renderContractPdf } from "@/lib/contract-pdf";

/** Vorschau/Download fuer die Hausverwaltung - auch vor der Unterschrift. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const { id } = await context.params;
  const contract = await loadContract({ id });
  if (!contract) return new Response("Vertrag nicht gefunden", { status: 404 });

  const data = await buildContractData(contract, { includeSignature: true });
  const pdf = await renderContractPdf(data);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Mietvertrag-${contract.contractNumber}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
