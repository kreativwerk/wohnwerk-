import Link from "next/link";

import { Badge, Card, EmptyState, Flash, Meter, PageHeader, Table, Td, Th } from "@/components/ui";
import { coversLandlordConfirmation } from "@/lib/pdf-template";
import { prisma } from "@/lib/db";
import { occupancySummary } from "@/lib/tenancy";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Objekte" };
export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const params = await searchParams;

  const properties = await prisma.property.findMany({
    include: {
      rooms: { include: { beds: { select: { id: true } } } },
      templates: { select: { kind: true } },
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
        title="Objekte"
        description="Alle Unterkünfte mit Zimmern und Betten."
        actions={
          <Link href="/objekte/neu" className="btn btn-primary">
            Neues Objekt
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <Card padded={false}>
        {properties.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Noch kein Objekt angelegt"
              description="Ein Objekt ist eine Unterkunft mit Adresse. Darin legen Sie Zimmer und in den Zimmern die einzelnen Betten an."
              action={
                <Link href="/objekte/neu" className="btn btn-primary">
                  Erstes Objekt anlegen
                </Link>
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Objekt</Th>
                <Th>Adresse</Th>
                <Th align="center">Zimmer</Th>
                <Th align="center">Betten</Th>
                <Th>Auslastung</Th>
                <Th align="right">Miete / Monat</Th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => {
                const summary = statsById.get(property.id);
                const bedCount = property.rooms.reduce((sum, room) => sum + room.beds.length, 0);

                return (
                  <tr key={property.id} className="hover:bg-ink-50">
                    <Td>
                      <Link
                        href={`/objekte/${property.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {property.name}
                      </Link>
                      {!property.active && (
                        <span className="ml-2 text-xs text-ink-500">(inaktiv)</span>
                      )}
                      {property.shortCode && (
                        <p className="text-xs text-ink-500">Kürzel {property.shortCode}</p>
                      )}
                      {!property.templates.some((t) => coversLandlordConfirmation(t.kind)) && (
                        <p className="mt-1">
                          <Badge tone="warning">Wohnungsgeberbestätigung fehlt</Badge>
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
                          {summary?.occupied ?? 0} belegt · {summary?.free ?? 0} frei
                        </p>
                      </div>
                    </Td>
                    <Td align="right" className="font-semibold tabular-nums">
                      {formatCents(summary?.actualRentCents ?? 0)}
                      <p className="text-xs font-normal text-ink-500">
                        max. {formatCents(summary?.potentialRentCents ?? 0)}
                      </p>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
