/**
 * Nacharbeit zur Vertragsuebernahme.
 *
 * Die eingescannten Bestandsvertraege lagen zunaechst nur als Dokumente in
 * der Ablage - auf der Mietvertragsseite tauchte deshalb kein einziger
 * Vertrag auf. Dieses Skript schliesst die Luecke:
 *
 *  1. Zu jedem einem Mieter zugeordneten Vertragsscan entsteht ein
 *     unterschriebener Mietvertrag mit dem Scan als PDF.
 *  2. Vertraege ohne Mieter bleiben in der Ablage und werden dort von Hand
 *     zugeordnet - Namen sind in Vertraegen und Listen nicht immer gleich
 *     geschrieben.
 *
 * Laeuft als Schritt im Vercel-Build, ist idempotent und bricht den Build
 * nicht ab.
 */

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const ABLAGE_KATEGORIE = "Mietvertrag ohne Zuordnung";

function token() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function naechsteVertragsnummer(datum) {
  const prefix = `MV-${datum.getUTCFullYear()}-`;
  const letzte = await prisma.contract.findFirst({
    where: { contractNumber: { startsWith: prefix } },
    orderBy: { contractNumber: "desc" },
    select: { contractNumber: true },
  });
  const zahl = letzte ? Number.parseInt(letzte.contractNumber.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isNaN(zahl) ? 0 : zahl) + 1).padStart(4, "0")}`;
}

try {
  // --- 1. Vertraege aus zugeordneten Scans -------------------------------
  const zugeordnet = await prisma.document.findMany({
    where: { kind: "CONTRACT", tenantId: { not: null }, contractId: null },
    orderBy: { documentDate: "asc" },
  });

  let neueVertraege = 0;
  let ergaenzt = 0;

  for (const dokument of zugeordnet) {
    const mieter = await prisma.tenant.findUnique({
      where: { id: dokument.tenantId },
      include: { tenancies: { include: { contract: true }, orderBy: { startDate: "asc" } } },
    });
    if (!mieter || mieter.tenancies.length === 0) continue;

    // Das Mietverhaeltnis mit dem naechstgelegenen Mietbeginn.
    const stichtag = dokument.documentDate?.getTime() ?? null;
    const tenancy =
      stichtag === null
        ? mieter.tenancies[0]
        : mieter.tenancies.reduce((beste, kandidat) =>
            Math.abs(kandidat.startDate.getTime() - stichtag) <
            Math.abs(beste.startDate.getTime() - stichtag)
              ? kandidat
              : beste,
          );

    let contractId = tenancy.contract?.id ?? null;

    if (!tenancy.contract) {
      const contract = await prisma.contract.create({
        data: {
          tenancyId: tenancy.id,
          contractNumber: await naechsteVertragsnummer(tenancy.startDate),
          token: token(),
          status: "SIGNED",
          signedAt: dokument.documentDate ?? tenancy.startDate,
          signerName: `${mieter.firstName} ${mieter.lastName}`.trim(),
          pdfFileId: dokument.driveFileId,
          pdfUrl: dokument.driveUrl,
        },
      });
      contractId = contract.id;
      neueVertraege += 1;
    } else if (!tenancy.contract.pdfUrl) {
      await prisma.contract.update({
        where: { id: tenancy.contract.id },
        data: {
          status: tenancy.contract.status === "DRAFT" ? "SIGNED" : tenancy.contract.status,
          signedAt: tenancy.contract.signedAt ?? dokument.documentDate ?? tenancy.startDate,
          pdfFileId: dokument.driveFileId,
          pdfUrl: dokument.driveUrl,
        },
      });
      ergaenzt += 1;
    }

    await prisma.document.update({ where: { id: dokument.id }, data: { contractId } });
  }

  // --- 2. Nicht zugeordnete Scans klar als Ablage kennzeichnen ------------
  const inAblage = await prisma.document.updateMany({
    where: { kind: "CONTRACT", tenantId: null, category: { not: ABLAGE_KATEGORIE } },
    data: { category: ABLAGE_KATEGORIE },
  });

  console.log(
    `[vertraege] ${neueVertraege} Verträge angelegt, ${ergaenzt} um das PDF ergänzt, ` +
      `${inAblage.count} Scans in die Ablage übernommen.`,
  );
} catch (error) {
  console.error("[vertraege] Nacharbeit fehlgeschlagen (Build läuft weiter):", error);
} finally {
  await prisma.$disconnect();
}
