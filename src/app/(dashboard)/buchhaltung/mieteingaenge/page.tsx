import Link from "next/link";

import { generateCharges, markChargePaid, reopenCharge, runAutoMatch } from "@/app/actions/accounting";
import { AdminOnly } from "@/components/admin-only";
import { Badge, Card, EmptyState, Flash, Meter, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate, formatMonth } from "@/lib/dates";

export const metadata = { title: "Mieteingänge" };
export const dynamic = "force-dynamic";

/** "2026-08" → { year, month }; alles Unlesbare fällt auf den aktuellen Monat zurück. */
function parseMonat(raw: string | undefined): { year: number; month: number } {
  const treffer = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (treffer) {
    const year = Number(treffer[1]);
    const month = Number(treffer[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  const heute = new Date();
  return { year: heute.getFullYear(), month: heute.getMonth() + 1 };
}

function monatsWert(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function verschiebe(year: number, month: number, um: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + um;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export default async function RentIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; monat?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonat(params.monat);
  const back = `/buchhaltung/mieteingaenge?monat=${monatsWert(year, month)}`;

  const zurueck = verschiebe(year, month, -1);
  const vor = verschiebe(year, month, 1);
  const heute = new Date();
  const istAktuellerMonat = year === heute.getFullYear() && month === heute.getMonth() + 1;

  const charges = await prisma.rentCharge.findMany({
    where: { periodYear: year, periodMonth: month },
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
  });

  charges.sort((a, b) => {
    const pa = a.tenancy.bed.room.property.name;
    const pb = b.tenancy.bed.room.property.name;
    if (pa !== pb) return pa.localeCompare(pb, "de");
    const ra = a.tenancy.bed.room.name;
    const rb = b.tenancy.bed.room.name;
    if (ra !== rb) return ra.localeCompare(rb, "de", { numeric: true });
    if (a.tenancy.bed.label !== b.tenancy.bed.label)
      return a.tenancy.bed.label.localeCompare(b.tenancy.bed.label, "de", { numeric: true });
    // Miete vor Kaution
    return a.kind.localeCompare(b.kind);
  });

  // Was zaehlt als eingegangen: bezahlte Forderungen voll, sonst die zugeordneten Eingänge.
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
  const bezahltAnzahl = relevante.filter((c) => c.status === "PAID").length;

  // Nach Objekt gruppieren
  const gruppen = new Map<string, { name: string; charges: typeof charges }>();
  for (const charge of charges) {
    const property = charge.tenancy.bed.room.property;
    const gruppe = gruppen.get(property.id) ?? { name: property.name, charges: [] };
    gruppe.charges.push(charge);
    gruppen.set(property.id, gruppe);
  }

  return (
    <>
      <PageHeader
        title="Mieteingänge"
        description="Monat für Monat abhaken, welche Mieten schon da sind – von Hand oder automatisch per Kontoauszug."
        breadcrumb={[{ label: "Buchhaltung", href: "/buchhaltung" }, { label: "Mieteingänge" }]}
        actions={
          <AdminOnly>
            <form action={runAutoMatch}>
              <input type="hidden" name="back" value={back} />
              <button type="submit" className="btn btn-secondary">
                Zahlungen automatisch zuordnen
              </button>
            </form>
          </AdminOnly>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {/* --- Monatswahl ----------------------------------------------------- */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={`/buchhaltung/mieteingaenge?monat=${monatsWert(zurueck.year, zurueck.month)}`}
          className="btn btn-secondary btn-sm"
          aria-label="Voriger Monat"
        >
          ← {formatMonth(zurueck.year, zurueck.month)}
        </Link>
        <span className="min-w-40 text-center text-lg font-semibold text-ink-900">
          {formatMonth(year, month)}
        </span>
        <Link
          href={`/buchhaltung/mieteingaenge?monat=${monatsWert(vor.year, vor.month)}`}
          className="btn btn-secondary btn-sm"
          aria-label="Nächster Monat"
        >
          {formatMonth(vor.year, vor.month)} →
        </Link>
        {!istAktuellerMonat && (
          <Link href="/buchhaltung/mieteingaenge" className="btn btn-ghost btn-sm">
            Zum aktuellen Monat
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Abgehakt"
          value={`${bezahltAnzahl} von ${relevante.length}`}
          tone={relevante.length > 0 && bezahltAnzahl === relevante.length ? "success" : "neutral"}
        />
        <StatCard label="Eingegangen" value={formatCents(eingegangen)} tone="success" />
        <StatCard label="Noch offen" value={formatCents(offen)} tone={offen > 0 ? "warning" : "success"} />
        <StatCard label="Soll gesamt" value={formatCents(sollGesamt)} />
      </div>

      {charges.length === 0 ? (
        <div className="mt-6">
          <Card>
            <EmptyState
              title={`Keine Forderungen für ${formatMonth(year, month)}`}
              description="Für diesen Monat sind noch keine Mietforderungen erzeugt. Forderungen entstehen automatisch für jedes laufende Mietverhältnis."
            />
            <AdminOnly>
              <form action={generateCharges} className="mt-4 text-center">
                <input type="hidden" name="back" value={back} />
                <button type="submit" className="btn btn-primary">
                  Forderungen erzeugen
                </button>
              </form>
            </AdminOnly>
          </Card>
        </div>
      ) : (
        Array.from(gruppen.values()).map((gruppe) => {
          const relevanteImObjekt = gruppe.charges.filter((c) => c.status !== "WAIVED");
          const bezahltImObjekt = relevanteImObjekt.filter((c) => c.status === "PAID").length;
          const offenImObjekt = relevanteImObjekt.reduce(
            (sum, c) => sum + c.amountCents - eingegangenVon(c),
            0,
          );

          return (
            <div key={gruppe.name} className="mt-6">
              <Card padded={false}>
                <div className="flex flex-wrap items-center gap-4 border-b border-ink-200 p-4">
                  <h2 className="text-base font-semibold text-ink-900">{gruppe.name}</h2>
                  <span className="text-sm text-ink-600">
                    {bezahltImObjekt} von {relevanteImObjekt.length} abgehakt
                    {offenImObjekt > 0 && <> · {formatCents(offenImObjekt)} offen</>}
                  </span>
                  <div className="ml-auto w-40">
                    <Meter
                      value={relevanteImObjekt.length === 0 ? 1 : bezahltImObjekt / relevanteImObjekt.length}
                      tone={bezahltImObjekt === relevanteImObjekt.length ? "success" : "brand"}
                    />
                  </div>
                </div>

                <Table>
                  <thead>
                    <tr>
                      <Th className="w-12">Bezahlt</Th>
                      <Th>Mieter</Th>
                      <Th>Unterkunft</Th>
                      <Th align="right">Miete</Th>
                      <Th>Eingang</Th>
                      <Th align="right">Aktion</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppe.charges.map((charge) => {
                      const zugeordnet = charge.allocations.reduce((s, a) => s + a.amountCents, 0);
                      const chargeOffen = charge.amountCents - eingegangenVon(charge);
                      const istBezahlt = charge.status === "PAID";
                      const istErlassen = charge.status === "WAIVED";
                      const perKonto = charge.allocations.length > 0;

                      return (
                        <tr
                          key={charge.id}
                          className={istBezahlt ? "bg-emerald-50/50" : "hover:bg-ink-50"}
                        >
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
                            <Link
                              href={`/mieter/${charge.tenancy.tenantId}`}
                              className="font-medium hover:text-brand-700"
                            >
                              {charge.tenancy.tenant.firstName} {charge.tenancy.tenant.lastName}
                            </Link>
                            {charge.kind === "DEPOSIT" && (
                              <span className="ml-2">
                                <Badge tone="brand">Kaution</Badge>
                              </span>
                            )}
                            {istErlassen && (
                              <span className="ml-2">
                                <Badge tone="neutral">Erlassen</Badge>
                              </span>
                            )}
                          </Td>
                          <Td className="text-ink-600">
                            {charge.tenancy.bed.room.name} · {charge.tenancy.bed.label}
                          </Td>
                          <Td align="right" className="tabular-nums">
                            {formatCents(charge.amountCents)}
                            {!istBezahlt && !istErlassen && zugeordnet > 0 && (
                              <p className="text-xs text-amber-600">
                                noch {formatCents(chargeOffen)} offen
                              </p>
                            )}
                          </Td>
                          <Td className="text-xs text-ink-600">
                            {perKonto ? (
                              charge.allocations.map((a) => (
                                <p key={a.id}>
                                  {formatDate(a.bankTransaction.bookingDate)} ·{" "}
                                  {formatCents(a.amountCents)} per Kontoauszug
                                </p>
                              ))
                            ) : istBezahlt ? (
                              <span>von Hand abgehakt</span>
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
                                    title="Eingang im Online-Banking gesehen – als bezahlt abhaken"
                                  >
                                    ✓ Abhaken
                                  </button>
                                </form>
                              )}
                              {istBezahlt && !perKonto && (
                                <form action={reopenCharge}>
                                  <input type="hidden" name="id" value={charge.id} />
                                  <input type="hidden" name="back" value={back} />
                                  <button
                                    type="submit"
                                    className="btn btn-ghost btn-sm"
                                    title="Haken zurücknehmen"
                                  >
                                    Rückgängig
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
          );
        })
      )}

      <p className="mt-6 text-xs text-ink-500">
        Per Kontoauszug bestätigte Eingänge lassen sich hier nicht zurücknehmen – die Zuordnung
        dazu wird unter{" "}
        <Link href="/buchhaltung/offene-posten" className="font-semibold text-brand-700 hover:underline">
          Offene Posten
        </Link>{" "}
        gelöst.
      </p>
    </>
  );
}
