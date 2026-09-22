import Link from "next/link";

import { Badge, Card, EmptyState, Flash, Meter, PageHeader, Table, Td, Th } from "@/components/ui";
import { coversLandlordConfirmation } from "@/lib/pdf-template";
import { monthlyCostCents } from "@/components/cost-card";
import { ListenFilter } from "@/components/listenfilter";
import { prisma } from "@/lib/db";
import { occupancySummary } from "@/lib/tenancy";

import { requireAdmin } from "@/lib/auth";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Objekte") };
}
export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, geld } = await oberflaeche();
  await requireAdmin();
  const params = await searchParams;

  const properties = await prisma.property.findMany({
    include: {
      rooms: { include: { beds: { select: { id: true } } } },
      templates: { select: { kind: true } },
      costs: { select: { amountCents: true, interval: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const stats = await Promise.all(
    properties.map(async (property) => ({
      id: property.id,
      summary: await occupancySummary(property.id),
    })),
  );
  const statsById = new Map(stats.map((entry) => [entry.id, entry.summary]));

  return (
    <>
      <PageHeader
        title={t("Objekte")}
        description={t("Alle Unterkünfte mit Zimmern und Betten.")}
        actions={
          <Link href="/objekte/neu" className="btn btn-primary">
            {t("Neues Objekt")}
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <ListenFilter placeholder={t("Objekt, Adresse …")}>
      <Card padded={false}>
        {properties.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={t("Noch kein Objekt angelegt")}
              description={t("Ein Objekt ist eine Unterkunft mit Adresse. Darin legen Sie Zimmer und in den Zimmern die einzelnen Betten an.")}
              action={
                <Link href="/objekte/neu" className="btn btn-primary">
                  {t("Erstes Objekt anlegen")}
                </Link>
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Objekt")}</Th>
                <Th>{t("Adresse")}</Th>
                <Th align="center">{t("Zimmer")}</Th>
                <Th align="center">{t("Betten")}</Th>
                <Th>{t("Auslastung")}</Th>
                <Th align="right">{t("Miete / Monat")}</Th>
                <Th align="right">{t("Überschuss / Monat")}</Th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => {
                const summary = statsById.get(property.id);
                const bedCount = property.rooms.reduce((sum, room) => sum + room.beds.length, 0);

                return (
                  <tr
                    key={property.id}
                    className={property.active ? "hover:bg-ink-50" : "opacity-60 hover:bg-ink-50 hover:opacity-100"}
                  >
                    <Td>
                      <Link
                        href={`/objekte/${property.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {property.name}
                      </Link>
                      {!property.active && (
                        <span className="ml-2">
                          <Badge tone="neutral">{t("Inaktiv")}</Badge>
                        </span>
                      )}
                      {property.shortCode && (
                        <p className="text-xs text-ink-500">{t("Kürzel {code}", { code: property.shortCode })}</p>
                      )}
                      {property.active &&
                        !property.templates.some((t) => coversLandlordConfirmation(t.kind)) && (
                          <p className="mt-1">
                            <Badge tone="warning">{t("Wohnungsgeberbestätigung fehlt")}</Badge>
                          </p>
                        )}
                    </Td>
                    <Td className="text-ink-600">
                      {property.street}
                      <br />
                      <span className="text-xs text-ink-500">
                        {property.zip} {property.city}
                      </span>
                    </Td>
                    <Td align="center" className="tabular-nums">
                      {property.rooms.length}
                    </Td>
                    <Td align="center" className="tabular-nums">
                      {bedCount}
                    </Td>
                    <Td>
                      <div className="w-40">
                        <Meter
                          value={summary?.rate ?? 0}
                          tone={
                            (summary?.rate ?? 0) >= 0.8
                              ? "success"
                              : (summary?.rate ?? 0) >= 0.5
                                ? "warning"
                                : "danger"
                          }
                        />
                        <p className="mt-1 text-xs text-ink-500">
                          {t("{belegt} belegt · {frei} frei", { belegt: summary?.occupied ?? 0, frei: summary?.free ?? 0 })}
                        </p>
                      </div>
                    </Td>
                    <Td align="right" className="font-semibold tabular-nums">
                      {geld(summary?.actualRentCents ?? 0)}
                      <p className="text-xs font-normal text-ink-500">
                        max. {geld(summary?.potentialRentCents ?? 0)}
                      </p>
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {property.costs.length === 0 ? (
                        <span className="text-xs text-ink-500">{t("Kosten fehlen")}</span>
                      ) : (
                        (() => {
                          const kosten = monthlyCostCents(property.costs);
                          const plus = (summary?.actualRentCents ?? 0) - kosten;
                          return (
                            <>
                              <span className={`font-semibold ${plus >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {geld(plus)}
                              </span>
                              <p className="text-xs font-normal text-ink-500">
                                Kosten {geld(kosten)}
                              </p>
                            </>
                          );
                        })()
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      </ListenFilter>
    </>
  );
}
