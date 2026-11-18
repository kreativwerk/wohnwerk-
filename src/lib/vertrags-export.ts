import "server-only";

import { prisma } from "./db";

/** Statusnamen fuer Liste und PDF. */
export const VERTRAGS_STATUS_NAME: Record<string, string> = {
  KEIN: "kein Vertrag",
  DRAFT: "Entwurf",
  SENT: "versendet, nicht unterschrieben",
  VIEWED: "angesehen, nicht unterschrieben",
  CANCELLED: "storniert",
  SIGNED: "unterschrieben",
  ENDED: "beendet",
};

export type FehlenderVertrag = {
  tenancyId: string;
  contractId: string | null;
  mieter: string;
  telefon: string | null;
  objekt: string;
  zimmer: string;
  einzug: Date;
  status: string;
  versendetAm: Date | null;
};

/** Eine Zeile der Uebersicht: aktiv mit Vertrag oder nicht mehr aktiv. */
export type VertragsZeile = {
  tenancyId: string;
  contractId: string | null;
  mieter: string;
  objekt: string;
  zimmer: string;
  einzug: Date;
  auszug: Date | null;
  status: string;
  /** Link zum Vertrags-PDF in der Ablage, wenn vorhanden */
  pdf: string | null;
};

export type ExportDatei = {
  /** Abruf ueber die Ablage, z. B. /api/ablage/Mietvertraege/2026/… */
  url: string;
  /** Pfad in der ZIP-Datei */
  zipPfad: string;
  groesse: number;
};

/** Dateinamen fuer Windows und Mac unbedenklich machen. */
function sauber(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Datei";
}

/**
 * Stand fuer den Export der Mietvertraege: wer bei den laufenden
 * Mietverhaeltnissen noch nicht unterschrieben hat, und welche Dateien
 * (unterschriebene Vertraege, Scans, Wohnungsgeberbestaetigungen) abgelegt
 * sind.
 */
export async function vertragsExportStand(heute = new Date()) {
  const [laufend, dokumente, beendet] = await Promise.all([
    prisma.tenancy.findMany({
      where: {
        tenant: { status: { not: "EHEMALIG" } },
        // Stornierte Vertraege sind nie angetreten worden - weder laufend noch ehemalig.
        status: { notIn: ["ENDED", "CANCELLED"] },
        OR: [{ endDate: null }, { endDate: { gte: heute } }],
      },
      include: {
        tenant: { select: { firstName: true, lastName: true, phone: true } },
        bed: { include: { room: { include: { property: { select: { name: true } } } } } },
        contract: { select: { id: true, status: true, sentAt: true, pdfUrl: true, documents: { select: { driveUrl: true }, take: 1 } } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.document.findMany({
      where: { kind: "CONTRACT", driveUrl: { not: null } },
      select: {
        driveUrl: true,
        fileName: true,
        sizeBytes: true,
        contract: { select: { tenancy: { select: { bed: { select: { room: { select: { property: { select: { name: true } } } } } } } } } },
        tenant: {
          select: {
            status: true,
            tenancies: {
              orderBy: { startDate: "desc" },
              take: 1,
              select: { bed: { select: { room: { select: { property: { select: { name: true } } } } } } },
            },
          },
        },
      },
      orderBy: { fileName: "asc" },
    }),
    // Nicht mehr aktiv: beendet, Auszug vorbei oder Mieter ausgezogen.
    prisma.tenancy.findMany({
      where: {
        status: { not: "CANCELLED" },
        OR: [{ status: "ENDED" }, { endDate: { lt: heute } }, { tenant: { status: "EHEMALIG" } }],
      },
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        bed: { include: { room: { include: { property: { select: { name: true } } } } } },
        contract: { select: { id: true, status: true, pdfUrl: true, documents: { select: { driveUrl: true }, take: 1 } } },
      },
      orderBy: [{ endDate: { sort: "desc", nulls: "last" } }, { startDate: "desc" }],
      take: 500,
    }),
  ]);

  const zeile = (t: (typeof beendet)[number] | (typeof laufend)[number]): VertragsZeile => ({
    tenancyId: t.id,
    contractId: t.contract?.id ?? null,
    mieter: `${t.tenant.firstName} ${t.tenant.lastName}`.trim(),
    objekt: t.bed.room.property.name,
    zimmer: t.bed.room.name,
    einzug: t.startDate,
    auszug: t.endDate,
    status: t.contract?.status ?? "KEIN",
    pdf: t.contract?.pdfUrl ?? t.contract?.documents[0]?.driveUrl ?? null,
  });
  const nachObjekt = (a: { objekt: string; mieter: string }, b: { objekt: string; mieter: string }) =>
    a.objekt.localeCompare(b.objekt, "de") || a.mieter.localeCompare(b.mieter, "de");
  const aktiv = laufend.filter((t) => t.contract?.status === "SIGNED").map(zeile).sort(nachObjekt);
  const nichtAktiv = beendet.map(zeile);

  const unterschrieben = laufend.filter((t) => t.contract?.status === "SIGNED").length;
  const fehlend: FehlenderVertrag[] = laufend
    .filter((t) => t.contract?.status !== "SIGNED")
    .map((t) => ({
      tenancyId: t.id,
      contractId: t.contract?.id ?? null,
      mieter: `${t.tenant.firstName} ${t.tenant.lastName}`.trim(),
      telefon: t.tenant.phone,
      objekt: t.bed.room.property.name,
      zimmer: t.bed.room.name,
      einzug: t.startDate,
      status: t.contract?.status ?? "KEIN",
      versendetAm: t.contract?.sentAt ?? null,
    }))
    .sort((a, b) => a.objekt.localeCompare(b.objekt, "de") || a.mieter.localeCompare(b.mieter, "de"));

  // Ordner je Objekt, Ausgezogene getrennt; doppelte Namen bekommen eine Nummer.
  const vergeben = new Set<string>();
  const dateien: ExportDatei[] = [];
  for (const d of dokumente) {
    if (!d.driveUrl?.startsWith("/api/ablage/")) continue;
    const objekt =
      d.contract?.tenancy.bed.room.property.name ?? d.tenant?.tenancies[0]?.bed.room.property.name ?? "Ohne Objekt";
    const ordner = d.tenant?.status === "EHEMALIG" ? `Ehemalige/${sauber(objekt)}` : sauber(objekt);
    const basis = sauber(d.fileName.replace(/\.pdf$/i, ""));
    let pfad = `Mietvertraege/${ordner}/${basis}.pdf`;
    for (let i = 2; vergeben.has(pfad.toLowerCase()); i += 1) pfad = `Mietvertraege/${ordner}/${basis} (${i}).pdf`;
    vergeben.add(pfad.toLowerCase());
    dateien.push({ url: d.driveUrl, zipPfad: pfad, groesse: d.sizeBytes });
  }

  return { laufend: laufend.length, unterschrieben, fehlend, aktiv, nichtAktiv, dateien };
}
