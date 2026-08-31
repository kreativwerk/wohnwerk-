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
import { BedBadge } from "@/components/status";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { Alert, Card, EmptyState, Flash, Meter, PageHeader, StatCard } from "@/components/ui";
import { PropertyTemplates } from "@/components/template-card";
import { PropertyCosts } from "@/components/cost-card";
import { prisma } from "@/lib/db";
import { bedOccupancy, occupancySummary } from "@/lib/tenancy";
import { centsToInput, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";

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

  return (
    <>
      <PageHeader
        title={property.active ? property.name : `${property.name} (inaktiv)`}
        description={`${property.street}, ${property.zip} ${property.city}`}
        breadcrumb={[{ label: "Objekte", href: "/objekte" }, { label: property.name }]}
        actions={
          <>
            <form action={togglePropertyActive}>
              <input type="hidden" name="id" value={property.id} />
              {property.active ? (
                <ConfirmButton
                  className="btn btn-secondary"
                  message={`„${property.name}“ inaktiv stellen? Es verschwindet aus Belegungsplan, Bettauswahl und Kennzahlen – Buchhaltung und Historie bleiben erhalten.`}
                >
                  Inaktiv stellen
                </ConfirmButton>
              ) : (
                <button type="submit" className="btn btn-primary">
                  Wieder aktivieren
                </button>
              )}
            </form>
            <Link href={`/belegung?objekt=${property.id}`} className="btn btn-secondary">
              Belegungsplan
            </Link>
          </>
        }
      />

      <Flash ok={flash.ok} fehler={flash.fehler} />

      {!property.active && (
        <div className="mb-5">
          <Alert tone="warning" title="Dieses Objekt ist inaktiv">
            Es erscheint nicht mehr im Belegungsplan, in der Bettauswahl für neue Mieter und in
            den Kennzahlen. Alle Buchungen, Verträge und Dokumente bleiben erhalten. Über
            „Wieder aktivieren“ kommt es jederzeit zurück.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Zimmer" value={String(property.rooms.length)} />
        <StatCard label="Betten" value={String(summary.beds)} hint={`${summary.blocked} gesperrt`} />
        <StatCard
          label="Belegt"
          value={`${summary.occupied} / ${summary.beds - summary.blocked}`}
          tone={summary.rate >= 0.8 ? "success" : summary.rate >= 0.5 ? "warning" : "danger"}
        />
        <StatCard
          label="Miete / Monat"
          value={formatCents(summary.actualRentCents)}
          hint={`max. ${formatCents(summary.potentialRentCents)}`}
          tone="brand"
        />
      </div>

      <div className="mt-4">
        <Meter
          value={summary.rate}
          tone={summary.rate >= 0.8 ? "success" : summary.rate >= 0.5 ? "warning" : "danger"}
        />
      </div>

      {/* --- Zimmer und Betten ------------------------------------------- */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Zimmer und Betten</h2>
        </div>

        {property.rooms.length === 0 ? (
          <EmptyState
            title="Noch keine Zimmer"
            description="Legen Sie unten das erste Zimmer an. Die Betten können Sie direkt mit erzeugen."
          />
        ) : (
          <div className="space-y-4">
            {property.rooms.map((room) => {
              const occupiedInRoom = room.beds.filter((bed) => occupancy.get(bed.id)?.occupied).length;

              return (
                <Card
                  key={room.id}
                  title={room.name}
                  description={[
                    room.floor,
                    room.sizeSqm ? `${room.sizeSqm} m²` : null,
                    `${room.beds.length} Bett(en), ${occupiedInRoom} belegt`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  {room.beds.length === 0 ? (
                    <p className="mb-4 text-sm text-ink-500">
                      In diesem Zimmer ist noch kein Bett angelegt.
                    </p>
                  ) : (
                    <ul className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {room.beds.map((bed) => {
                        const state = occupancy.get(bed.id);
                        const frei = !state?.occupied && bed.status !== "BLOCKED";
                        return (
                          <li
                            key={bed.id}
                            className={`rounded-lg border p-3.5 ${
                              frei
                                ? "border-amber-300 bg-amber-50"
                                : "border-ink-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink-900">{bed.label}</p>
                                <p className="text-xs tabular-nums text-ink-500">
                                  {formatCents(bed.monthlyRentCents)} / Monat
                                </p>
                              </div>
                              <BedBadge
                                occupied={Boolean(state?.occupied)}
                                blocked={bed.status === "BLOCKED"}
                              />
                            </div>

                            {state?.tenancy ? (
                              <p className="mt-2 text-xs text-ink-600">
                                <Link
                                  href={`/mieter/${state.tenancy.tenantId}`}
                                  className="font-medium hover:text-brand-700"
                                >
                                  {state.tenancy.tenantName}
                                </Link>
                                <br />
                                seit {formatDate(state.tenancy.startDate)}
                                {state.tenancy.endDate ? ` bis ${formatDate(state.tenancy.endDate)}` : ""}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-ink-500">Kein Mietverhältnis</p>
                            )}

                            {bed.notes && <p className="mt-2 text-xs text-ink-500">{bed.notes}</p>}

                            <div className="mt-3">
                              <Disclosure summary="Bearbeiten">
                                <form action={updateBed} className="space-y-3">
                                  <input type="hidden" name="id" value={bed.id} />
                                  <input type="hidden" name="propertyId" value={property.id} />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <label htmlFor={`label-${bed.id}`}>Bezeichnung</label>
                                      <input
                                        id={`label-${bed.id}`}
                                        name="label"
                                        defaultValue={bed.label}
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label htmlFor={`rent-${bed.id}`}>Miete / Monat</label>
                                      <input
                                        id={`rent-${bed.id}`}
                                        name="monthlyRentCents"
                                        defaultValue={centsToInput(bed.monthlyRentCents)}
                                        inputMode="decimal"
                                      />
                                    </div>
                                    <div>
                                      <label htmlFor={`status-${bed.id}`}>Status</label>
                                      <select
                                        id={`status-${bed.id}`}
                                        name="status"
                                        defaultValue={bed.status}
                                      >
                                        <option value="FREE">Vermietbar</option>
                                        <option value="BLOCKED">Gesperrt</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label htmlFor={`notes-${bed.id}`}>Notiz</label>
                                      <input
                                        id={`notes-${bed.id}`}
                                        name="notes"
                                        defaultValue={bed.notes ?? ""}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button type="submit" className="btn btn-primary">
                                      Speichern
                                    </button>
                                  </div>
                                </form>

                                <form action={deleteBed} className="mt-2">
                                  <input type="hidden" name="id" value={bed.id} />
                                  <input type="hidden" name="propertyId" value={property.id} />
                                  <ConfirmButton message={`„${bed.label}“ wirklich löschen?`}>
                                    Bett löschen
                                  </ConfirmButton>
                                </form>
                              </Disclosure>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="space-y-3 border-t border-ink-200 pt-4">
                    <Disclosure summary="Bett hinzufügen">
                      <form action={createBed} className="grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="roomId" value={room.id} />
                        <input type="hidden" name="propertyId" value={property.id} />
                        <div>
                          <label htmlFor={`newbed-label-${room.id}`}>Bezeichnung</label>
                          <input
                            id={`newbed-label-${room.id}`}
                            name="label"
                            placeholder={`Bett ${String.fromCharCode(65 + room.beds.length)}`}
                          />
                        </div>
                        <div>
                          <label htmlFor={`newbed-rent-${room.id}`}>Miete / Monat</label>
                          <input
                            id={`newbed-rent-${room.id}`}
                            name="monthlyRentCents"
                            defaultValue={centsToInput(room.defaultBedRentCents)}
                            inputMode="decimal"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor={`newbed-notes-${room.id}`}>Notiz</label>
                          <input id={`newbed-notes-${room.id}`} name="notes" />
                        </div>
                        <div className="sm:col-span-4">
                          <button type="submit" className="btn btn-primary">
                            Bett anlegen
                          </button>
                        </div>
                      </form>
                    </Disclosure>

                    <Disclosure summary="Zimmer bearbeiten">
                      <form action={updateRoom} className="grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="id" value={room.id} />
                        <input type="hidden" name="propertyId" value={property.id} />
                        <div>
                          <label htmlFor={`room-name-${room.id}`}>Bezeichnung</label>
                          <input id={`room-name-${room.id}`} name="name" defaultValue={room.name} required />
                        </div>
                        <div>
                          <label htmlFor={`room-floor-${room.id}`}>Etage</label>
                          <input id={`room-floor-${room.id}`} name="floor" defaultValue={room.floor ?? ""} />
                        </div>
                        <div>
                          <label htmlFor={`room-size-${room.id}`}>Größe (m²)</label>
                          <input
                            id={`room-size-${room.id}`}
                            name="sizeSqm"
                            defaultValue={room.sizeSqm ?? ""}
                            inputMode="decimal"
                          />
                        </div>
                        <div>
                          <label htmlFor={`room-rent-${room.id}`}>Standardmiete je Bett</label>
                          <input
                            id={`room-rent-${room.id}`}
                            name="defaultBedRentCents"
                            defaultValue={centsToInput(room.defaultBedRentCents)}
                            inputMode="decimal"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <label htmlFor={`room-notes-${room.id}`}>Notiz</label>
                          <input id={`room-notes-${room.id}`} name="notes" defaultValue={room.notes ?? ""} />
                        </div>
                        <div className="flex gap-2 sm:col-span-4">
                          <button type="submit" className="btn btn-primary">
                            Zimmer speichern
                          </button>
                        </div>
                      </form>

                      <form action={deleteRoom} className="mt-2">
                        <input type="hidden" name="id" value={room.id} />
                        <input type="hidden" name="propertyId" value={property.id} />
                        <ConfirmButton
                          message={`Zimmer „${room.name}“ mit allen Betten wirklich löschen?`}
                        >
                          Zimmer löschen
                        </ConfirmButton>
                      </form>
                    </Disclosure>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Neues Zimmer -------------------------------------------------- */}
      <div className="mt-6">
        <Card
          title="Zimmer hinzufügen"
          description="Betten können direkt mit angelegt werden – das spart den zweiten Schritt."
        >
          <form action={createRoom} className="grid gap-4 sm:grid-cols-5">
            <input type="hidden" name="propertyId" value={property.id} />
            <div className="sm:col-span-2">
              <label htmlFor="new-room-name">Bezeichnung *</label>
              <input id="new-room-name" name="name" required placeholder="Zimmer 1" />
            </div>
            <div>
              <label htmlFor="new-room-floor">Etage</label>
              <input id="new-room-floor" name="floor" placeholder="EG" />
            </div>
            <div>
              <label htmlFor="new-room-size">Größe (m²)</label>
              <input id="new-room-size" name="sizeSqm" inputMode="decimal" />
            </div>
            <div>
              <label htmlFor="new-room-beds">Betten anlegen</label>
              <input
                id="new-room-beds"
                name="bedCount"
                type="number"
                min={0}
                max={20}
                defaultValue={2}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="new-room-rent">Miete je Bett / Monat</label>
              <input id="new-room-rent" name="defaultBedRentCents" defaultValue="350,00" inputMode="decimal" />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="new-room-notes">Notiz</label>
              <input id="new-room-notes" name="notes" />
            </div>
            <div className="sm:col-span-5">
              <button type="submit" className="btn btn-primary">
                Zimmer anlegen
              </button>
            </div>
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
        <Card title="Objektdaten bearbeiten">
          <form action={updateProperty} className="space-y-4">
            <input type="hidden" name="id" value={property.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name">Bezeichnung</label>
                <input id="name" name="name" defaultValue={property.name} required />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="street">Straße und Hausnummer</label>
                <input id="street" name="street" defaultValue={property.street} required />
              </div>
              <div>
                <label htmlFor="zip">PLZ</label>
                <input id="zip" name="zip" defaultValue={property.zip} required />
              </div>
              <div>
                <label htmlFor="city">Ort</label>
                <input id="city" name="city" defaultValue={property.city} required />
              </div>
              <div>
                <label htmlFor="country">Land</label>
                <input id="country" name="country" defaultValue={property.country} />
              </div>
              <div>
                <label htmlFor="shortCode">Kürzel</label>
                <input id="shortCode" name="shortCode" defaultValue={property.shortCode ?? ""} />
              </div>
              <div>
                <label htmlFor="bankAccountId">Bankkonto des Objekts</label>
                <select id="bankAccountId" name="bankAccountId" defaultValue={property.bankAccountId ?? ""}>
                  <option value="">– kein Konto zugeordnet –</option>
                  {bankAccounts.map((konto) => (
                    <option key={konto.id} value={konto.id}>
                      {konto.name} · {konto.iban}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  Eingänge auf diesem Konto werden beim Import automatisch dem Objekt zugeordnet.
                </p>
              </div>
              <div>
                <label htmlFor="tenure">Eigentumsverhältnis</label>
                <select id="tenure" name="tenure" defaultValue={property.tenure}>
                  <option value="ANGEMIETET">Angemietet – wir sind Zwischenmieter</option>
                  <option value="EIGENTUM">Eigentum von Wohnwerk</option>
                </select>
              </div>
              <div>
                <label htmlFor="ownerName">Vermieter / Eigentümer</label>
                <input id="ownerName" name="ownerName" defaultValue={property.ownerName ?? ""} />
              </div>
              <div>
                <label htmlFor="managerName">Betreuung</label>
                <input id="managerName" name="managerName" defaultValue={property.managerName ?? ""} />
              </div>
              <div>
                <label htmlFor="managerPhone">Telefon Betreuung</label>
                <input id="managerPhone" name="managerPhone" defaultValue={property.managerPhone ?? ""} />
              </div>
              <div>
                <label htmlFor="managerEmail">E-Mail Betreuung</label>
                <input id="managerEmail" name="managerEmail" defaultValue={property.managerEmail ?? ""} />
              </div>
              <div>
                <label htmlFor="wifiSsid">WLAN-Name</label>
                <input id="wifiSsid" name="wifiSsid" defaultValue={property.wifiSsid ?? ""} />
              </div>
              <div>
                <label htmlFor="wifiPassword">WLAN-Passwort</label>
                <input id="wifiPassword" name="wifiPassword" defaultValue={property.wifiPassword ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes">Notizen</label>
                <textarea id="notes" name="notes" rows={3} defaultValue={property.notes ?? ""} />
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              Objektdaten speichern
            </button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Objekt löschen" description="Nur möglich, wenn keine laufenden Mietverhältnisse bestehen.">
          <form action={deleteProperty}>
            <input type="hidden" name="id" value={property.id} />
            <ConfirmButton
              message={`Objekt „${property.name}“ mit allen Zimmern und Betten wirklich löschen?`}
            >
              Objekt endgültig löschen
            </ConfirmButton>
          </form>
        </Card>
      </div>
    </>
  );
}
