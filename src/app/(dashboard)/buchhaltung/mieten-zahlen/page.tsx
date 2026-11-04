import { objektmieteAnlegen, objektmieteLoeschen, objektmieteSpeichern } from "@/app/actions/objektmiete";
import { AdminOnly } from "@/components/admin-only";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { Badge, Card, EmptyState, Flash, PageHeader, Table, Td, Th, type Tone } from "@/components/ui";
import { ZahltagKarte } from "@/components/zahltag";
import { prisma } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { heuteInBerlin } from "@/lib/faelligkeit";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { centsToInput } from "@/lib/money";
import { tageBisFaellig, type MonatsStatus } from "@/lib/objektmiete";
import { objektmietenStand, restSumme } from "@/lib/objektmiete-stand";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Mieten zahlen") };
}
export const dynamic = "force-dynamic";

const STATUS: Record<MonatsStatus, { label: string; tone: Tone }> = {
  BEZAHLT: { label: "bezahlt", tone: "success" },
  TEILWEISE: { label: "teilweise", tone: "warning" },
  OFFEN: { label: "offen", tone: "neutral" },
  UEBERFAELLIG: { label: "überfällig", tone: "danger" },
};

type VertragFormular = {
  id?: string;
  propertyId: string;
  bezeichnung: string | null;
  vermieter: string;
  betragCents: number;
  faelligArt: string;
  faelligTag: number;
  beginn: Date | null;
  ende: Date | null;
  suchbegriffe: string | null;
  kennung: string | null;
  vertragUrl: string | null;
  notizen: string | null;
};

/**
 * Mieten, die wir an unsere Vermieter zahlen: Faelligkeit laut Vertrag,
 * abgeglichen mit den Abbuchungen auf unseren Konten.
 */
export default async function MietenZahlenPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datum, geld } = await oberflaeche();
  const params = await searchParams;
  const heute = heuteInBerlin();
  const [stand, objekte] = await Promise.all([
    objektmietenStand(heute),
    prisma.property.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const monatKurz = (jahr: number, monat: number) => `${String(monat).padStart(2, "0")}/${String(jahr).slice(2)}`;
  const laufend = stand.zeilen.filter((z) => z.laeuft);
  const beendet = stand.zeilen.filter((z) => !z.laeuft);
  const monatlich = laufend.reduce((s, z) => s + z.vertrag.betragCents, 0);

  const formular = (v: VertragFormular, aktion: (fd: FormData) => Promise<void>, knopf: string) => (
    <form action={aktion} className="grid gap-3 sm:grid-cols-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="sm:col-span-2">
        <label>{t("Objekt")}</label>
        <select name="propertyId" defaultValue={v.propertyId} required>
          <option value="">–</option>
          {objekte.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label>{t("Wohnung / Bezeichnung")}</label>
        <input name="bezeichnung" defaultValue={v.bezeichnung ?? ""} placeholder={t("z. B. Hinterhaus 1. OG")} />
      </div>
      <div className="sm:col-span-2">
        <label>{t("Vermieter")}</label>
        <input name="vermieter" defaultValue={v.vermieter} required />
      </div>
      <div>
        <label>{t("Betrag / Monat (brutto)")}</label>
        <input name="betrag" inputMode="decimal" defaultValue={v.betragCents ? centsToInput(v.betragCents) : ""} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label>{t("Fällig am")}</label>
          <input name="faelligTag" type="number" min={1} max={31} defaultValue={v.faelligTag} />
        </div>
        <div>
          <label>&nbsp;</label>
          <select name="faelligArt" defaultValue={v.faelligArt}>
            <option value="WERKTAG">{t("Werktag")}</option>
            <option value="TAG">{t("Kalendertag")}</option>
          </select>
        </div>
      </div>
      <div>
        <label>{t("Mietbeginn")}</label>
        <input name="beginn" type="date" defaultValue={toDateInput(v.beginn)} required />
      </div>
      <div>
        <label>{t("Mietende")}</label>
        <input name="ende" type="date" defaultValue={toDateInput(v.ende)} />
      </div>
      <div className="sm:col-span-2">
        <label>{t("Suchbegriffe in der Überweisung")}</label>
        <input name="suchbegriffe" defaultValue={v.suchbegriffe ?? ""} placeholder="erdechs, kalb+martinet" />
        <p className="field-hint">{t("Durch Komma getrennt; „a+b“ heißt: beides muss vorkommen.")}</p>
      </div>
      <div>
        <label>{t("Kennung im Zweck")}</label>
        <input name="kennung" defaultValue={v.kennung ?? ""} placeholder="1. OG" />
      </div>
      <div className="sm:col-span-3">
        <label>{t("Link zum Vertrag")}</label>
        <input name="vertragUrl" defaultValue={v.vertragUrl ?? ""} placeholder="https://drive.google.com/…" />
      </div>
      <div className="sm:col-span-4">
        <label>{t("Notizen")}</label>
        <input name="notizen" defaultValue={v.notizen ?? ""} />
      </div>
      <div className="sm:col-span-4">
        <button type="submit" className="btn btn-primary">{knopf}</button>
      </div>
    </form>
  );

  return (
    <>
      <PageHeader
        title={t("Mieten zahlen")}
        description={t("Was wir an unsere Vermieter zahlen – Fälligkeit laut Mietvertrag, abgeglichen mit unseren Überweisungen.")}
      />
      <Flash ok={params.ok} fehler={params.fehler} />

      <ZahltagKarte stand={stand} heute={heute} />

      <Card
        className="mb-4"
        title={t("Offen")}
        description={t("Noch nicht (ganz) überwiesen – älteste zuerst. Bezahlt gilt ein Monat, sobald die Überweisung auf dem Konto ist.")}
        padded={false}
      >
        {stand.offen.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("Alles bezahlt")} description={t("Für die nächsten Monate ist nichts offen.")} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Fällig")}</Th>
                <Th>{t("Objekt")}</Th>
                <Th>{t("Vermieter")}</Th>
                <Th>{t("Monat")}</Th>
                <Th align="right">{t("Betrag")}</Th>
                <Th align="right">{t("Offen")}</Th>
                <Th>{t("Status")}</Th>
              </tr>
            </thead>
            <tbody>
              {stand.offen.map(({ zeile, monat }) => {
                const tage = tageBisFaellig(heute, monat.faellig);
                return (
                  <tr key={`${zeile.vertrag.id}-${monat.jahr}-${monat.monat}`}>
                    <Td className="whitespace-nowrap">
                      {datum(monat.faellig)}
                      <span className={`block text-xs ${tage < 0 ? "text-rose-700" : tage === 0 ? "text-amber-700" : "text-ink-500"}`}>
                        {tage < 0 ? t("seit {tage} Tagen", { tage: -tage }) : tage === 0 ? t("heute") : t("in {tage} Tagen", { tage })}
                      </span>
                    </Td>
                    <Td>
                      {zeile.vertrag.property.name}
                      {zeile.vertrag.bezeichnung && <span className="block text-xs text-ink-500">{zeile.vertrag.bezeichnung}</span>}
                    </Td>
                    <Td>{zeile.vertrag.vermieter}</Td>
                    <Td className="whitespace-nowrap">
                      {monatKurz(monat.jahr, monat.monat)}
                      {monat.anteilig && <span className="block text-xs text-ink-500">{t("anteilig")}</span>}
                    </Td>
                    <Td align="right" className="tabular-nums">{geld(monat.sollCents)}</Td>
                    <Td align="right" className="font-semibold tabular-nums">{geld(monat.sollCents - monat.bezahltCents)}</Td>
                    <Td><Badge tone={STATUS[monat.status].tone}>{t(STATUS[monat.status].label)}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right text-ink-500">{t("Summe offen")}</td>
                <Td align="right" className="font-semibold tabular-nums">{geld(restSumme(stand.offen))}</Td>
                <Td />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>

      <Card
        className="mb-4"
        title={t("Unsere Mietverträge")}
        description={t("{anzahl} laufend · zusammen {summe} im Monat", { anzahl: laufend.length, summe: geld(monatlich) })}
      >
        {stand.zeilen.length === 0 && (
          <EmptyState title={t("Noch kein Mietvertrag erfasst")} description={t("Unten den ersten Vertrag mit einem Vermieter anlegen.")} />
        )}
        <div className="space-y-4">
          {[...laufend, ...beendet].map((zeile) => {
            const v = zeile.vertrag;
            const verlauf = zeile.monate.filter((m) => tageBisFaellig(heute, m.faellig) <= 40);
            return (
              <div key={v.id} className={`rounded-xl border border-ink-200 p-4 ${zeile.laeuft ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {v.property.name}
                      {v.bezeichnung && <span className="font-normal text-ink-600"> · {v.bezeichnung}</span>}
                    </p>
                    <p className="text-sm text-ink-600">
                      {v.vermieter} · <span className="tabular-nums">{geld(v.betragCents)}</span> · {t("fällig")} {v.faelligArt === "WERKTAG" ? t("am {n}. Werktag", { n: v.faelligTag }) : t("zum {n}.", { n: v.faelligTag })}
                    </p>
                    <p className="text-xs text-ink-500">
                      {t("seit {datum}", { datum: datum(v.beginn) })}
                      {v.ende ? ` · ${t("bis {datum}", { datum: datum(v.ende) })}` : ` · ${t("unbefristet")}`}
                      {v.vertragUrl && (
                        <>
                          {" · "}
                          <a href={v.vertragUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{t("Vertrag")}</a>
                        </>
                      )}
                    </p>
                    {v.notizen && <p className="mt-1 text-xs text-ink-500">{v.notizen}</p>}
                  </div>
                  {zeile.naechsteOffen && (
                    <p className="text-right text-xs text-ink-600">
                      {t("nächste Zahlung")}
                      <span className="block text-sm font-semibold text-ink-900">{datum(zeile.naechsteOffen.faellig)}</span>
                    </p>
                  )}
                </div>
                {verlauf.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {verlauf.map((m) => (
                      <span
                        key={`${m.jahr}-${m.monat}`}
                        title={`${t("fällig")} ${datum(m.faellig)} · ${geld(m.sollCents)} · ${t("bezahlt")} ${geld(m.bezahltCents)}`}
                      >
                        <Badge tone={STATUS[m.status].tone}>
                          {monatKurz(m.jahr, m.monat)} {m.status === "BEZAHLT" ? "✓" : m.status === "TEILWEISE" ? "½" : m.status === "UEBERFAELLIG" ? "!" : ""}
                        </Badge>
                      </span>
                    ))}
                  </div>
                )}
                <AdminOnly>
                  <div className="mt-3 border-t border-ink-100 pt-3">
                    <Disclosure summary={t("Bearbeiten")}>
                      {formular(v, objektmieteSpeichern, t("Speichern"))}
                      <form action={objektmieteLoeschen} className="mt-3">
                        <input type="hidden" name="id" value={v.id} />
                        <ConfirmButton className="btn btn-ghost btn-sm text-red-700" message={t("Diesen Mietvertrag wirklich entfernen?")}>
                          {t("Mietvertrag entfernen")}
                        </ConfirmButton>
                      </form>
                    </Disclosure>
                  </div>
                </AdminOnly>
              </div>
            );
          })}
        </div>
        <AdminOnly>
          <div className="mt-5 border-t border-ink-200 pt-5">
            <Disclosure summary={t("Mietvertrag hinzufügen")}>
              {formular(
                {
                  propertyId: "",
                  bezeichnung: null,
                  vermieter: "",
                  betragCents: 0,
                  faelligArt: "WERKTAG",
                  faelligTag: 3,
                  beginn: null,
                  ende: null,
                  suchbegriffe: null,
                  kennung: null,
                  vertragUrl: null,
                  notizen: null,
                },
                objektmieteAnlegen,
                t("Anlegen"),
              )}
            </Disclosure>
          </div>
        </AdminOnly>
      </Card>
    </>
  );
}
