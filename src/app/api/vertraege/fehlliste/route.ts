import { requireApiUser } from "@/lib/auth";
import { fehllistePdf } from "@/lib/fehlliste-pdf";
import { vertragsExportStand } from "@/lib/vertrags-export";

/** Welche laufenden Mietverhaeltnisse noch keinen unterschriebenen Vertrag haben - als PDF. */
export async function GET() {
  try {
    await requireApiUser();
  } catch (response) {
    return response as Response;
  }
  const heute = new Date();
  const pdf = await fehllistePdf(await vertragsExportStand(heute), heute);
  const datum = heute.toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Fehlende-Mietvertraege-${datum}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
