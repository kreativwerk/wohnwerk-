import Link from "next/link";
import { notFound } from "next/navigation";

import { createTenancy, deleteTenancy, deleteTenant, endTenancy, moveTenancy, updateTenancy, updateTenant } from "@/app/actions/tenants";
import { createContractForTenancy, toggleTenantFormer } from "@/app/actions/contracts";
import { BedPicker, ConfirmButton, Disclosure } from "@/components/interactive";
import { ChargeBadge, ContractBadge, TenancyBadge } from "@/components/status";
import { Badge, Card, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { bedOptions } from "@/lib/options";
import { centsToInput } from "@/lib/money";
import { toDateInput } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";
import { oberflaeche, type Uebersetzen } from "@/lib/i18n";

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
  const { t, datum, monat, geld } = await oberflaeche();
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

  // Das laufende Mietverhaeltnis - das, was man beim Oeffnen wissen will.
  // Ein Entwurf zaehlt mit: das Bett ist damit schon vergeben, nur der
  // Vertrag noch nicht unterwegs.
  const aktuell =
    ["ACTIVE", "SENT", "DRAFT"]
      .map((status) => tenant.tenancies.find((ty) => ty.status === status))
      .find(Boolean) ?? null;
  // Ohne laufendes Mietverhaeltnis steht das Zuweisungsformular ganz oben.
  const formularOben = !aktuell && tenant.status !== "EHEMALIG";

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
        title={
          tenant.status === "EHEMALIG"
            ? `${tenant.firstName} ${tenant.lastName} (ehemalig)`
            : `${tenant.firstName} ${tenant.lastName}`
        }
        description={[tenant.email, tenant.phone, tenant.company].filter(Boolean).join(" · ")}
        breadcrumb={[
          { label: t("Mieter"), href: "/mieter" },
          { label: `${tenant.firstName} ${tenant.lastName}` },
        ]}
        actions={
          <>
            <form action={toggleTenantFormer}>
              <input type="hidden" name="tenantId" value={tenant.id} />
              <input type="hidden" name="back" value={`/mieter/${tenant.id}`} />
              <button type="submit" className="btn btn-secondary">
                {tenant.status === "EHEMALIG" ? t("Wieder aktiv setzen") : t("Als ehemalig markieren")}
              </button>
            </form>
            <a href={`mailto:${tenant.email}`} className="btn btn-secondary">
              {t("E-Mail schreiben")}
            </a>
          </>
        }
      />

      <Flash ok={flash.ok} fehler={flash.fehler} />

      {/* --- Unterkunft ------------------------------------------------------
          Ganz oben, weil es die erste Frage ist: Wo wohnt die Person? Ohne
          Bett steht hier gleich das Formular, statt versteckt weiter unten. */}
      <div className="mb-6">
        {aktuell ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  {t("Unterkunft")}
                </p>
                <p className="mt-1 text-[1.25rem] font-semibold leading-tight text-ink-900">
                  <Link href={`/objekte/${aktuell.bed.room.propertyId}`} className="hover:text-brand-700">
                    {aktuell.bed.room.property.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-[0.95rem] text-ink-700">
                  {aktuell.bed.room.name} · {aktuell.bed.label}
                </p>
                <p className="mt-1 text-[0.8rem] text-ink-500">
                  {t("{betrag} / Monat", { betrag: geld(aktuell.monthlyRentCents) })} · {t("seit {datum}", { datum: datum(aktuell.startDate) })}
                  {aktuell.endDate && ` · ${t("bis {datum}", { datum: datum(aktuell.endDate) })}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TenancyBadge status={aktuell.status} />
                <a href="#mietverhaeltnisse" className="btn btn-ghost btn-sm">
                  {t("Ändern")}
                </a>
              </div>
            </div>
          </Card>
        ) : !formularOben ? null : (
          <Card
            title={t("Bett zuweisen")}
            description={t("Diese Person hat noch keine Unterkunft. Objekt, Zimmer und Bett wählen – der Vertragsentwurf entsteht dabei.")}
          >
            <BettZuweisen tenantId={tenant.id} beds={beds} t={t} prefix="oben" />
          </Card>
        )}
      </div>

      {/* --- Mietverhaeltnisse -------------------------------------------- */}
      <Card
        id="mietverhaeltnisse"
        className="scroll-mt-4"
        title={t("Mietverhältnisse")}
        description={
          openTotal > 0
            ? t("Offene Forderungen: {betrag}", { betrag: geld(openTotal) })
            : t("Alle fälligen Mieten sind ausgeglichen.")
        }
      >
        {tenant.tenancies.length === 0 ? (
          <p className="text-sm text-ink-500">
            {t("Noch kein Bett zugewiesen. Weisen Sie unten eines zu, um den Vertrag zu erzeugen.")}
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
                        {datum(tenancy.startDate)} –{" "}
                        {tenancy.endDate ? datum(tenancy.endDate) : "unbefristet"} ·{" "}
                        {t("{betrag} / Monat · Verwendungszweck", { betrag: geld(tenancy.monthlyRentCents) })}{" "}
                        <span className="font-mono">{tenancy.reference}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TenancyBadge status={tenancy.status} />
                      {tenancy.contract ? (
                        <>
                          <ContractBadge status={tenancy.contract.status} />
                          <Link
                            href={`/vertraege/${tenancy.contract.id}`}
                            className="btn btn-secondary"
                          >
                            {t("Vertrag öffnen")}
                          </Link>
                        </>
                      ) : (
                        <Badge tone="danger">{t("Mietvertrag fehlt")}</Badge>
                      )}
                    </div>
                  </div>

                  {!tenancy.contract && (
                    <div className="mt-3 rounded-md bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                      <p>
                        {t("Zu diesem Mietverhältnis ist kein Mietvertrag hinterlegt. Liegt der unterschriebene Vertrag als Scan vor, ordnen Sie ihn in der")}{" "}
                        <Link href="/vertraege/ablage" className="font-semibold underline">
                          {t("Vertragsablage")}
                        </Link>{" "}
                        {t("zu – andernfalls legen Sie hier einen neuen Vertrag an.")}
                      </p>
                      <form action={createContractForTenancy} className="mt-2">
                        <input type="hidden" name="tenancyId" value={tenancy.id} />
                        <input type="hidden" name="back" value={`/mieter/${tenant.id}`} />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          {t("Vertrag anlegen")}
                        </button>
                      </form>
                    </div>
                  )}

                  {openCharges.length > 0 && (
                    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {openCharges.length} offene Mietforderung(en):{" "}
                      {openCharges
                        .slice(0, 4)
                        .map((charge) => monat(charge.periodYear, charge.periodMonth))
                        .join(", ")}
                      {openCharges.length > 4 ? " …" : ""}
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    <Disclosure summary={t("Mietverhältnis bearbeiten")}>
                      <form action={updateTenancy} className="grid gap-3 sm:grid-cols-3">
                        <input type="hidden" name="id" value={tenancy.id} />
                        <div>
                          <label htmlFor={`start-${tenancy.id}`}>{t("Mietbeginn")}</label>
                          <input
                            id={`start-${tenancy.id}`}
                            name="startDate"
                            type="date"
                            defaultValue={toDateInput(tenancy.startDate)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`end-${tenancy.id}`}>{t("Mietende")}</label>
                          <input
                            id={`end-${tenancy.id}`}
                            name="endDate"
                            type="date"
                            defaultValue={toDateInput(tenancy.endDate)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`billing-${tenancy.id}`}>{t("Fällig am")}</label>
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
                          <label htmlFor={`rent-${tenancy.id}`}>{t("Miete / Monat")}</label>
                          <input
                            id={`rent-${tenancy.id}`}
                            name="monthlyRentCents"
                            inputMode="decimal"
                            defaultValue={centsToInput(tenancy.monthlyRentCents)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`util-${tenancy.id}`}>{t("davon Nebenkosten")}</label>
                          <input
                            id={`util-${tenancy.id}`}
                            name="utilitiesCents"
                            inputMode="decimal"
                            defaultValue={centsToInput(tenancy.utilitiesCents)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`deposit-${tenancy.id}`}>{t("Kaution")}</label>
                          <input
                            id={`deposit-${tenancy.id}`}
                            name="depositCents"
                            inputMode="decimal"
                            defaultValue={centsToInput(tenancy.depositCents)}
                          />
                          <p className="field-hint">{t("0,00 = keine Kaution; eine offene Kautionsforderung wird dann entfernt")}</p>
                        </div>
                        <div className="sm:col-span-3">
                          <label htmlFor={`tnotes-${tenancy.id}`}>{t("Notiz")}</label>
                          <input
                            id={`tnotes-${tenancy.id}`}
                            name="notes"
                            defaultValue={tenancy.notes ?? ""}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <button type="submit" className="btn btn-primary">
                            {t("Speichern")}
                          </button>
                        </div>
                      </form>
                    </Disclosure>

                    {/* Anderes Bett, gleiche Konditionen: nur der Schlafplatz
                        wechselt, Vertrag und Forderungen bleiben. */}
                    {tenancy.status !== "ENDED" && tenancy.status !== "CANCELLED" && (
                      <Disclosure summary={t("Bett wechseln")}>
                        <form action={moveTenancy} className="space-y-3">
                          <input type="hidden" name="id" value={tenancy.id} />
                          <p className="text-sm text-ink-600">
                            {t("Umzug in ein anderes Bett, auch in eine andere Wohnung. Beginn, Miete, Kaution, Vertrag und Forderungen bleiben unverändert.")}
                          </p>
                          <BedPicker beds={beds} required rentFieldId="" idPrefix={`wechsel-${tenancy.id}-`} />
                          <button type="submit" className="btn btn-secondary">
                            {t("Umziehen")}
                          </button>
                        </form>
                      </Disclosure>
                    )}

                    {tenancy.status !== "ENDED" && tenancy.status !== "CANCELLED" && (
                      <Disclosure summary={t("Mietverhältnis beenden")}>
                        <form action={endTenancy} className="flex flex-wrap items-end gap-3">
                          <input type="hidden" name="id" value={tenancy.id} />
                          <div className="w-48">
                            <label htmlFor={`endat-${tenancy.id}`}>{t("Auszug am")}</label>
                            <input
                              id={`endat-${tenancy.id}`}
                              name="endDate"
                              type="date"
                              defaultValue={toDateInput(new Date())}
                            />
                          </div>
                          <ConfirmButton
                            message={t("Mietverhältnis wirklich beenden? Das Bett wird danach wieder als frei geführt.")}
                            className="btn btn-secondary"
                          >
                            {t("Beenden")}
                          </ConfirmButton>
                        </form>
                      </Disclosure>
                    )}

                    {/* Falsch platziert? Solange nichts unterschrieben und
                        nichts bezahlt ist, darf das Mietverhaeltnis weg. */}
                    {(tenancy.status === "DRAFT" || tenancy.status === "SENT") &&
                      tenancy.contract?.status !== "SIGNED" &&
                      !tenancy.charges.some((c) => c.status === "PAID" || c.allocations.length > 0) && (
                        <Disclosure summary={t("Mietverhältnis löschen")}>
                          <form action={deleteTenancy} className="flex flex-wrap items-center gap-3">
                            <input type="hidden" name="id" value={tenancy.id} />
                            <p className="text-sm text-ink-600">
                              {t("Für Versehen: falsches Bett oder falsche Person. Vertragsentwurf und offene Forderungen werden mit entfernt, das Bett ist danach wieder frei.")}
                            </p>
                            <ConfirmButton
                              message={t("Mietverhältnis {bett} wirklich löschen? Vertragsentwurf und Forderungen gehen mit.", { bett: `${tenancy.bed.room.name} · ${tenancy.bed.label}` })}
                              className="btn btn-danger"
                            >
                              {t("Löschen")}
                            </ConfirmButton>
                          </form>
                        </Disclosure>
                      )}

                    {tenancy.charges.length > 0 && (
                      <Disclosure summary={`Mietkonto (${tenancy.charges.length} Monate)`}>
                        <Table>
                          <thead>
                            <tr>
                              <Th>{t("Monat")}</Th>
                              <Th>{t("Fällig")}</Th>
                              <Th align="right">{t("Soll")}</Th>
                              <Th align="right">{t("Bezahlt")}</Th>
                              <Th align="right">{t("Status")}</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {tenancy.charges.map((charge) => {
                              const paid = charge.allocations.reduce((s, a) => s + a.amountCents, 0);
                              return (
                                <tr key={charge.id}>
                                  <Td>{monat(charge.periodYear, charge.periodMonth)}</Td>
                                  <Td className="text-ink-600">{datum(charge.dueDate)}</Td>
                                  <Td align="right" className="tabular-nums">
                                    {geld(charge.amountCents)}
                                  </Td>
                                  <Td align="right" className="tabular-nums">
                                    {geld(paid)}
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

        {/* Steht das Formular schon oben, waere es hier nur ein Doppel. */}
        {!formularOben && (
          <div className="mt-5 border-t border-ink-200 pt-4">
            <Disclosure summary={t("Weiteres Bett zuweisen")}>
              <BettZuweisen tenantId={tenant.id} beds={beds} t={t} prefix="unten" />
            </Disclosure>
          </div>
        )}
      </Card>

      {/* --- Dokumente ----------------------------------------------------- */}
      {tenant.documents.length > 0 && (
        <div className="mt-6">
          <Card title={t("Dokumente")} padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>{t("Titel")}</Th>
                  <Th>{t("Datum")}</Th>
                  <Th>{t("Ablage")}</Th>
                </tr>
              </thead>
              <tbody>
                {tenant.documents.map((document) => (
                  <tr key={document.id}>
                    <Td>
                      {document.title}
                      {document.kind === "CONTRACT" && (
                        <span className="ml-2">
                          <Badge tone="brand">{t("Mietvertrag")}</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-ink-600">
                      {datum(document.documentDate ?? document.uploadedAt)}
                    </Td>
                    <Td>
                      {document.driveUrl ? (
                        <a
                          href={document.driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-700 hover:underline"
                        >
                          {t("Öffnen")}
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
        <Card title={t("Stammdaten bearbeiten")}>
          <form action={updateTenant} className="space-y-4">
            <input type="hidden" name="id" value={tenant.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <p className="sm:col-span-2 border-b border-ink-200/70 pb-1.5 pt-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                {t("Person")}
              </p>
              <div>
                <label htmlFor="firstName">{t("Vorname")}</label>
                <input id="firstName" name="firstName" defaultValue={tenant.firstName} required />
              </div>
              <div>
                <label htmlFor="lastName">{t("Nachname")}</label>
                <input id="lastName" name="lastName" defaultValue={tenant.lastName} />
              </div>
              <div>
                <label htmlFor="email">{t("E-Mail")}</label>
                <input id="email" name="email" type="email" defaultValue={tenant.email} />
              </div>
              <div>
                <label htmlFor="privateEmail">{t("E-Mail privat")}</label>
                <input id="privateEmail" name="privateEmail" type="email" defaultValue={tenant.privateEmail ?? ""} />
              </div>
              <div>
                <label htmlFor="phone">{t("Telefon")}</label>
                <input id="phone" name="phone" type="tel" defaultValue={tenant.phone ?? ""} />
                <p className="field-hint">
                  {t("Mit Landesvorwahl, z. B. +49 151 2345678 – für den WhatsApp-Link bei den Mieteingängen.")}
                </p>
              </div>
              <div>
                <label htmlFor="birthDate">{t("Geburtsdatum")}</label>
                <input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  defaultValue={toDateInput(tenant.birthDate)}
                />
              </div>
              <div>
                <label htmlFor="nationality">{t("Staatsangehörigkeit")}</label>
                <input id="nationality" name="nationality" defaultValue={tenant.nationality ?? ""} />
              </div>
              <p className="sm:col-span-2 border-b border-ink-200/70 pb-1.5 pt-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                {t("Ausweis und Meldeanschrift")}
              </p>
              <div>
                <label htmlFor="idType">{t("Ausweisart")}</label>
                <select id="idType" name="idType" defaultValue={tenant.idType ?? ""}>
                  <option value="">{t("– keine Angabe –")}</option>
                  <option value="Personalausweis">{t("Personalausweis")}</option>
                  <option value="Reisepass">{t("Reisepass")}</option>
                  <option value="Aufenthaltstitel">{t("Aufenthaltstitel")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="idNumber">{t("Ausweisnummer")}</label>
                <input id="idNumber" name="idNumber" defaultValue={tenant.idNumber ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="street">{t("Straße (Meldeanschrift)")}</label>
                <input id="street" name="street" defaultValue={tenant.street ?? ""} />
              </div>
              <div>
                <label htmlFor="zip">PLZ</label>
                <input id="zip" name="zip" defaultValue={tenant.zip ?? ""} />
              </div>
              <div>
                <label htmlFor="city">{t("Ort")}</label>
                <input id="city" name="city" defaultValue={tenant.city ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="country">{t("Land")}</label>
                <input id="country" name="country" defaultValue={tenant.country ?? "Deutschland"} />
              </div>
              <p className="sm:col-span-2 border-b border-ink-200/70 pb-1.5 pt-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                {t("Auftraggeber / Entsendefirma")}
              </p>
              <div>
                <label htmlFor="company">{t("Firma")}</label>
                <input id="company" name="company" defaultValue={tenant.company ?? ""} />
              </div>
              <div>
                <label htmlFor="companyVatId">{t("USt-IdNr.")}</label>
                <input id="companyVatId" name="companyVatId" defaultValue={tenant.companyVatId ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="companyStreet">{t("Firmenstraße")}</label>
                <input id="companyStreet" name="companyStreet" defaultValue={tenant.companyStreet ?? ""} />
              </div>
              <div>
                <label htmlFor="companyZip">{t("Firmen-PLZ")}</label>
                <input id="companyZip" name="companyZip" defaultValue={tenant.companyZip ?? ""} />
              </div>
              <div>
                <label htmlFor="companyCity">{t("Firmenort")}</label>
                <input id="companyCity" name="companyCity" defaultValue={tenant.companyCity ?? ""} />
              </div>
              <p className="sm:col-span-2 border-b border-ink-200/70 pb-1.5 pt-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                {t("Sonstiges")}
              </p>
              <div className="sm:col-span-2">
                <label htmlFor="notes">{t("Notizen")}</label>
                <textarea id="notes" name="notes" rows={3} defaultValue={tenant.notes ?? ""} />
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              {t("Stammdaten speichern")}
            </button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card title={t("Mieter löschen")} description={t("Nur möglich, wenn kein laufendes Mietverhältnis besteht.")}>
          <form action={deleteTenant}>
            <input type="hidden" name="id" value={tenant.id} />
            <ConfirmButton
              message={t("{name} wirklich löschen? Verträge und Mietkonto werden mitgelöscht.", { name: `${tenant.firstName} ${tenant.lastName}` })}
            >
              {t("Mieter endgültig löschen")}
            </ConfirmButton>
          </form>
        </Card>
      </div>
    </>
  );
}

/**
 * Bett zuweisen - einmal ganz oben, wenn noch keins da ist, sonst unten
 * eingeklappt fuer ein weiteres. Dieselben Felder, damit sich nichts
 * auseinanderentwickelt.
 */
function BettZuweisen({
  tenantId,
  beds,
  t,
  prefix,
}: {
  tenantId: string;
  beds: Awaited<ReturnType<typeof bedOptions>>;
  t: Uebersetzen;
  /** Eindeutige Feld-IDs, falls das Formular zweimal auf der Seite steht. */
  prefix: string;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <form action={createTenancy} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <BedPicker beds={beds} required rentFieldId={id("newTenancyRent")} idPrefix={`${prefix}-`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={id("newStart")}>{t("Mietbeginn *")}</label>
          <input
            id={id("newStart")}
            name="startDate"
            type="date"
            required
            defaultValue={toDateInput(new Date())}
          />
        </div>
        <div>
          <label htmlFor={id("newEnd")}>{t("Mietende")}</label>
          <input id={id("newEnd")} name="endDate" type="date" />
        </div>
        <div>
          <label htmlFor={id("newBillingDay")}>{t("Fällig am")}</label>
          <input
            id={id("newBillingDay")}
            name="billingDay"
            type="number"
            min={1}
            max={28}
            defaultValue={1}
          />
        </div>
        <div>
          <label htmlFor={id("newTenancyRent")}>{t("Miete / Monat")}</label>
          <input id={id("newTenancyRent")} name="monthlyRentCents" inputMode="decimal" />
        </div>
        <div>
          <label htmlFor={id("newUtilities")}>{t("davon Nebenkosten")}</label>
          <input id={id("newUtilities")} name="utilitiesCents" inputMode="decimal" defaultValue="0,00" />
        </div>
        <div>
          <label htmlFor={id("newDeposit")}>{t("Kaution")}</label>
          <input id={id("newDeposit")} name="depositCents" inputMode="decimal" defaultValue="200,00" />
          <p className="field-hint">{t("0,00 eintragen = keine Kaution")}</p>
        </div>
      </div>
      <button type="submit" className="btn btn-primary">
        {t("Bett zuweisen und Vertrag erzeugen")}
      </button>
    </form>
  );
}
