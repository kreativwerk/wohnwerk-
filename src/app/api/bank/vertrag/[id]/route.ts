import { getSessionUser, isAdmin, istBank } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";

/**
 * Vertrags-PDF fuer den Bank-Zugang: nur unterschriebene Vertraege laufender
 * Mietverhaeltnisse, nur fuer Bank oder Verwaltung. Jeder Abruf wird im
 * Protokoll festgehalten.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });
  if (!istBank(user) && !isAdmin(user)) return new Response("Keine Berechtigung", { status: 403 });

  const { id } = await context.params;
  const heute = new Date();
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      tenancy: { include: { tenant: { select: { firstName: true, lastName: true, status: true } } } },
      documents: { where: { kind: "CONTRACT" }, select: { driveUrl: true, title: true }, orderBy: { uploadedAt: "desc" } },
    },
  });
  const t = contract?.tenancy;
  const aktiv =
    contract?.status === "SIGNED" &&
    t &&
    !["ENDED", "CANCELLED"].includes(t.status) &&
    t.tenant.status !== "EHEMALIG" &&
    (!t.endDate || t.endDate >= heute);
  if (!contract || !aktiv) return new Response("Nicht verfügbar", { status: 404 });

  const url =
    contract.pdfUrl ??
    contract.documents.find((d) => d.title.startsWith("Mietvertrag"))?.driveUrl ??
    null;
  if (!url?.startsWith("/api/ablage/")) return new Response("Keine Datei", { status: 404 });
  const pfad = url.slice("/api/ablage/".length).split("/").map(decodeURIComponent).join("/");
  const datei = await readStoredFile(pfad);
  if (!datei) return new Response("Keine Datei", { status: 404 });

  if (istBank(user)) await audit(user.email, "bank-download", "Contract", contract.id, contract.contractNumber);

  const name = `${contract.contractNumber} ${t!.tenant.firstName} ${t!.tenant.lastName}`.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return new Response(new Uint8Array(datei.data), {
    headers: {
      "content-type": datei.contentType,
      "content-disposition": `inline; filename="${encodeURIComponent(name)}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
      "cache-control": "private, no-store",
    },
  });
}
