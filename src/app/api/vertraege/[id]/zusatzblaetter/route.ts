import { getInternerUser } from "@/lib/auth";
import { loadContract } from "@/lib/contract";
import { zusatzblaetterAntwort } from "@/lib/zusatzblaetter";

/** Zusatzblaetter Hausregeln und Muelltrennung zum Ausdrucken - fuer die Hausverwaltung. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getInternerUser())) {
    return new Response("Nicht angemeldet", { status: 401 });
  }
  const { id } = await context.params;
  const contract = await loadContract({ id });
  if (!contract) return new Response("Vertrag nicht gefunden", { status: 404 });
  return zusatzblaetterAntwort(contract, request);
}
