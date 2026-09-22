import Link from "next/link";

import { Badge, Card, EmptyState, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { TenancyBadge } from "@/components/status";
import { SuchFeld } from "@/components/suchfeld";
import { prisma } from "@/lib/db";

import { requireAdmin } from "@/lib/auth";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Mieter") };
}
export const dynamic = "force-dynamic";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; q?: string; status?: string }>;
}) {
  const { t, datum, geld } = await oberflaeche();
  await requireAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const statusFilter = params.status ?? "";

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { company: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
      // Ehemalige Mieter bleiben erhalten, stehen aber nicht mehr im Weg -
      // sie erscheinen nur, wenn ausdrücklich danach gefiltert wird.
      ...(statusFilter === "EHEMALIG"
        ? { status: "EHEMALIG" }
        : statusFilter
          ? { status: { not: "EHEMALIG" }, tenancies: { some: { status: statusFilter } } }
          : { status: { not: "EHEMALIG" } }),
    },
    include: {
      tenancies: {
        include: {
          bed: { include: { room: { include: { property: true } } } },
          contract: { select: { id: true, status: true } },
        },
        orderBy: { startDate: "desc" },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title={t("Mieter")}
        description={t("Monteure und Mitarbeiter mit ihren Mietverhältnissen.")}
        actions={
          <>
            <Link href="/mieter/kontakte" className="btn btn-secondary">
              {t("Kontakte")}
            </Link>
            <Link href="/mieter/neu" className="btn btn-primary">
              {t("Neuer Mieter")}
            </Link>
          </>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <Card padded={false}>
        <form className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="q">{t("Suche")}</label>
            <SuchFeld defaultValue={query} placeholder={t("Name, E-Mail oder Firma")} />
          </div>
          <div className="w-48">
            <label htmlFor="status">{t("Status")}</label>
            <select id="status" name="status" defaultValue={statusFilter}>
              <option value="">{t("Alle außer ehemaligen")}</option>
              <option value="ACTIVE">{t("Aktiv")}</option>
              <option value="SENT">{t("Vertrag versendet")}</option>
              <option value="DRAFT">{t("Entwurf")}</option>
              <option value="ENDED">{t("Beendet")}</option>
              <option value="EHEMALIG">{t("Nur ehemalige Mieter")}</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            {t("Filtern")}
          </button>
          {(query || statusFilter) && (
            <Link href="/mieter" className="btn btn-ghost">
              {t("Zurücksetzen")}
            </Link>
          )}
        </form>

        {tenants.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={query || statusFilter ? t("Keine Treffer") : t("Noch keine Mieter")}
              description={
                query || statusFilter
                  ? t("Passen Sie Suche oder Filter an.")
                  : t("Legen Sie einen Mieter an und weisen Sie ihm direkt ein Bett zu. Anschließend erhält er den Vertragslink.")
              }
              action={
                <Link href="/mieter/neu" className="btn btn-primary">
                  {t("Mieter anlegen")}
                </Link>
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Name")}</Th>
                <Th>{t("Kontakt")}</Th>
                <Th>{t("Firma")}</Th>
                <Th>{t("Unterkunft")}</Th>
                <Th>{t("Zeitraum")}</Th>
                <Th align="right">{t("Miete")}</Th>
                <Th>{t("Mietvertrag")}</Th>
                <Th align="right">{t("Status")}</Th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                // Das relevanteste Mietverhältnis: laufend, sonst das jüngste.
                const current =
                  tenant.tenancies.find((t) => t.status === "ACTIVE") ??
                  tenant.tenancies.find((t) => t.status === "SENT") ??
                  tenant.tenancies[0];

                return (
                  <tr key={tenant.id} className="hover:bg-ink-50">
                    <Td>
                      <Link
                        href={`/mieter/${tenant.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {tenant.lastName}, {tenant.firstName}
                      </Link>
                      {tenant.status === "EHEMALIG" && (
                        <span className="ml-2">
                          <Badge tone="neutral">{t("Ehemalig")}</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-ink-600">
                      <a href={`mailto:${tenant.email}`} className="hover:text-brand-700">
                        {tenant.email}
                      </a>
                      {tenant.phone && <p className="text-xs text-ink-500">{tenant.phone}</p>}
                    </Td>
                    <Td className="text-ink-600">{tenant.company ?? "–"}</Td>
                    <Td className="text-ink-600">
                      {current ? (
                        <>
                          {current.bed.room.property.name}
                          <p className="text-xs text-ink-500">
                            {current.bed.room.name} · {current.bed.label}
                          </p>
                        </>
                      ) : (
                        <span className="text-ink-500">{t("nicht zugewiesen")}</span>
                      )}
                    </Td>
                    <Td className="text-ink-600">
                      {current ? (
                        <>
                          {datum(current.startDate)}
                          <p className="text-xs text-ink-500">
                            {current.endDate ? `bis ${datum(current.endDate)}` : "unbefristet"}
                          </p>
                        </>
                      ) : (
                        "–"
                      )}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {current ? geld(current.monthlyRentCents) : "–"}
                    </Td>
                    <Td>
                      {!current ? (
                        <span className="text-ink-500">–</span>
                      ) : current.contract ? (
                        <Link
                          href={`/vertraege/${current.contract.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {t("vorhanden")}
                        </Link>
                      ) : (
                        <Badge tone="danger">{t("Vertrag fehlt")}</Badge>
                      )}
                    </Td>
                    <Td align="right">
                      {current ? <TenancyBadge status={current.status} /> : <span className="text-ink-500">–</span>}
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
