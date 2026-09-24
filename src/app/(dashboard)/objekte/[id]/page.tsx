import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createBed,
  createRoom,
  deleteBed,
  deleteProperty,
  deleteRoom,
  togglePropertyActive,
  updateBed,
  updateProperty,
  updateRoom,
} from "@/app/actions/properties";
import { ConfirmButton } from "@/components/interactive";
import { Alert, Card, EmptyState, Flash, Meter, PageHeader, StatCard } from "@/components/ui";
import { PropertyTemplates } from "@/components/template-card";
import { PropertyCosts } from "@/components/cost-card";
import { prisma } from "@/lib/db";
import { bedOccupancy, occupancySummary } from "@/lib/tenancy";
import { centsToInput } from "@/lib/money";
import { OHNE_STOCKWERK, sortiereStockwerke } from "@/lib/stockwerk";

import { requireAdmin } from "@/lib/auth";
import { oberflaeche } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id }, select: { name: true } });
  return { title: property?.name ?? "Objekt" };
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datum, geld } = await oberflaeche();
  await requireAdmin();
  const { id } = await params;
  const flash = await searchParams;

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      rooms: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { beds: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
      },
      costs: { orderBy: { createdAt: "asc" } },
      templates: {
        orderBy: { uploadedAt: "asc" },
        // Ohne `data`: die PDF selbst hat auf der Seite nichts verloren.
        select: {
          id: true,
          kind: true,
          fileName: true,
          sizeBytes: true,
          pageCount: true,
          fieldNames: true,
          fieldMap: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!property) notFound();

  const bankAccounts = await prisma.bankAccount.findMany({ orderBy: { name: "asc" } });

  const allBedIds = property.rooms.flatMap((room) => room.beds.map((bed) => bed.id));
  const [occupancy, summary] = await Promise.all([
    bedOccupancy(allBedIds),
    occupancySummary(id),
  ]);

  // Zimmer nach Stockwerk, Stockwerke in Hausreihenfolge (KG, EG, 1. OG, DG).
  const nachEtage = new Map<string, typeof property.rooms>();
  for (const room of property.rooms) {
    const key = room.floor?.trim() || OHNE_STOCKWERK;
    nachEtage.set(key, [...(nachEtage.get(key) ?? []), room]);
  }
  const stockwerke = sortiereStockwerke(Array.from(nachEtage.keys())).map((key) => ({
    key,
    name: key === OHNE_STOCKWERK ? t("Ohne Stockwerk") : key,
    ohneAngabe: key === OHNE_STOCKWERK,
    zimmer: nachEtage.get(key) ?? [],
  }));

  return (
    <>
      <PageHeader
        title={property.active ? property.name : `${property.name} (inaktiv)`}
        description={`${property.street}, ${property.zip} ${property.city}`}
        breadcrumb={[{ label: t("Objekte"), href: "/objekte" }, { label: property.name }]}
        actions={
          <>
            <form action={togglePropertyActive}>
              <input type="hidden" name="id" value={property.id} />
              {property.active ? (
                <ConfirmButton
                  className="btn btn-secondary"
                  message={t("„{name}“ inaktiv stellen? Es verschwindet aus Belegungsplan, Bettauswahl und Kennzahlen – Buchhaltung und Historie bleiben erhalten.", { name: property.name })}
                >
                  {t("Inaktiv stellen")}
                </ConfirmButton>
              ) : (
                <button type="submit" className="btn btn-primary">
                  {t("Wieder aktivieren")}
                </button>
              )}
            </form>
            <Link href={`/belegung?objekt=${property.id}`} className="btn btn-secondary">
              {t("Belegungsplan")}
            </Link>
            <Link href={`/objekte/${property.id}/zimmerplan`} className="btn btn-primary">
              {t("Zimmerplan")}
            </Link>
          </>
        }
      />

      <Flash ok={flash.ok} fehler={flash.fehler} />

      {!property.active && (
        <div className="mb-5">
          <Alert tone="warning" title={t("Dieses Objekt ist inaktiv")}>
            {t("Es erscheint nicht mehr im Belegungsplan, in der Bettauswahl für neue Mieter und in den Kennzahlen. Alle Buchungen, Verträge und Dokumente bleiben erhalten. Über „Wieder aktivieren“ kommt es jederzeit zurück.")}
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={t("Zimmer")} value={String(property.rooms.length)} />
        <StatCard label={t("Betten")} value={String(summary.beds)} hint={t("{anzahl} gesperrt", { anzahl: summary.blocked })} />
        <StatCard
          label={t("Belegt")}
          value={`${summary.occupied} / ${summary.beds - summary.blocked}`}
          tone={summary.rate >= 0.8 ? "success" : summary.rate >= 0.5 ? "warning" : "danger"}
        />
        <StatCard
          label={t("Miete / Monat")}
          value={geld(summary.actualRentCents)}
          hint={`max. ${geld(summary.potentialRentCents)}`}
          tone="brand"
        />
      </div>

      <div className="mt-4">
        <Meter
          value={summary.rate}
          tone={summary.rate >= 0.8 ? "success" : summary.rate >= 0.5 ? "warning" : "danger"}
        />
      </div>

      {/* --- Zimmer und Betten ---------------------------------------------
          Stockwerk fuer Stockwerk, darin je Zimmer eine Zeile mit seinen
          Betten als Kaertchen. Ein Klick auf "+ Bett" legt das naechste Bett
          an, "+ Zimmer" das naechste Zimmer im Stockwerk - ohne Formular.
          Details (Miete, Sperre, Loeschen) stecken hinter dem Kaertchen. */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">{t("Zimmer und Betten")}</h2>
            <p className="text-sm text-ink-500">
              {t("„+ Zimmer“ legt das nächste Zimmer im Stockwerk an, „+ Bett“ das nächste Bett. Zum Ändern auf ein Bett oder den Stift tippen.")}
            </p>
          </div>
          <Link href={`/objekte/${property.id}/zimmerplan`} className="btn btn-secondary btn-sm">
            {t("Zimmerplan")}
          </Link>
        </div>

        {stockwerke.length === 0 && (
          <Card>
            <EmptyState
              title={t("Noch keine Zimmer")}
              description={t("Legen Sie unten das erste Zimmer an. Die Betten können Sie direkt mit erzeugen.")}
            />
          </Card>
        )}

        <div className="space-y-4">
          {stockwerke.map((stockwerk) => {
            const bettenImStock = stockwerk.zimmer.flatMap((r) => r.beds);
            const belegtImStock = bettenImStock.filter((b) => occupancy.get(b.id)?.occupied).length;
            return (
              <Card
                key={stockwerk.key}
                title={stockwerk.name}
                description={t("{zimmer} Zimmer · {betten} Betten · {belegt} belegt", {
                  zimmer: stockwerk.zimmer.length,
                  betten: bettenImStock.length,
                  belegt: belegtImStock,
                })}
                padded={false}
                actions={
                  <form action={createRoom}>
                    <input type="hidden" name="propertyId" value={property.id} />
                    <input type="hidden" name="floor" value={stockwerk.ohneAngabe ? "" : stockwerk.name} />
                    <input type="hidden" name="bedCount" value="0" />
                    <button type="submit" className="btn btn-secondary btn-sm" title={t("Nächstes Zimmer in diesem Stockwerk anlegen")}>
                      + {t("Zimmer")}
                    </button>
                  </form>
                }
              >
                <ul className="divide-y divide-ink-100">
                  {stockwerk.zimmer.map((room) => {
                    const occupiedInRoom = room.beds.filter((bed) => occupancy.get(bed.id)?.occupied).length;
                    return (
                      <li key={room.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                        <div className="w-full min-w-0 sm:w-44 sm:shrink-0">
                          <p className="truncate text-sm font-semibold text-ink-900">{room.name}</p>
                          <p className="text-xs text-ink-500">
                            {[
                              t("{belegt} von {anzahl} belegt", { belegt: occupiedInRoom, anzahl: room.beds.length }),
                              room.sizeSqm ? `${room.sizeSqm} m²` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          {room.beds.map((bed) => {
                            const state = occupancy.get(bed.id);
                            const gesperrt = bed.status === "BLOCKED";
                            const frei = !state?.occupied && !gesperrt;
                            return (
                              <details key={bed.id} className="relative">
                                <summary
                                  className={`flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-inset transition-colors hover:ring-brand-400 ${
                                    gesperrt
                                      ? "bg-ink-100 text-ink-500 ring-ink-200"
                                      : frei
                                        ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                                        : "bg-white text-ink-800 ring-ink-200"
                                  }`}
                                  title={t("Bett bearbeiten")}
                                >
                                  <span className="font-semibold">{bed.label}</span>
                                  <span className="text-xs tabular-nums text-ink-500">{geld(bed.monthlyRentCents)}</span>
                                  <span className="text-xs">
                                    {gesperrt ? (
                                      t("gesperrt")
                                    ) : state?.tenancy ? (
                                      <span className="text-ink-700">{state.tenancy.tenantName}</span>
                                    ) : (
                                      t("frei")
                                    )}
                                  </span>
                                </summary>
                                <div className="absolute left-0 top-full z-20 mt-1.5 w-[19rem] max-w-[calc(100vw-3rem)] rounded-xl border border-ink-200 bg-white p-3 shadow-[0_12px_40px_rgb(20_39_38/0.16)]">
                                  {state?.tenancy && (
                                    <p className="mb-2 text-xs text-ink-600">
                                      <Link href={`/mieter/${state.tenancy.tenantId}`} className="font-medium hover:text-brand-700">
                                        {state.tenancy.tenantName}
                                      </Link>{" "}
                                      · {t("seit {datum}", { datum: datum(state.tenancy.startDate) })}
                                      {state.tenancy.endDate ? ` · ${t("bis {datum}", { datum: datum(state.tenancy.endDate) })}` : ""}
                                    </p>
                                  )}
                                  <form action={updateBed} className="grid grid-cols-2 gap-2">
                                    <input type="hidden" name="id" value={bed.id} />
                                    <input type="hidden" name="propertyId" value={property.id} />
                                    <div>
                                      <label htmlFor={`label-${bed.id}`}>{t("Bezeichnung")}</label>
                                      <input id={`label-${bed.id}`} name="label" defaultValue={bed.label} required />
                                    </div>
                                    <div>
                                      <label htmlFor={`rent-${bed.id}`}>{t("Miete / Monat")}</label>
                                      <input id={`rent-${bed.id}`} name="monthlyRentCents" defaultValue={centsToInput(bed.monthlyRentCents)} inputMode="decimal" />
                                    </div>
                                    <div>
                                      <label htmlFor={`status-${bed.id}`}>{t("Status")}</label>
                                      <select id={`status-${bed.id}`} name="status" defaultValue={bed.status}>
                                        <option value="FREE">{t("Vermietbar")}</option>
                                        <option value="BLOCKED">{t("Gesperrt")}</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label htmlFor={`notes-${bed.id}`}>{t("Notiz")}</label>
                                      <input id={`notes-${bed.id}`} name="notes" defaultValue={bed.notes ?? ""} />
                                    </div>
                                    <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
                                      <button type="submit" className="btn btn-primary btn-sm">
                                        {t("Speichern")}
                                      </button>
                                    </div>
                                  </form>
                                  {!state?.occupied && (
                                    <form action={deleteBed} className="mt-2 border-t border-ink-100 pt-2">
                                      <input type="hidden" name="id" value={bed.id} />
                                      <input type="hidden" name="propertyId" value={property.id} />
                                      <ConfirmButton className="btn btn-ghost btn-sm text-red-700" message={t("„{name}“ wirklich löschen?", { name: bed.label })}>
                                        {t("Bett löschen")}
                                      </ConfirmButton>
                                    </form>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                          <form action={createBed}>
                            <input type="hidden" name="roomId" value={room.id} />
                            <input type="hidden" name="propertyId" value={property.id} />
                            <button
                              type="submit"
                              className="btn btn-ghost btn-sm"
                              title={t("Nächstes Bett anlegen: {name}, {betrag} / Monat", {
                                name: `Bett ${String.fromCharCode(65 + room.beds.length)}`,
                                betrag: geld(room.defaultBedRentCents),
                              })}
                            >
                              + {t("Bett")}
                            </button>
                          </form>
                        </div>

                        <details className="relative ml-auto">
                          <summary className="btn btn-ghost btn-sm cursor-pointer list-none" title={t("Zimmer bearbeiten")}>
                            ✎
                          </summary>
                          <div className="absolute right-0 top-full z-20 mt-1.5 w-[22rem] max-w-[calc(100vw-3rem)] rounded-xl border border-ink-200 bg-white p-3 shadow-[0_12px_40px_rgb(20_39_38/0.16)]">
                            <form action={updateRoom} className="grid grid-cols-2 gap-2">
                              <input type="hidden" name="id" value={room.id} />
                              <input type="hidden" name="propertyId" value={property.id} />
                              <div className="col-span-2">
                                <label htmlFor={`room-name-${room.id}`}>{t("Bezeichnung")}</label>
                                <input id={`room-name-${room.id}`} name="name" defaultValue={room.name} required />
                              </div>
                              <div>
                                <label htmlFor={`room-floor-${room.id}`}>{t("Etage")}</label>
                                <input id={`room-floor-${room.id}`} name="floor" defaultValue={room.floor ?? ""} list="etagen-vorschlaege" />
                              </div>
                              <div>
                                <label htmlFor={`room-size-${room.id}`}>{t("Größe (m²)")}</label>
                                <input id={`room-size-${room.id}`} name="sizeSqm" defaultValue={room.sizeSqm ?? ""} inputMode="decimal" />
                              </div>
                              <div>
                                <label htmlFor={`room-rent-${room.id}`}>{t("Standardmiete je Bett")}</label>
                                <input id={`room-rent-${room.id}`} name="defaultBedRentCents" defaultValue={centsToInput(room.defaultBedRentCents)} inputMode="decimal" />
                              </div>
                              <div>
                                <label htmlFor={`room-notes-${room.id}`}>{t("Notiz")}</label>
                                <input id={`room-notes-${room.id}`} name="notes" defaultValue={room.notes ?? ""} />
                              </div>
                              <div className="col-span-2 pt-1">
                                <button type="submit" className="btn btn-primary btn-sm">
                                  {t("Zimmer speichern")}
                                </button>
                              </div>
                            </form>
                            <form action={deleteRoom} className="mt-2 border-t border-ink-100 pt-2">
                              <input type="hidden" name="id" value={room.id} />
                              <input type="hidden" name="propertyId" value={property.id} />
                              <ConfirmButton className="btn btn-ghost btn-sm text-red-700" message={t("Zimmer „{name}“ mit allen Betten wirklich löschen?", { name: room.name })}>
                                {t("Zimmer löschen")}
                              </ConfirmButton>
                            </form>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>

      {/* --- Neues Zimmer / neues Stockwerk ---------------------------------- */}
      <div className="mt-6">
        <Card
          title={t("Zimmer hinzufügen")}
          description={t("Ein neuer Etagenname ergibt ein neues Stockwerk. Bezeichnung leer lassen – dann heißt es „Zimmer {n}“.", { n: property.rooms.length + 1 })}
        >
          <form action={createRoom} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto] sm:items-end">
            <input type="hidden" name="propertyId" value={property.id} />
            <div>
              <label htmlFor="new-room-name">{t("Bezeichnung")}</label>
              <input id="new-room-name" name="name" placeholder={t("Zimmer {n}", { n: property.rooms.length + 1 })} />
            </div>
            <div>
              <label htmlFor="new-room-floor">{t("Etage")}</label>
              <input id="new-room-floor" name="floor" placeholder="EG" list="etagen-vorschlaege" />
              <datalist id="etagen-vorschlaege">
                {Array.from(new Set(["KG", "EG", "1. OG", "2. OG", "DG", ...property.rooms.map((r) => r.floor?.trim()).filter(Boolean)])).map((e) => (
                  <option key={e as string} value={e as string} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="new-room-beds">{t("Betten")}</label>
              <input id="new-room-beds" name="bedCount" type="number" min={0} max={20} defaultValue={2} />
            </div>
            <div>
              <label htmlFor="new-room-rent">{t("Miete je Bett / Monat")}</label>
              <input id="new-room-rent" name="defaultBedRentCents" defaultValue="350,00" inputMode="decimal" />
            </div>
            <button type="submit" className="btn btn-primary">
              {t("Zimmer anlegen")}
            </button>
          </form>
        </Card>
      </div>

      {/* --- Unsere Kosten -------------------------------------------------- */}
      <div className="mt-6">
        <PropertyCosts
          propertyId={property.id}
          costs={property.costs}
          currentRentCents={summary.actualRentCents}
          potentialRentCents={summary.potentialRentCents}
        />
      </div>

      {/* --- Vordrucke ------------------------------------------------------ */}
      <div className="mt-6">
        <PropertyTemplates propertyId={property.id} templates={property.templates} />
      </div>

      {/* --- Objektstammdaten ---------------------------------------------- */}
      <div className="mt-6">
        <Card title={t("Objektdaten bearbeiten")}>
          <form action={updateProperty} className="space-y-4">
            <input type="hidden" name="id" value={property.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name">{t("Bezeichnung")}</label>
                <input id="name" name="name" defaultValue={property.name} required />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="street">{t("Straße und Hausnummer")}</label>
                <input id="street" name="street" defaultValue={property.street} required />
              </div>
              <div>
                <label htmlFor="zip">PLZ</label>
                <input id="zip" name="zip" defaultValue={property.zip} required />
              </div>
              <div>
                <label htmlFor="city">{t("Ort")}</label>
                <input id="city" name="city" defaultValue={property.city} required />
              </div>
              <div>
                <label htmlFor="country">{t("Land")}</label>
                <input id="country" name="country" defaultValue={property.country} />
              </div>
              <div>
                <label htmlFor="shortCode">{t("Kürzel")}</label>
                <input id="shortCode" name="shortCode" defaultValue={property.shortCode ?? ""} />
              </div>
              <div>
                <label htmlFor="bankAccountId">{t("Bankkonto des Objekts")}</label>
                <select id="bankAccountId" name="bankAccountId" defaultValue={property.bankAccountId ?? ""}>
                  <option value="">{t("– kein Konto zugeordnet –")}</option>
                  {bankAccounts.map((konto) => (
                    <option key={konto.id} value={konto.id}>
                      {konto.name} · {konto.iban}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  {t("Eingänge auf diesem Konto werden beim Import automatisch dem Objekt zugeordnet.")}
                </p>
              </div>
              <div>
                <label htmlFor="tenure">{t("Eigentumsverhältnis")}</label>
                <select id="tenure" name="tenure" defaultValue={property.tenure}>
                  <option value="ANGEMIETET">{t("Angemietet – wir sind Zwischenmieter")}</option>
                  <option value="EIGENTUM">{t("Eigentum von Wohnwerk")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="ownerName">{t("Vermieter / Eigentümer")}</label>
                <input id="ownerName" name="ownerName" defaultValue={property.ownerName ?? ""} />
              </div>
              <div>
                <label htmlFor="ownerAddress">{t("Anschrift des Eigentümers")}</label>
                <input id="ownerAddress" name="ownerAddress" defaultValue={property.ownerAddress ?? ""} placeholder={t("Straße Nr., PLZ Ort")} />
                <p className="field-hint">{t("Steht in der Wohnungsgeberbestätigung, wenn wir nicht Eigentümer sind.")}</p>
              </div>
              <div>
                <label htmlFor="ownerContact">{t("Telefon / E-Mail des Eigentümers")}</label>
                <input id="ownerContact" name="ownerContact" defaultValue={property.ownerContact ?? ""} />
              </div>
              <div>
                <label htmlFor="managerName">{t("Betreuung")}</label>
                <input id="managerName" name="managerName" defaultValue={property.managerName ?? ""} />
              </div>
              <div>
                <label htmlFor="managerPhone">{t("Telefon Betreuung")}</label>
                <input id="managerPhone" name="managerPhone" defaultValue={property.managerPhone ?? ""} />
              </div>
              <div>
                <label htmlFor="managerEmail">{t("E-Mail Betreuung")}</label>
                <input id="managerEmail" name="managerEmail" defaultValue={property.managerEmail ?? ""} />
              </div>
              <div>
                <label htmlFor="wifiSsid">{t("WLAN-Name")}</label>
                <input id="wifiSsid" name="wifiSsid" defaultValue={property.wifiSsid ?? ""} />
              </div>
              <div>
                <label htmlFor="wifiPassword">{t("WLAN-Passwort")}</label>
                <input id="wifiPassword" name="wifiPassword" defaultValue={property.wifiPassword ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes">{t("Notizen")}</label>
                <textarea id="notes" name="notes" rows={3} defaultValue={property.notes ?? ""} />
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              {t("Objektdaten speichern")}
            </button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card title={t("Objekt löschen")} description={t("Nur möglich, wenn keine laufenden Mietverhältnisse bestehen.")}>
          <form action={deleteProperty}>
            <input type="hidden" name="id" value={property.id} />
            <ConfirmButton
              message={t("Objekt „{name}“ mit allen Zimmern und Betten wirklich löschen?", { name: property.name })}
            >
              {t("Objekt endgültig löschen")}
            </ConfirmButton>
          </form>
        </Card>
      </div>
    </>
  );
}
