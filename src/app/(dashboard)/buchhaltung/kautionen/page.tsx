import Link from "next/link";

import { generateCharges, markChargePaid, reopenCharge, runAutoMatch } from "@/app/actions/accounting";
import { AdminOnly } from "@/components/admin-only";
import { TenancyBadge } from "@/components/status";
import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Kautionen") };
}
export const dynamic = "force-dynamic";

const ANSICHTEN = ["offen", "bezahlt", "alle"] as const;
type Ansicht = (typeof ANSICHTEN)[number];

/**
 * Kautionszahlungen - einmal je Mietverhaeltnis, deshalb ohne Monatswahl.
 *
 * Die Mieteingaenge zeigen die Kaution nur im Einzugsmonat, danach ist sie
 * aus dem Blick. Hier stehen alle Kautionen nebeneinander: was eingegangen
 * ist, was noch fehlt, und bei wem. Abhaken und Zuruecknehmen laufen ueber
 * dieselben Aktionen wie bei der Miete.
 */
export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; ansicht?: string }>;
}) {
  const { t, datum, geld } = await oberflaeche();
  const params = await searchParams;
  const ansicht: Ansicht = ANSICHTEN.includes(params.ansicht as Ansicht)
    ? (params.ansicht as Ansicht)
    : "offen";
  const back = `/buchhaltung/kautionen${ansicht === "offen" ? "" : `?ansicht=${ansicht}`}`;

  const [charges, ohneForderung] = await Promise.all([
    prisma.rentCharge.findMany({
      where: { kind: "DEPOSIT" },
      include: {
        allocations: {
          include: { bankTransaction: { select: { bookingDate: true, counterpartyName: true } } },
        },
        tenancy: {
          include: {
            tenant: true,
            bed: { include: { room: { include: { property: true } } } },
          },
        },
      },
    }),
    // Kaution vereinbart, aber noch keine Forderung erzeugt - das passiert
    // erst beim naechsten Lauf von "Forderungen erzeugen".
    prisma.tenancy.count({
      where: {
        depositCents: { gt: 0 },
        status: { in: ["SENT", "ACTIVE", "ENDED"] },
        charges: { none: { kind: "DEPOSIT" } },
      },
    }),
  ]);

  const eingegangenVon = (charge: (typeof charges)[number]): number => {
    if (charge.status === "PAID") return charge.amountCents;
    return Math.min(
      charge.amountCents,
      charge.allocations.reduce((sum, a) => sum + a.amountCents, 0),
    );
  };

  const relevante = charges.filter((c) => c.status !== "WAIVED");
  const sollGesamt = relevante.reduce((sum, c) => sum + c.amountCents, 0);
  const eingegangen = relevante.reduce((sum, c) => sum + eingegangenVon(c), 0);
  const offen = sollGesamt - eingegangen;
  const offeneAnzahl = relevante.filter((c) => c.status !== "PAID").length;

  const gezeigt = charges.filter((c) => {
    if (ansicht === "alle") return true;
    if (ansicht === "bezahlt") return c.status === "PAID";
    return c.status === "OPEN" || c.status === "PARTIAL";
  });

  gezeigt.sort((a, b) => {
    const pa = a.tenancy.bed.room.property.name;
    const pb = b.tenancy.bed.room.property.name;
    if (pa !== pb) return pa.localeCompare(pb, "de");
    // Der juengste Einzug zuerst - dort fehlt die Kaution am ehesten noch.
    return b.tenancy.startDate.getTime() - a.tenancy.startDate.getTime();
  });

  const gruppen = new Map<string, { name: string; charges: typeof gezeigt }>();
  for (const charge of gezeigt) {
    const property = charge.tenancy.bed.room.property;
    const gruppe = gruppen.get(property.id) ?? { name: property.name, charges: [] };
    gruppe.charges.push(charge);
    gruppen.set(property.id, gruppe);
  }

  const chips: Array<{ wert: Ansicht; label: string; zahl: number }> = [
    { wert: "offen", label: t("Offen"), zahl: offeneAnzahl },
    { wert: "bezahlt", label: t("Eingegangen"), zahl: relevante.length - offeneAnzahl },
    { wert: "alle", label: t("Alle"), zahl: charges.length },
  ];

  return (
    <>
      <PageHeader
        title={t("Kautionen")}
        description={t("Einmalig zum Einzug fällig. Hier steht, welche Kaution eingegangen ist und welche noch fehlt.")}
        breadcrumb={[{ label: t("Buchhaltung"), href: "/buchhaltung" }, { label: t("Kautionen") }]}
        actions={
          <>
            <Link href="/buchhaltung/mieteingaenge" className="btn btn-ghost">
              {t("Mieteingänge")}
            </Link>
            <AdminOnly>
              <form action={runAutoMatch}>
                <input type="hidden" name="back" value={back} />
                <button type="submit" className="btn btn-secondary">
                  {t("Zahlungen automatisch zuordnen")}
                </button>
              </form>
            </AdminOnly>
          </>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={t("Kautionen gesamt")} value={geld(sollGesamt)} hint={t("{anzahl} Mietverhältnisse", { anzahl: relevante.length })} />
        <StatCard label={t("Eingegangen")} value={geld(eingegangen)} tone="success" />
        <StatCard
          label={t("Noch offen")}
          value={geld(offen)}
          hint={t("{anzahl} Kaution(en) fehlen", { anzahl: offeneAnzahl })}
          tone={offen > 0 ? "warning" : "success"}
        />
        <StatCard
          label={t("Ohne Forderung")}
          value={String(ohneForderung)}
          hint={t("Kaution vereinbart, Forderung noch nicht erzeugt")}
          tone={ohneForderung > 0 ? "warning" : "neutral"}
        />
      </div>

      {ohneForderung > 0 && (
        <AdminOnly>
          <form action={generateCharges} className="mt-4">
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="btn btn-secondary">
              {t("Forderungen erzeugen")}
            </button>
          </form>
        </AdminOnly>
      )}

      <div className="scroll-schatten -mx-1 mb-5 mt-6 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((chip) => {
          const aktiv = ansicht === chip.wert;
          return (
            <Link
              key={chip.wert}
              href={chip.wert === "offen" ? "/buchhaltung/kautionen" : `/buchhaltung/kautionen?ansicht=${chip.wert}`}
              aria-current={aktiv ? "page" : undefined}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.8rem] font-medium transition-colors ${
                aktiv
                  ? "bg-brand-700 text-white"
                  : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:text-brand-700"
              }`}
            >
              {chip.label}
              <span className={aktiv ? "text-white/70 tabular-nums" : "text-ink-400 tabular-nums"}>
                {chip.zahl}
              </span>
            </Link>
          );
        })}
      </div>

      {gezeigt.length === 0 ? (
        <Card>
          <EmptyState
            title={ansicht === "offen" ? t("Alle Kautionen sind eingegangen.") : t("Keine Kautionen")}
            description={t("Eine Kautionsforderung entsteht mit „Forderungen erzeugen“ für jedes Mietverhältnis, in dem eine Kaution vereinbart ist.")}
          />
        </Card>
      ) : (
        Array.from(gruppen.values()).map((gruppe) => (
          <div key={gruppe.name} className="mb-6">
            <Card title={gruppe.name} padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-12">{t("Bezahlt")}</Th>
                    <Th>{t("Mieter")}</Th>
                    <Th>{t("Unterkunft")}</Th>
                    <Th>{t("Einzug")}</Th>
                    <Th align="right">{t("Kaution")}</Th>
                    <Th>{t("Eingang")}</Th>
                    <Th align="right">{t("Aktion")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {gruppe.charges.map((charge) => {
                    const chargeOffen = charge.amountCents - eingegangenVon(charge);
                    const istBezahlt = charge.status === "PAID";
                    const istErlassen = charge.status === "WAIVED";
                    const perKonto = charge.allocations.length > 0;
                    return (
                      <tr key={charge.id} className={istBezahlt ? "bg-emerald-50/50" : "hover:bg-ink-50"}>
                        <Td>
                          <span
                            aria-hidden
                            className={`grid h-6 w-6 place-items-center rounded-md border-2 text-sm font-bold ${
                              istBezahlt
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : istErlassen
                                  ? "border-ink-300 bg-ink-100 text-ink-400"
                                  : "border-ink-300 bg-white text-transparent"
                            }`}
                          >
                            {istErlassen ? "–" : "✓"}
                          </span>
                        </Td>
                        <Td>
                          <Link href={`/mieter/${charge.tenancy.tenantId}`} className="font-medium hover:text-brand-700">
                            {charge.tenancy.tenant.firstName} {charge.tenancy.tenant.lastName}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <TenancyBadge status={charge.tenancy.status} />
                            {istErlassen && <Badge tone="neutral">{t("Erlassen")}</Badge>}
                          </div>
                        </Td>
                        <Td className="text-ink-600">
                          {charge.tenancy.bed.room.name} · {charge.tenancy.bed.label}
                        </Td>
                        <Td className="whitespace-nowrap text-ink-600">{datum(charge.tenancy.startDate)}</Td>
                        <Td align="right" className="tabular-nums">
                          {geld(charge.amountCents)}
                          {!istBezahlt && !istErlassen && chargeOffen < charge.amountCents && (
                            <p className="text-xs text-amber-600">
                              {t("noch {betrag} offen", { betrag: geld(chargeOffen) })}
                            </p>
                          )}
                        </Td>
                        <Td className="text-xs text-ink-600">
                          {perKonto ? (
                            charge.allocations.map((a) => (
                              <p key={a.id}>
                                {datum(a.bankTransaction.bookingDate)} · {geld(a.amountCents)}
                              </p>
                            ))
                          ) : istBezahlt ? (
                            <span>{t("von Hand abgehakt")}</span>
                          ) : (
                            <span className="text-ink-400">–</span>
                          )}
                        </Td>
                        <Td align="right">
                          <AdminOnly>
                            {!istBezahlt && !istErlassen && (
                              <form action={markChargePaid}>
                                <input type="hidden" name="id" value={charge.id} />
                                <input type="hidden" name="back" value={back} />
                                <button
                                  type="submit"
                                  className="btn btn-secondary btn-sm"
                                  title={t("Eingang im Online-Banking gesehen – als bezahlt abhaken")}
                                >
                                  {t("✓ Abhaken")}
                                </button>
                              </form>
                            )}
                            {istBezahlt && !perKonto && (
                              <form action={reopenCharge}>
                                <input type="hidden" name="id" value={charge.id} />
                                <input type="hidden" name="back" value={back} />
                                <button type="submit" className="btn btn-ghost btn-sm" title={t("Haken zurücknehmen")}>
                                  {t("Rückgängig")}
                                </button>
                              </form>
                            )}
                          </AdminOnly>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          </div>
        ))
      )}
    </>
  );
}
