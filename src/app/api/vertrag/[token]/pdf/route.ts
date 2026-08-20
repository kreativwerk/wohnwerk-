import { buildContractData, loadContract } from "@/lib/contract";
import { renderContractPdf } from "@/lib/contract-pdf";

/** Oeffentlicher Download: nur mit gueltigem Token und nur nach Unterschrift. */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const contract = await loadContract({ token });

  if (!contract) {
    return new Response("Vertrag nicht gefunden", { status: 404 });
  }
  if (contract.status !== "SIGNED") {
    return new Response("Der Vertrag ist noch nicht unterschrieben.", { status: 403 });
  }

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
