import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { prisma } from "@/lib/db";
import { occupancySummary, OCCUPYING_STATUSES } from "@/lib/tenancy";
import { formatCents } from "@/lib/money";
import { addMonths, daysBetween, formatDate } from "@/lib/dates";

export const metadata = { title: "Belegungsplan" };
export const dynamic = "force-dynamic";

const WINDOW_MONTHS = 3;

export default async function OccupancyPage({
  searchParams,
}: {
  searchParams: Promise<{ objekt?: string }>;
}) {
  const { objekt } = await searchParams;

  const today = new Date();
  const windowStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const windowEnd = addMonths(windowStart, WINDOW_MONTHS);
  const totalDays = Math.max(1, daysBetween(windowStart, windowEnd));

  const [properties, summary] = await Promise.all([
    prisma.property.findMany({
      where: { active: true, ...(objekt ? { id: objekt } : {}) },
      include: {
        rooms: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            beds: {
              orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
              include: {
                tenancies: {
                  where: {
                    status: { in: [...OCCUPYING_STATUSES] },
                    OR: [{ endDate: null }, { endDate: { gte: windowStart } }],
                    startDate: { lte: windowEnd },
                  },
                  include: { tenant: { select: { id: true, firstName: true, lastName: true } } },
                  orderBy: { startDate: "asc" },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    occupancySummary(objekt),
  ]);

  const allProperties = await prisma.property.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Monatsraster für die Kopfzeile der Zeitleiste
  const months = Array.from({ length: WINDOW_MONTHS }, (_, index) => {
    const start = addMonths(windowStart, index);
    const end = addMonths(windowStart, index + 1);
    return {
      key: `${start.getUTCFullYear()}-${start.getUTCMonth() + 1}`,
      label: new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(start),
      widthPercent: (daysBetween(start, end) / totalDays) * 100,
    };
  });

  const todayPercent = Math.max(0, Math.min(100, (daysBetween(windowStart, today) / totalDays) * 100));

  return (
    <>
      <PageHeader
        title="Belegungsplan"
        description={`Zeitraum ${formatDate(windowStart)} bis ${formatDate(windowEnd)}`}
        actions={
          <form className="flex items-center gap-2">
            <select name="objekt" defaultValue={objekt ?? ""} className="min-w-48">
              <option value="">Alle Objekte</option>
              {allProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary">
              Anzeigen
            </button>
          </form>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Betten gesamt" value={String(summary.beds)} />
        <StatCard label="Belegt" value={String(summary.occupied)} tone="brand" />
        <StatCard
          label="Frei"
          value={String(summary.free)}
          tone={summary.free > 0 ? "success" : "neutral"}
          hint={summary.blocked > 0 ? `${summary.blocked} gesperrt` : undefined}
        />
        <StatCard
          label="Miete pro Monat"
          value={formatCents(summary.actualRentCents)}
          hint={`von möglichen ${formatCents(summary.potentialRentCents)}`}
        />
      </div>

      <div className="mt-6 space-y-6">
        {properties.length === 0 && (
          <EmptyState
            title="Keine Objekte vorhanden"
            description="Legen Sie zuerst ein Objekt mit Zimmern und Betten an."
            action={
              <Link href="/objekte/neu" className="btn btn-primary">
                Objekt anlegen
              </Link>
            }
          />
        )}

        {properties.map((property) => {
          const bedCount = property.rooms.reduce((sum, room) => sum + room.beds.length, 0);

          return (
            <Card
              key={property.id}
              title={property.name}
              description={`${property.street}, ${property.zip} ${property.city} · ${property.rooms.length} Zimmer, ${bedCount} Betten`}
              actions={
                <Link href={`/objekte/${property.id}`} className="btn btn-ghost">
                  Objekt öffnen
                </Link>
              }
              padded={false}
            >
              {bedCount === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-500">
                  Für dieses Objekt sind noch keine Betten angelegt.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[46rem] px-5 py-4">
                    {/* Kopfzeile mit Monaten */}
                    <div className="flex items-stretch border-b border-ink-200 pb-1.5">
                      <div className="w-52 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Zimmer / Bett
                      </div>
                      <div className="flex flex-1">
                        {months.map((month) => (
                          <div
                            key={month.key}
                            style={{ width: `${month.widthPercent}%` }}
                            className="border-l border-ink-200 pl-2 text-xs font-semibold text-ink-500"
                          >
                            {month.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {property.rooms.map((room) => (
                      <div key={room.id}>
                        <p className="mt-3 mb-1 text-xs font-semibold text-ink-700">
                          {room.name}
                          {room.floor ? <span className="text-ink-400"> · {room.floor}</span> : null}
                        </p>

                        {room.beds.map((bed) => (
                          <div key={bed.id} className="flex items-center py-1">
                            <div className="flex w-52 shrink-0 items-center gap-2 pr-3">
                              <span className="truncate text-sm text-ink-700">{bed.label}</span>
                              <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-400">
                                {formatCents(bed.monthlyRentCents)}
                              </span>
                            </div>

                            <div className="relative h-7 flex-1 rounded bg-ink-100">
                              {/* Monatsraster */}
                              <div className="absolute inset-0 flex">
                                {months.map((month) => (
                                  <div
                                    key={month.key}
                                    style={{ width: `${month.widthPercent}%` }}
                                    className="border-l border-white/80"
                                  />
                                ))}
                              </div>

                              {bed.status === "BLOCKED" && (
                                <div className="absolute inset-0 flex items-center justify-center rounded bg-rose-100 text-[0.7rem] font-semibold text-rose-700">
                                  gesperrt
                                </div>
                              )}

                              {bed.tenancies.map((tenancy) => {
                                const start = tenancy.startDate > windowStart ? tenancy.startDate : windowStart;
                                const end =
                                  tenancy.endDate && tenancy.endDate < windowEnd
                                    ? tenancy.endDate
                                    : windowEnd;
                                const left = (daysBetween(windowStart, start) / totalDays) * 100;
                                const width = Math.max(
                                  2,
                                  (daysBetween(start, end) / totalDays) * 100,
                                );

                                return (
                                  <Link
                                    key={tenancy.id}
                                    href={`/mieter/${tenancy.tenantId}`}
                                    style={{ left: `${left}%`, width: `${width}%` }}
                                    title={`${tenancy.tenant.firstName} ${tenancy.tenant.lastName} · ${formatDate(
                                      tenancy.startDate,
                                    )} – ${tenancy.endDate ? formatDate(tenancy.endDate) : "unbefristet"}`}
                                    className={`absolute inset-y-0.5 flex items-center overflow-hidden rounded px-2 text-[0.7rem] font-semibold text-white transition hover:brightness-110 ${
                                      tenancy.status === "ACTIVE" ? "bg-brand-600" : "bg-sky-500"
                                    }`}
                                  >
                                    <span className="truncate">
                                      {tenancy.tenant.firstName} {tenancy.tenant.lastName}
                                    </span>
                                  </Link>
                                );
                              })}

                              {/* Heute-Markierung */}
                              <div
                                className="absolute inset-y-0 w-px bg-ink-900/50"
                                style={{ left: `${todayPercent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-500">
        <Badge tone="brand">Aktives Mietverhältnis</Badge>
        <Badge tone="info">Vertrag versendet</Badge>
        <Badge tone="danger">Bett gesperrt</Badge>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-ink-900/60" /> heute
        </span>
      </div>
    </>
  );
}
