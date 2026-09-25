import Link from "next/link";

import { markChargePaid, runAutoMatch } from "@/app/actions/accounting";
import { AdminOnly } from "@/components/admin-only";
import { ListenFilter } from "@/components/listenfilter";
import { NachrichtDialog } from "@/components/nachricht-dialog";
import { TenancyBadge } from "@/components/status";
import { Badge, Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { MAHN_SPRACHEN, MAHN_SPRACHE_NAME, rueckstandText, whatsappLink, type OffenerPosten } from "@/lib/mahnung";
import { getSettings } from "@/lib/settings";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Rückstände") };
}
export const dynamic = "force-dynamic";

/**
 * Alle offenen Betraege auf einen Blick - je Person, ueber alle Monate,
 * Miete und Kaution zusammen.
 *
 * Die Mieteingaenge zeigen einen Monat, die Kautionen nur die Kaution.
 * Wer wissen will, wer insgesamt wie viel schuldet, braucht diese Seite:
 * je Mieter die offenen Posten untereinander, darunter die Summe, oben
 * die Gesamtsumme. Abhaken geht direkt hier, die Nachricht auch.
 */
export default async function RueckstaendePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datum, datumZeit, monat, geld } = await oberflaeche();
  const params = await searchParams;
  const back = "/buchhaltung/rueckstaende";
  const einstellungen = await getSettings();

  const charges = await prisma.rentCharge.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    include: {
      allocations: { select: { amountCents: true } },
      tenancy: {
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
          bed: { include: { room: { include: { property: { select: { id: true, name: true } } } } } },
        },
      },
    },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
  });

  type Posten = (typeof charges)[number] & { offenCents: number };
  const posten: Posten[] = charges
    .map((c) => ({
      ...c,
      offenCents: c.amountCents - Math.min(c.amountCents, c.allocations.reduce((s, a) => s + a.amountCents, 0)),
    }))
    .filter((c) => c.offenCents > 0);

  // Je Mieter buendeln - eine Person kann mehrere Mietverhaeltnisse haben.
  const gruppen = new Map<string, { tenant: Posten["tenancy"]["tenant"]; posten: Posten[] }>();
  for (const p of posten) {
    const g = gruppen.get(p.tenancy.tenantId) ?? { tenant: p.tenancy.tenant, posten: [] };
    g.posten.push(p);
    gruppen.set(p.tenancy.tenantId, g);
  }
  const mieter = Array.from(gruppen.values())
    .map((g) => ({ ...g, summe: g.posten.reduce((s, p) => s + p.offenCents, 0) }))
    .sort((a, b) => b.summe - a.summe);

  const gesamt = mieter.reduce((s, m) => s + m.summe, 0);
  const aeltester = posten[0] ?? null;

  // Letzter Versand je Mieter - "Nachricht gesendet am ..." unter dem Knopf.
  const tenantIds = mieter.map((m) => m.tenant.id);
  const letzteNachrichten = tenantIds.length === 0
    ? []
    : await prisma.reminderLog.findMany({
        where: { tenantId: { in: tenantIds } },
        orderBy: { sentAt: "desc" },
        distinct: ["tenantId"],
        select: { tenantId: true, sentAt: true, language: true, channel: true },
      });
  const zuletztGesendet = new Map(
    letzteNachrichten.map((n) => [
      n.tenantId,
      `${datumZeit(n.sentAt)} (${t(MAHN_SPRACHE_NAME[n.language as keyof typeof MAHN_SPRACHE_NAME] ?? n.language)}, ${n.channel === "WHATSAPP" ? "WhatsApp" : t("kopiert")})`,
    ]),
  );

  return (
    <>
      <PageHeader
        title={t("Rückstände")}
        description={t("Alle offenen Beträge je Person – Mieten aller Monate und die Kaution zusammen.")}
        breadcrumb={[{ label: t("Buchhaltung"), href: "/buchhaltung" }, { label: t("Rückstände") }]}
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
        <StatCard label={t("Offen gesamt")} value={geld(gesamt)} tone={gesamt > 0 ? "warning" : "success"} />
        <StatCard label={t("Personen mit Rückstand")} value={String(mieter.length)} />
        <StatCard label={t("Offene Posten")} value={String(posten.length)} hint={t("{anzahl} davon Kaution", { anzahl: posten.filter((p) => p.kind === "DEPOSIT").length })} />
        <StatCard
          label={t("Ältester offener Monat")}
          value={aeltester ? monat(aeltester.periodYear, aeltester.periodMonth) : "–"}
          hint={aeltester ? `${aeltester.tenancy.tenant.firstName} ${aeltester.tenancy.tenant.lastName}` : undefined}
        />
      </div>

      <ListenFilter placeholder={t("Mieter, Objekt, Monat …")} zeilen="section.card" className="mt-6">
        {mieter.length === 0 ? (
          <Card>
            <EmptyState title={t("Keine Rückstände")} description={t("Alle Mieten und Kautionen sind bezahlt.")} />
          </Card>
        ) : (
          <div className="space-y-4">
            {mieter.map(({ tenant, posten: liste, summe }) => {
              const name = `${tenant.firstName} ${tenant.lastName}`.trim();
              const erste = liste[0].tenancy;
              const nachrichtPosten: OffenerPosten[] = liste.map((p) => ({
                art: p.kind === "DEPOSIT" ? "DEPOSIT" : "RENT",
                jahr: p.periodYear,
                monat: p.periodMonth,
                offenCents: p.offenCents,
              }));
              const varianten = MAHN_SPRACHEN.map((code) => {
                const text = rueckstandText(code, {
                  vorname: tenant.firstName,
                  posten: nachrichtPosten,
                  kontoinhaber: einstellungen.companyName,
                  iban: einstellungen.bankIban,
                  bank: einstellungen.bankName,
                });
                return { code, sprache: MAHN_SPRACHE_NAME[code], text, whatsapp: whatsappLink(tenant.phone, text) };
              });
              return (
                <Card
                  key={tenant.id}
                  padded={false}
                  title={name}
                  description={`${erste.bed.room.property.name} · ${erste.bed.room.name} · ${erste.bed.label}`}
                  actions={
                    <>
                      <span className="text-base font-semibold tabular-nums text-amber-700">{geld(summe)}</span>
                      <TenancyBadge status={erste.status} />
                      <Link href={`/mieter/${tenant.id}`} className="btn btn-ghost btn-sm">
                        {t("Profil")}
                      </Link>
                      <AdminOnly>
                        <NachrichtDialog
                          tenantId={tenant.id}
                          name={name}
                          gesamt={geld(summe)}
                          gesamtCents={summe}
                          varianten={varianten}
                          telefonFehlt={`/mieter/${tenant.id}`}
                          zuletzt={zuletztGesendet.get(tenant.id) ?? null}
                        />
                      </AdminOnly>
                    </>
                  }
                >
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t("Posten")}</Th>
                        <Th>{t("Fällig")}</Th>
                        <Th align="right">{t("Soll")}</Th>
                        <Th align="right">{t("Offen")}</Th>
                        <Th align="right">{t("Aktion")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((p) => (
                        <tr key={p.id} id={`forderung-${p.id}`} className="scroll-mt-24 hover:bg-ink-50">
                          <Td>
                            {p.kind === "DEPOSIT" ? (
                              <span className="flex items-center gap-2">
                                {t("Kaution")}
                                <Badge tone="brand">{monat(p.periodYear, p.periodMonth)}</Badge>
                              </span>
                            ) : (
                              t("Miete {monat}", { monat: monat(p.periodYear, p.periodMonth) })
                            )}
                            {p.notes && <p className="text-xs text-ink-500">{p.notes}</p>}
                          </Td>
                          <Td className="whitespace-nowrap text-ink-600">{datum(p.dueDate)}</Td>
                          <Td align="right" className="tabular-nums">{geld(p.amountCents)}</Td>
                          <Td align="right" className="tabular-nums font-semibold text-amber-700">{geld(p.offenCents)}</Td>
                          <Td align="right">
                            <AdminOnly>
                              <form action={markChargePaid}>
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="back" value={`${back}#forderung-${p.id}`} />
                                <button
                                  type="submit"
                                  className="btn btn-secondary btn-sm whitespace-nowrap"
                                  title={t("Eingang im Online-Banking gesehen – als bezahlt abhaken")}
                                >
                                  {t("✓ Abhaken")}
                                </button>
                              </form>
                            </AdminOnly>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              );
            })}
          </div>
        )}
      </ListenFilter>
    </>
  );
}
