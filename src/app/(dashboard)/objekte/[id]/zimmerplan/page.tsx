import Link from "next/link";
import { notFound } from "next/navigation";

import { Zimmerplan, type PlanStockwerk, type PlanWartender } from "@/components/zimmerplan";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { oberflaeche } from "@/lib/i18n";
import { OHNE_STOCKWERK, sortiereStockwerke } from "@/lib/stockwerk";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await oberflaeche();
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id }, select: { name: true } });
  return { title: property ? `${t("Zimmerplan")} · ${property.name}` : t("Zimmerplan") };
}

/** Heute, 00:00 UTC des deutschen Kalendertags. */
function heute(): Date {
  const teile = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${teile}T00:00:00Z`);
}

const BEWOHNT = ["DRAFT", "SENT", "ACTIVE"];

/**
 * Der Zimmerplan eines Objekts: Stockwerke untereinander, Zimmer
 * nebeneinander, in jedem Zimmer die Betten mit den Personen darauf.
 * Rechts, wer noch kein Bett hat. Verschieben per Ziehen oder Antippen.
 */
export default async function ZimmerplanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { t, datum } = await oberflaeche();
  const { id } = await params;
  const jetzt = heute();

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      rooms: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          beds: {
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            include: {
              tenancies: {
                // Laufend, oder beendet mit Auszug in der Zukunft - wer am 24.
                // geht, wohnt am 22. noch hier. Heute Beendete stehen rechts.
                where: {
                  OR: [
                    { status: { in: BEWOHNT }, OR: [{ endDate: null }, { endDate: { gte: jetzt } }] },
                    { status: "ENDED", endDate: { gt: jetzt } },
                  ],
                },
                include: { tenant: { select: { id: true, firstName: true, lastName: true } } },
                orderBy: { startDate: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!property) notFound();

  // Wer hat gerade kein Bett? Ueber alle Objekte - ein Fahrer kann in
  // jedes Haus ziehen. Wer heute herausgenommen wurde, steht mit Hinweis
  // dabei: Wieder einsetzen laesst das Mietverhaeltnis weiterlaufen.
  const alleAktiven = await prisma.tenant.findMany({
    where: { status: "AKTIV" },
    include: {
      tenancies: {
        orderBy: { startDate: "desc" },
        take: 3,
        include: { bed: { include: { room: { select: { name: true } } } } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const ohneBett: PlanWartender[] = alleAktiven
    .filter(
      (tenant) =>
        !tenant.tenancies.some(
          (ty) =>
            (BEWOHNT.includes(ty.status) && (!ty.endDate || ty.endDate >= jetzt)) ||
            (ty.status === "ENDED" && ty.endDate && ty.endDate > jetzt),
        ),
    )
    .map((tenant) => {
      const letzte = tenant.tenancies.find((ty) => ty.status === "ENDED");
      let hinweis: string | null = t("noch nie zugewiesen");
      if (letzte?.endDate && letzte.endDate.getTime() === jetzt.getTime()) {
        hinweis = t("heute aus {bett} genommen", { bett: `${letzte.bed.room.name} · ${letzte.bed.label}` });
      } else if (letzte?.endDate) {
        hinweis = t("bis {datum} in {bett}", { datum: datum(letzte.endDate), bett: `${letzte.bed.room.name} · ${letzte.bed.label}` });
      }
      return { tenantId: tenant.id, name: `${tenant.firstName} ${tenant.lastName}`.trim(), hinweis };
    });

  // Zimmer nach Stockwerk gruppieren, Stockwerke in Hausreihenfolge.
  const gruppen = new Map<string, typeof property.rooms>();
  for (const room of property.rooms) {
    const key = room.floor?.trim() || OHNE_STOCKWERK;
    gruppen.set(key, [...(gruppen.get(key) ?? []), room]);
  }
  const stockwerke: PlanStockwerk[] = sortiereStockwerke(Array.from(gruppen.keys())).map((key) => ({
    name: key === OHNE_STOCKWERK ? t("Ohne Stockwerk") : key,
    ohneAngabe: key === OHNE_STOCKWERK,
    zimmer: (gruppen.get(key) ?? []).map((room) => ({
      id: room.id,
      name: room.name,
      betten: room.beds.map((bed) => {
        const ty = bed.tenancies[0];
        return {
          id: bed.id,
          label: bed.label,
          gesperrt: bed.status === "BLOCKED",
          bewohner: ty
            ? {
                tenantId: ty.tenant.id,
                tenancyId: ty.id,
                name: `${ty.tenant.firstName} ${ty.tenant.lastName}`.trim(),
                status: ty.status,
                seit: datum(ty.startDate),
                bis: ty.endDate ? datum(ty.endDate) : null,
                kuenftig: ty.startDate > jetzt,
              }
            : null,
        };
      }),
    })),
  }));

  const betten = property.rooms.flatMap((r) => r.beds);
  const belegt = betten.filter((b) => b.tenancies.length > 0).length;
  const gesperrt = betten.filter((b) => b.status === "BLOCKED" && b.tenancies.length === 0).length;

  return (
    <>
      <PageHeader
        title={t("Zimmerplan")}
        description={t("{belegt} belegt · {frei} frei · {gesamt} Betten gesamt", { belegt, frei: betten.length - belegt - gesperrt, gesamt: betten.length })}
        breadcrumb={[
          { label: t("Objekte"), href: "/objekte" },
          { label: property.name, href: `/objekte/${property.id}` },
          { label: t("Zimmerplan") },
        ]}
        actions={
          <>
            <Link href={`/objekte/${property.id}`} className="btn btn-ghost">
              {t("Zimmer und Betten bearbeiten")}
            </Link>
            <Link href={`/belegung?objekt=${property.id}`} className="btn btn-secondary">
              {t("Belegungsplan")}
            </Link>
          </>
        }
      />

      <Zimmerplan objektId={property.id} objektName={property.name} stockwerke={stockwerke} ohneBett={ohneBett} />
    </>
  );
}
