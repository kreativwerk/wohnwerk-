import Link from "next/link";

import { markChargePaid, reopenCharge, runAutoMatch } from "@/app/actions/accounting";
import { setNoDeposit, setTenancyDeposit, undoNoDeposit } from "@/app/actions/tenants";
import { AdminOnly } from "@/components/admin-only";
import { TenancyBadge } from "@/components/status";
import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { centsToInput } from "@/lib/money";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Kautionen") };
}
export const dynamic = "force-dynamic";

const ANSICHTEN = ["offen", "bezahlt", "alle"] as const;
type Ansicht = (typeof ANSICHTEN)[number];

/**
 * In welchem Zustand die Kaution eines Mietverhaeltnisses ist.
 *
 *   bezahlt        - Forderung beglichen (per Konto oder von Hand abgehakt)
 *   offen          - Forderung da, Geld fehlt ganz oder teilweise
 *   erlassen       - Forderung bewusst erlassen
 *   ohneForderung  - Kaution vereinbart, Forderung noch nicht erzeugt
 *   ohneKaution    - im Mietverhaeltnis steht 0,00 - Betrag muss nachgetragen werden
 *   keineKaution   - bewusst ohne Kaution (aeltere Vertraege) - nichts zu tun
 */
type Lage = "bezahlt" | "offen" | "erlassen" | "ohneForderung" | "ohneKaution" | "keineKaution";

/** Vorschlag beim Nachtragen: die uebliche Kaution im Haus. */
const UEBLICHE_KAUTION_CENTS = 20000;

/**
 * Kautionszahlungen - einmal je Mietverhaeltnis, deshalb ohne Monatswahl.
 *
 * Ausgangspunkt sind die Mietverhaeltnisse, nicht die Forderungen: Wer bei
 * der Zuweisung ohne Kaution angelegt wurde, hat keine Forderung und
 * wuerde sonst nie auftauchen - und genau die Faelle muessen sichtbar
 * sein. Fehlt der Betrag, wird er hier direkt in der Zeile nachgetragen.
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

  const tenancies = await prisma.tenancy.findMany({
    where: { status: { in: ["DRAFT", "SENT", "ACTIVE", "ENDED"] } },
    include: {
      tenant: true,
      bed: { include: { room: { include: { property: true } } } },
      charges: {
        where: { kind: "DEPOSIT" },
        orderBy: { createdAt: "desc" },
        include: {
          allocations: {
            include: { bankTransaction: { select: { bookingDate: true, counterpartyName: true } } },
          },
        },
      },
    },
  });

  const zeilen = tenancies.map((tenancy) => {
    const charge = tenancy.charges[0] ?? null;
    let lage: Lage;
    if (charge?.status === "PAID") lage = "bezahlt";
    else if (charge?.status === "WAIVED") lage = "erlassen";
    else if (charge) lage = "offen";
    else if (tenancy.depositCents > 0) lage = "ohneForderung";
    else if (tenancy.noDeposit) lage = "keineKaution";
    else lage = "ohneKaution";

    const soll = charge?.amountCents ?? tenancy.depositCents;
    const eingegangen =
      charge === null
        ? 0
        : charge.status === "PAID"
          ? charge.amountCents
          : Math.min(charge.amountCents, charge.allocations.reduce((sum, a) => sum + a.amountCents, 0));
    return { tenancy, charge, lage, soll, eingegangen };
  });

  const relevante = zeilen.filter((z) => z.lage !== "erlassen" && z.lage !== "ohneKaution" && z.lage !== "keineKaution");
  const sollGesamt = relevante.reduce((sum, z) => sum + z.soll, 0);
  const eingegangen = relevante.reduce((sum, z) => sum + z.eingegangen, 0);
  const offen = sollGesamt - eingegangen;
  const offeneAnzahl = relevante.filter((z) => z.lage !== "bezahlt").length;
  const ohneKaution = zeilen.filter((z) => z.lage === "ohneKaution").length;

  const gezeigt = zeilen.filter((z) => {
    if (ansicht === "alle") return true;
    if (ansicht === "bezahlt") return z.lage === "bezahlt";
    return z.lage !== "bezahlt" && z.lage !== "erlassen" && z.lage !== "keineKaution";
  });

  gezeigt.sort((a, b) => {
    const pa = a.tenancy.bed.room.property.name;
    const pb = b.tenancy.bed.room.property.name;
    if (pa !== pb) return pa.localeCompare(pb, "de");
    // Der juengste Einzug zuerst - dort fehlt die Kaution am ehesten noch.
    return b.tenancy.startDate.getTime() - a.tenancy.startDate.getTime();
  });

  const gruppen = new Map<string, { name: string; zeilen: typeof gezeigt }>();
  for (const zeile of gezeigt) {
    const property = zeile.tenancy.bed.room.property;
    const gruppe = gruppen.get(property.id) ?? { name: property.name, zeilen: [] };
    gruppe.zeilen.push(zeile);
    gruppen.set(property.id, gruppe);
  }

  const chips: Array<{ wert: Ansicht; label: string; zahl: number }> = [
    { wert: "offen", label: t("Offen"), zahl: offeneAnzahl + ohneKaution },
    { wert: "bezahlt", label: t("Eingegangen"), zahl: zeilen.filter((z) => z.lage === "bezahlt").length },
    { wert: "alle", label: t("Alle"), zahl: zeilen.length },
  ];

  return (
    <>
      <PageHeader
        title={t("Kautionen")}
        description={t("Einmalig zum Einzug fällig. Hier steht für jeden Bewohner, ob die Kaution eingegangen ist, noch fehlt oder erst eingetragen werden muss.")}
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
          label={t("Ohne Kaution")}
          value={String(ohneKaution)}
          hint={t("Bewohner, bei denen noch kein Betrag eingetragen ist")}
          tone={ohneKaution > 0 ? "warning" : "neutral"}
        />
      </div>

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
            description={t("Jeder Bewohner mit Bett erscheint hier – auch ohne vereinbarte Kaution.")}
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
                  {gruppe.zeilen.map(({ tenancy, charge, lage, soll, eingegangen: bezahlt }) => {
                    const istBezahlt = lage === "bezahlt";
                    const istErlassen = lage === "erlassen";
                    const perKonto = (charge?.allocations.length ?? 0) > 0;
                    const teilOffen = lage === "offen" && bezahlt > 0 ? soll - bezahlt : 0;
                    // Nach jeder Zeilenaktion zurueck zu dieser Zeile, nicht an den Seitenanfang.
                    const backZeile = `${back}#kaution-${tenancy.id}`;
                    return (
                      <tr
                        key={tenancy.id}
                        id={`kaution-${tenancy.id}`}
                        className={`scroll-mt-24 ${
                          istBezahlt
                            ? "bg-emerald-50/50"
                            : lage === "ohneKaution"
                              ? "bg-amber-50/40 hover:bg-amber-50/70"
                              : "hover:bg-ink-50"
                        }`}
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
                          <Link href={`/mieter/${tenancy.tenantId}`} className="font-medium hover:text-brand-700">
                            {tenancy.tenant.firstName} {tenancy.tenant.lastName}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <TenancyBadge status={tenancy.status} />
                            {istErlassen && <Badge tone="neutral">{t("Erlassen")}</Badge>}
                            {lage === "ohneKaution" && <Badge tone="warning">{t("Keine Kaution eingetragen")}</Badge>}
                            {lage === "keineKaution" && <Badge tone="neutral">{t("Keine Kaution vereinbart")}</Badge>}
                            {lage === "ohneForderung" && <Badge tone="warning">{t("Forderung fehlt")}</Badge>}
                          </div>
                        </Td>
                        <Td className="text-ink-600">
                          {tenancy.bed.room.name} · {tenancy.bed.label}
                        </Td>
                        <Td className="whitespace-nowrap text-ink-600">{datum(tenancy.startDate)}</Td>
                        <Td align="right" className="tabular-nums">
                          {lage === "ohneKaution" || lage === "keineKaution" ? <span className="text-ink-400">–</span> : geld(soll)}
                          {teilOffen > 0 && (
                            <p className="text-xs text-amber-600">
                              {t("noch {betrag} offen", { betrag: geld(teilOffen) })}
                            </p>
                          )}
                        </Td>
                        <Td className="text-xs text-ink-600">
                          {perKonto ? (
                            charge?.allocations.map((a) => (
                              <p key={a.id}>
                                {datum(a.bankTransaction.bookingDate)} · {geld(a.amountCents)}
                              </p>
                            ))
                          ) : istBezahlt ? (
                            <span>{t("von Hand abgehakt")}</span>
                          ) : lage === "ohneKaution" ? (
                            <span className="text-ink-400">{t("Betrag rechts eintragen")}</span>
                          ) : lage === "keineKaution" ? (
                            <span className="text-ink-400">{t("Vertrag ohne Kaution")}</span>
                          ) : lage === "ohneForderung" ? (
                            <span className="text-ink-400">{t("Forderung noch nicht erzeugt")}</span>
                          ) : (
                            <span className="text-ink-400">–</span>
                          )}
                        </Td>
                        <Td align="right">
                          <AdminOnly>
                            {lage === "ohneKaution" && (
                              <form action={setTenancyDeposit} className="flex items-center justify-end gap-1.5">
                                <input type="hidden" name="id" value={tenancy.id} />
                                <input type="hidden" name="back" value={backZeile} />
                                <label htmlFor={`kaution-betrag-${tenancy.id}`} className="sr-only">
                                  {t("Kaution")}
                                </label>
                                <input
                                  id={`kaution-betrag-${tenancy.id}`}
                                  name="depositCents"
                                  inputMode="decimal"
                                  defaultValue={centsToInput(UEBLICHE_KAUTION_CENTS)}
                                  className="!w-24 text-right"
                                  aria-label={t("Kaution")}
                                />
                                <button
                                  type="submit"
                                  className="btn btn-secondary btn-sm whitespace-nowrap"
                                  title={t("Kaution im Mietverhältnis eintragen und Forderung erzeugen")}
                                >
                                  {t("Eintragen")}
                                </button>
                              </form>
                            )}
                            {/* Aeltere Vertraege liefen ohne Kaution: ein Klick, und die
                                Zeile ist keine offene Kaution mehr. Nur solange nichts
                                bezahlt ist. */}
                            {(lage === "ohneKaution" || (lage === "offen" && !perKonto) || lage === "ohneForderung") && (
                              <form action={setNoDeposit} className="mt-1.5 flex justify-end">
                                <input type="hidden" name="id" value={tenancy.id} />
                                <input type="hidden" name="back" value={backZeile} />
                                <button
                                  type="submit"
                                  className="btn btn-ghost btn-sm whitespace-nowrap"
                                  title={t("Vertrag ohne Kaution – es wird keine Kaution berechnet")}
                                >
                                  {t("Keine Kaution")}
                                </button>
                              </form>
                            )}
                            {lage === "keineKaution" && (
                              <form action={undoNoDeposit}>
                                <input type="hidden" name="id" value={tenancy.id} />
                                <input type="hidden" name="back" value={backZeile} />
                                <button type="submit" className="btn btn-ghost btn-sm" title={t("„Keine Kaution“ zurücknehmen")}>
                                  {t("Rückgängig")}
                                </button>
                              </form>
                            )}
                            {lage === "ohneForderung" && (
                              <form action={setTenancyDeposit}>
                                <input type="hidden" name="id" value={tenancy.id} />
                                <input type="hidden" name="back" value={backZeile} />
                                <input type="hidden" name="depositCents" value={centsToInput(tenancy.depositCents)} />
                                <button type="submit" className="btn btn-secondary btn-sm whitespace-nowrap">
                                  {t("Forderung erzeugen")}
                                </button>
                              </form>
                            )}
                            {lage === "offen" && charge && (
                              <form action={markChargePaid}>
                                <input type="hidden" name="id" value={charge.id} />
                                <input type="hidden" name="back" value={backZeile} />
                                <button
                                  type="submit"
                                  className="btn btn-secondary btn-sm"
                                  title={t("Eingang im Online-Banking gesehen – als bezahlt abhaken")}
                                >
                                  {t("✓ Abhaken")}
                                </button>
                              </form>
                            )}
                            {istBezahlt && !perKonto && charge && (
                              <form action={reopenCharge}>
                                <input type="hidden" name="id" value={charge.id} />
                                <input type="hidden" name="back" value={backZeile} />
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
