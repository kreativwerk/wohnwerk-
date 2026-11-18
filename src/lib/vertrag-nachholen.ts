import "server-only";

import { finalizeSignedContract } from "@/app/actions/contracts";
import { prisma } from "./db";

/**
 * Unterschriebene Vertraege, deren PDF nicht abgelegt wurde (Ablage
 * fehlgeschlagen oder - bis 11/2026 - nur Wohnungsgeber-Vordruck am Objekt):
 * Ablage nachholen. Laeuft im taeglichen Abgleich mit. Gibt die Zahl zurueck.
 */
export async function fehlendeVertragsPdfsNachholen(): Promise<number> {
  const offen = await prisma.contract.findMany({
    where: { status: "SIGNED", pdfUrl: null },
    select: { id: true, contractNumber: true },
    take: 20,
  });
  let nachgeholt = 0;
  for (const c of offen) {
    try {
      await finalizeSignedContract(c.id);
      nachgeholt += 1;
    } catch (error) {
      console.error(`[vertrag] Nachholen ${c.contractNumber} fehlgeschlagen:`, error);
    }
  }
  return nachgeholt;
}
