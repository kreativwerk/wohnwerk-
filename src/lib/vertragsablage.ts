import "server-only";

import { prisma } from "./db";
import { nextContractNumber } from "./tenancy";
import { randomToken } from "./storage";

export { besterTreffer, nameAusTitel, namensAehnlichkeit, type Vorschlag } from "./namen";

/**
 * Vertragsablage: eingescannte Mietvertraege, die noch keinem Mieter
 * zugeordnet sind, sowie die Logik, sie einem Mieter zuzuordnen.
 *
 * Hintergrund: Die Bestandsvertraege kamen als Stapelscan herein. Die
 * meisten liessen sich ueber den gedruckten Namen zuordnen, der Rest
 * braucht eine Hand - Namen sind in Vertraegen und Tabellen nicht immer
 * gleich geschrieben.
 */

export const ABLAGE_KATEGORIE = "Mietvertrag ohne Zuordnung";

// --- Zuordnung -------------------------------------------------------------

/**
 * Haengt ein abgelegtes Vertragsdokument an einen Mieter.
 *
 * Passt das Dokument zu einem Mietverhaeltnis, entsteht daraus ein
 * unterschriebener Vertrag mit dem Scan als PDF - erst dadurch taucht der
 * Vertrag auf der Mietvertragsseite auf. Hat der Mieter kein
 * Mietverhaeltnis (typisch fuer ehemalige Mieter aus dem Altbestand),
 * bleibt das Dokument beim Mieter haengen.
 */
export async function ordneVertragZu(
  documentId: string,
  tenantId: string,
): Promise<{ contractId: string | null; mieterName: string }> {
  const [dokument, mieter] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { tenancies: { include: { contract: true }, orderBy: { startDate: "asc" } } },
    }),
  ]);
  if (!dokument) throw new Error("Dokument nicht gefunden.");
  if (!mieter) throw new Error("Mieter nicht gefunden.");

  const mieterName = `${mieter.firstName} ${mieter.lastName}`.trim();

  // Passendes Mietverhaeltnis: das mit dem naechstgelegenen Mietbeginn.
  const stichtag = dokument.documentDate?.getTime() ?? null;
  const tenancy =
    mieter.tenancies.length === 0
      ? null
      : stichtag === null
        ? mieter.tenancies[0]
        : mieter.tenancies.reduce((beste, kandidat) =>
            Math.abs(kandidat.startDate.getTime() - stichtag) <
            Math.abs(beste.startDate.getTime() - stichtag)
              ? kandidat
              : beste,
          );

  let contractId: string | null = tenancy?.contract?.id ?? null;

  if (tenancy && !tenancy.contract) {
    const contract = await prisma.contract.create({
      data: {
        tenancyId: tenancy.id,
        contractNumber: await nextContractNumber(tenancy.startDate),
        token: randomToken(),
        // Der Scan ist ein unterschriebener Vertrag auf Papier.
        status: "SIGNED",
        signedAt: dokument.documentDate ?? tenancy.startDate,
        signerName: mieterName,
        pdfFileId: dokument.driveFileId,
        pdfUrl: dokument.driveUrl,
      },
    });
    contractId = contract.id;
  } else if (tenancy?.contract && !tenancy.contract.pdfUrl) {
    // Vertrag existiert schon (z. B. als Entwurf) - der Scan ist der Beleg.
    await prisma.contract.update({
      where: { id: tenancy.contract.id },
      data: {
        status: tenancy.contract.status === "DRAFT" ? "SIGNED" : tenancy.contract.status,
        signedAt: tenancy.contract.signedAt ?? dokument.documentDate ?? tenancy.startDate,
        pdfFileId: dokument.driveFileId,
        pdfUrl: dokument.driveUrl,
      },
    });
  }

  // Der Titel bekommt den richtigen Namen, behaelt aber Hinweise wie
  // "(mit SEPA-Mandat)" - die beschreiben den Inhalt des Scans.
  const zusatz = /\((.+)\)\s*$/.exec(dokument.title)?.[1];
  await prisma.document.update({
    where: { id: documentId },
    data: {
      tenantId,
      contractId,
      category: "Mietvertrag",
      title: `Mietvertrag ${mieterName}${zusatz && zusatz !== "Bestand" ? ` (${zusatz})` : ""}`,
    },
  });

  return { contractId, mieterName };
}
