import Link from "next/link";
import { notFound } from "next/navigation";

import { createTenancy, deleteTenant, endTenancy, updateTenancy, updateTenant } from "@/app/actions/tenants";
import { BedPicker, ConfirmButton, Disclosure } from "@/components/interactive";
import { ChargeBadge, ContractBadge, TenancyBadge } from "@/components/status";
import { Card, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { bedOptions } from "@/lib/options";
import { centsToInput, formatCents } from "@/lib/money";
import { formatDate, formatMonth, toDateInput } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return { title: tenant ? `${tenant.firstName} ${tenant.lastName}` : "Mieter" };
}

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const flash = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      tenancies: {
        include: {
          contract: true,
          bed: { include: { room: { include: { property: true } } } },
          charges: {
            include: { allocations: { select: { amountCents: true } } },
            orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
          },
        },
        orderBy: { startDate: "desc" },
      },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });

  if (!tenant) notFound();

  const beds = await bedOptions();

  const openTotal = tenant.tenancies
    .flatMap((tenancy) => tenancy.charges)
    .filter((charge) => charge.status === "OPEN" || charge.status === "PARTIAL")
    .reduce(
      (sum, charge) =>
        sum + charge.amountCents - charge.allocations.reduce((s, a) => s + a.amountCents, 0),
      0,
    );

  return (
    <>
      <PageHeader
        title={`${tenant.firstName} ${tenant.lastName}`}
        description={[tenant.email, tenant.phone, tenant.company].filter(Boolean).join(" · ")}
        breadcrumb={[
          { label: "Mieter", href: "/mieter" },
          { label: `${tenant.firstName} ${tenant.lastName}` },
        ]}
        actions={
          <a href={`mailto:${tenant.email}`} className="btn btn-secondary">
            E-Mail schreiben
          </a>
        }
      />

      <Flash ok={flash.ok} fehler={flash.fehler} />

      {/* --- Mietverhaeltnisse -------------------------------------------- */}
      <Card
        title="Mietverhältnisse"
        description={
          openTotal > 0
            ? `Offene Forderungen: ${formatCents(openTotal)}`
            : "Alle fälligen Mieten sind ausgeglichen."
        }
      >
        {tenant.tenancies.length === 0 ? (
          <p className="text-sm text-ink-500">
            Noch kein Bett zugewiesen. Weisen Sie unten eines zu, um den Vertrag zu erzeugen.
          </p>
        ) : (
          <ul className="space-y-4">
            {tenant.tenancies.map((tenancy) => {
              const openCharges = tenancy.charges.filter(
                (charge) => charge.status === "OPEN" || charge.status === "PARTIAL",
              );

              return (
                <li key={tenancy.id} className="rounded-lg border border-ink-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        <Link
                          href={`/objekte/${tenancy.bed.room.propertyId}`}
                          className="hover:text-brand-700"
                        >
                          {tenancy.bed.room.property.name}
                        </Link>
                        <span className="font-normal text-ink-500">
                          {" "}
                          · {tenancy.bed.room.name} · {tenancy.bed.label}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatDate(tenancy.startDate)} –{" "}
                        {tenancy.endDate ? formatDate(tenancy.endDate) : "unbefristet"} ·{" "}
                        {formatCents(tenancy.monthlyRentCents)} / Monat · Verwendungszweck{" "}
                        <span className="font-mono">{tenancy.reference}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TenancyBadge status={tenancy.status} />
                      {tenancy.contract && <ContractBadge status={tenancy.contract.status} />}
                      {tenancy.contract && (
                        <Link href={`/vertraege/${tenancy.contract.id}`} className="btn btn-secondary">
                          Vertrag öffnen
                        </Link>
                      )}
                    </div>
                  </div>

                  {openCharges.length > 0 && (
                    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {openCharges.length} offene Mietforderung(en):{" "}
                      {openCharges
                        .slice(0, 4)
                        .map((charge) => formatMonth(charge.periodYear, charge.periodMonth))
                        .join(", ")}
                      {openCharges.length > 4 ? " …" : ""}
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    <Disclosure summary="Mietverhältnis bearbeiten">
                      <form action={updateTenancy} className="grid gap-3 sm:grid-cols-3">
                        <input type="hidden" name="id" value={tenancy.id} />
                        <div>
                          <label htmlFor={`start-${tenancy.id}`}>Mietbeginn</label>
                          <input
                            id={`start-${tenancy.id}`}
                            name="startDate"
                            type="date"
                            defaultValue={toDateInput(tenancy.startDate)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`end-${tenancy.id}`}>Mietende</label>
                          <input
                            id={`end-${tenancy.id}`}
                            name="endDate"
                            type="date"
                            defaultValue={toDateInput(tenancy.endDate)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`billing-${tenancy.id}`}>Fällig am</label>
                          <input
                            id={`billing-${tenancy.id}`}
                            name="billingDay"
                            type="number"
                            min={1}
                            max={28}
                            defaultValue={tenancy.billingDay}
                          />
                        </div>
                        <div>
                          <label htmlFor={`rent-${tenancy.id}`}>Miete / Monat</label>
                          <input
                            id={`rent-${tenancy.id}`}
                            name="monthlyRentCents"
                            inputMode="decimal"
                            defaultValue={centsToInput(tenancy.monthlyRentCents)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`util-${tenancy.id}`}>davon Nebenkosten</label>
                          <input
                            id={`util-${tenancy.id}`}
                            name="utilitiesCents"
                            inputMode="decimal"
                            defaultValue={centsToInput(tenancy.utilitiesCents)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`deposit-${tenancy.id}`}>Kaution</label>
                          <input
                            id={`deposit-${tenancy.id}`}
                            name="depositCents"
                            inputMode="decimal"
                            defaultValue={centsToInput(tenancy.depositCents)}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label htmlFor={`tnotes-${tenancy.id}`}>Notiz</label>
                          <input
                            id={`tnotes-${tenancy.id}`}
                            name="notes"
                            defaultValue={tenancy.notes ?? ""}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <button type="submit" className="btn btn-primary">
                            Speichern
                          </button>
                        </div>
                      </form>
                    </Disclosure>

                    {tenancy.status !== "ENDED" && tenancy.status !== "CANCELLED" && (
                      <Disclosure summary="Mietverhältnis beenden">
                        <form action={endTenancy} className="flex flex-wrap items-end gap-3">
                          <input type="hidden" name="id" value={tenancy.id} />
                          <div className="w-48">
                            <label htmlFor={`endat-${tenancy.id}`}>Auszug am</label>
                            <input
                              id={`endat-${tenancy.id}`}
                              name="endDate"
                              type="date"
                              defaultValue={toDateInput(new Date())}
                            />
                          </div>
                          <ConfirmButton
                            message="Mietverhältnis wirklich beenden? Das Bett wird danach wieder als frei geführt."
                            className="btn btn-secondary"
                          >
                            Beenden
                          </ConfirmButton>
                        </form>
                      </Disclosure>
                    )}

                    {tenancy.charges.length > 0 && (
                      <Disclosure summary={`Mietkonto (${tenancy.charges.length} Monate)`}>
                        <Table>
                          <thead>
                            <tr>
                              <Th>Monat</Th>
                              <Th>Fällig</Th>
                              <Th align="right">Soll</Th>
                              <Th align="right">Bezahlt</Th>
                              <Th align="right">Status</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {tenancy.charges.map((charge) => {
                              const paid = charge.allocations.reduce((s, a) => s + a.amountCents, 0);
                              return (
                                <tr key={charge.id}>
                                  <Td>{formatMonth(charge.periodYear, charge.periodMonth)}</Td>
                                  <Td className="text-ink-600">{formatDate(charge.dueDate)}</Td>
                                  <Td align="right" className="tabular-nums">
                                    {formatCents(charge.amountCents)}
                                  </Td>
                                  <Td align="right" className="tabular-nums">
                                    {formatCents(paid)}
                                  </Td>
                                  <Td align="right">
                                    <ChargeBadge status={charge.status} />
                                  </Td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </Disclosure>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 border-t border-ink-200 pt-4">
          <Disclosure summary="Weiteres Bett zuweisen">
            <form action={createTenancy} className="space-y-4">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <BedPicker beds={beds} required rentFieldId="newTenancyRent" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="newStart">Mietbeginn *</label>
                  <input
                    id="newStart"
                    name="startDate"
                    type="date"
                    required
                    defaultValue={toDateInput(new Date())}
                  />
                </div>
                <div>
                  <label htmlFor="newEnd">Mietende</label>
                  <input id="newEnd" name="endDate" type="date" />
                </div>
                <div>
                  <label htmlFor="newBillingDay">Fällig am</label>
                  <input
                    id="newBillingDay"
                    name="billingDay"
                    type="number"
                    min={1}
                    max={28}
                    defaultValue={1}
                  />
                </div>
                <div>
                  <label htmlFor="newTenancyRent">Miete / Monat</label>
                  <input id="newTenancyRent" name="monthlyRentCents" inputMode="decimal" />
                </div>
                <div>
                  <label htmlFor="newUtilities">davon Nebenkosten</label>
                  <input id="newUtilities" name="utilitiesCents" inputMode="decimal" defaultValue="0,00" />
                </div>
                <div>
                  <label htmlFor="newDeposit">Kaution</label>
                  <input id="newDeposit" name="depositCents" inputMode="decimal" defaultValue="0,00" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">
                Bett zuweisen und Vertrag erzeugen
              </button>
            </form>
          </Disclosure>
        </div>
      </Card>

      {/* --- Dokumente ----------------------------------------------------- */}
      {tenant.documents.length > 0 && (
        <div className="mt-6">
          <Card title="Dokumente" padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Titel</Th>
                  <Th>Datum</Th>
                  <Th>Ablage</Th>
                </tr>
              </thead>
              <tbody>
                {tenant.documents.map((document) => (
                  <tr key={document.id}>
                    <Td>{document.title}</Td>
                    <Td className="text-ink-600">
                      {formatDate(document.documentDate ?? document.uploadedAt)}
                    </Td>
                    <Td>
                      {document.driveUrl ? (
                        <a
                          href={document.driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-700 hover:underline"
                        >
                          Öffnen
                        </a>
                      ) : (
                        <span className="text-ink-500">–</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}

      {/* --- Stammdaten ---------------------------------------------------- */}
      <div className="mt-6">
        <Card title="Stammdaten bearbeiten">
          <form action={updateTenant} className="space-y-4">
            <input type="hidden" name="id" value={tenant.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName">Vorname</label>
                <input id="firstName" name="firstName" defaultValue={tenant.firstName} required />
              </div>
              <div>
                <label htmlFor="lastName">Nachname</label>
                <input id="lastName" name="lastName" defaultValue={tenant.lastName} required />
              </div>
              <div>
                <label htmlFor="email">E-Mail</label>
                <input id="email" name="email" type="email" defaultValue={tenant.email} required />
              </div>
              <div>
                <label htmlFor="phone">Telefon</label>
                <input id="phone" name="phone" defaultValue={tenant.phone ?? ""} />
              </div>
              <div>
                <label htmlFor="birthDate">Geburtsdatum</label>
                <input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  defaultValue={toDateInput(tenant.birthDate)}
                />
              </div>
              <div>
                <label htmlFor="nationality">Staatsangehörigkeit</label>
                <input id="nationality" name="nationality" defaultValue={tenant.nationality ?? ""} />
              </div>
              <div>
                <label htmlFor="idType">Ausweisart</label>
                <select id="idType" name="idType" defaultValue={tenant.idType ?? ""}>
                  <option value="">– keine Angabe –</option>
                  <option value="Personalausweis">Personalausweis</option>
                  <option value="Reisepass">Reisepass</option>
                  <option value="Aufenthaltstitel">Aufenthaltstitel</option>
                </select>
              </div>
              <div>
                <label htmlFor="idNumber">Ausweisnummer</label>
                <input id="idNumber" name="idNumber" defaultValue={tenant.idNumber ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="street">Straße (Meldeanschrift)</label>
                <input id="street" name="street" defaultValue={tenant.street ?? ""} />
              </div>
              <div>
                <label htmlFor="zip">PLZ</label>
                <input id="zip" name="zip" defaultValue={tenant.zip ?? ""} />
              </div>
              <div>
                <label htmlFor="city">Ort</label>
                <input id="city" name="city" defaultValue={tenant.city ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="country">Land</label>
                <input id="country" name="country" defaultValue={tenant.country ?? "Deutschland"} />
              </div>
              <div>
                <label htmlFor="company">Firma</label>
                <input id="company" name="company" defaultValue={tenant.company ?? ""} />
              </div>
              <div>
                <label htmlFor="companyVatId">USt-IdNr.</label>
                <input id="companyVatId" name="companyVatId" defaultValue={tenant.companyVatId ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="companyStreet">Firmenstraße</label>
                <input id="companyStreet" name="companyStreet" defaultValue={tenant.companyStreet ?? ""} />
              </div>
              <div>
                <label htmlFor="companyZip">Firmen-PLZ</label>
                <input id="companyZip" name="companyZip" defaultValue={tenant.companyZip ?? ""} />
              </div>
              <div>
                <label htmlFor="companyCity">Firmenort</label>
                <input id="companyCity" name="companyCity" defaultValue={tenant.companyCity ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes">Notizen</label>
                <textarea id="notes" name="notes" rows={3} defaultValue={tenant.notes ?? ""} />
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              Stammdaten speichern
            </button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Mieter löschen" description="Nur möglich, wenn kein laufendes Mietverhältnis besteht.">
          <form action={deleteTenant}>
            <input type="hidden" name="id" value={tenant.id} />
            <ConfirmButton
              message={`${tenant.firstName} ${tenant.lastName} wirklich löschen? Verträge und Mietkonto werden mitgelöscht.`}
            >
              Mieter endgültig löschen
            </ConfirmButton>
          </form>
        </Card>
      </div>
    </>
  );
}
