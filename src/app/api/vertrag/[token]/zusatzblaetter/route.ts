import { loadContract } from "@/lib/contract";
import { zusatzblaetterAntwort } from "@/lib/zusatzblaetter";

/**
 * Zusatzblaetter Hausregeln und Muelltrennung fuer den Mieter ueber seinen
 * persoenlichen Link - schon vor der Unterschrift, damit er sie lesen kann.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const contract = await loadContract({ token });
  if (!contract || contract.status === "DRAFT" || contract.status === "CANCELLED") {
    return new Response("Vertrag nicht gefunden", { status: 404 });
  }
  return zusatzblaetterAntwort(contract, request);
}
