import Link from "next/link";

import { updateTransaction, uploadDocument } from "@/app/actions/accounting";
import { Disclosure } from "@/components/interactive";
import { ReviewBadge } from "@/components/status";
import { Card, EmptyState, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { SuchFeld } from "@/components/suchfeld";
import { prisma } from "@/lib/db";
import { periodSummary } from "@/lib/accounting";
import { EXPENSE_CATEGORIES } from "@/lib/enums";
import { propertyOptions } from "@/lib/options";
import { centsToInput } from "@/lib/money";
import { endOfMonth, startOfMonth, toDateInput } from "@/lib/dates";
import { AdminOnly } from "@/components/admin-only";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Buchungen") };
}
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    fehler?: string;
    status?: string;
    richtung?: string;
    q?: string;
    fehlend?: string;
    von?: string;
    bis?: string;
  }>;
}) {
  const { t, datum, geld } = await oberflaeche();
  const params = await searchParams;

  const now = new Date();
  const from = params.von ? new Date(params.von) : null;
  const to = params.bis ? new Date(`${params.bis}T23:59:59.999Z`) : null;

  const where = {
    ...(params.status ? { reviewStatus: params.status } : {}),
    ...(params.richtung ? { direction: params.richtung } : {}),
    ...(params.fehlend === "1"
      ? { direction: "DEBIT", reviewStatus: { not: "IGNORED" }, documents: { none: {} } }
      : {}),
    ...(from || to
      ? { bookingDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(params.q
      ? {
          OR: [
            { purpose: { contains: params.q, mode: "insensitive" as const } },
            { counterpartyName: { contains: params.q, mode: "insensitive" as const } },
            { category: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [transactions, total, summary, properties, accounts] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      include: {
        bankAccount: { select: { name: true } },
        property: { select: { id: true, name: true } },
        documents: { select: { id: true, title: true, driveUrl: true, localPath: true } },
        allocations: {
          include: {
            rentCharge: {
              include: { tenancy: { include: { tenant: { select: { firstName: true, lastName: true } } } } },
            },
          },
        },
      },
      orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
    }),
    prisma.bankTransaction.count({ where }),
    periodSummary(startOfMonth(now), endOfMonth(now)),
    propertyOptions(),
    prisma.bankAccount.count(),
  ]);

  return (
    <>
      <PageHeader
        title={t("Buchungen")}
        description={t("Alle Umsätze aus den importierten Kontoauszügen.")}
        actions={
          <>
            <Link href="/buchhaltung/kontoauszuege" className="btn btn-primary">
              {t("Kontoauszug hochladen")}
            </Link>
            <Link href="/buchhaltung/export" className="btn btn-secondary">
              {t("Steuerberater-Export")}
            </Link>
          </>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={t("Einnahmen (Monat)")} value={geld(summary.incomeCents)} tone="success" />
        <StatCard label={t("Ausgaben (Monat)")} value={geld(summary.expenseCents)} tone="danger" />
        <StatCard
          label={t("Saldo (Monat)")}
          value={geld(summary.balanceCents)}
          tone={summary.balanceCents >= 0 ? "success" : "danger"}
        />
        <StatCard
          label={t("Ohne Beleg")}
          value={String(summary.missingReceiptsCount)}
          tone={summary.missingReceiptsCount > 0 ? "warning" : "success"}
          href="/buchhaltung?fehlend=1"
        />
      </div>

      <div className="mt-6">
        <Card padded={false}>
          <AdminOnly>
            <form className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
              <div className="min-w-52 flex-1">
                <label htmlFor="q">{t("Suche")}</label>
                <SuchFeld defaultValue={params.q ?? ""} placeholder={t("Zweck, Name, Kategorie")} />
              </div>
              <div className="w-40">
                <label htmlFor="richtung">{t("Richtung")}</label>
                <select id="richtung" name="richtung" defaultValue={params.richtung ?? ""}>
                  <option value="">{t("Alle")}</option>
                  <option value="CREDIT">{t("Eingang")}</option>
                  <option value="DEBIT">{t("Ausgang")}</option>
                </select>
              </div>
              <div className="w-40">
                <label htmlFor="status">{t("Status")}</label>
                <select id="status" name="status" defaultValue={params.status ?? ""}>
                  <option value="">{t("Alle")}</option>
                  <option value="OPEN">{t("Offen")}</option>
                  <option value="MATCHED">{t("Zugeordnet")}</option>
                  <option value="BOOKED">{t("Gebucht")}</option>
                  <option value="IGNORED">{t("Ignoriert")}</option>
                </select>
              </div>
              <div className="w-40">
                <label htmlFor="von">{t("Von")}</label>
                <input id="von" name="von" type="date" defaultValue={params.von ?? ""} />
              </div>
              <div className="w-40">
                <label htmlFor="bis">{t("Bis")}</label>
                <input id="bis" name="bis" type="date" defaultValue={params.bis ?? ""} />
              </div>
              <button type="submit" className="btn btn-secondary">
                {t("Filtern")}
              </button>
              <Link href="/buchhaltung" className="btn btn-ghost">
                {t("Zurücksetzen")}
              </Link>
            </form>
          </AdminOnly>

          {transactions.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={accounts === 0 ? t("Noch kein Bankkonto") : t("Keine Buchungen gefunden")}
                description={
                  accounts === 0
                    ? t("Legen Sie zuerst ein Bankkonto an und laden Sie dann einen Kontoauszug hoch.")
                    : t("Passen Sie die Filter an oder laden Sie einen weiteren Kontoauszug hoch.")
                }
                action={
                  <Link href="/buchhaltung/kontoauszuege" className="btn btn-primary">
                    {t("Zu den Kontoauszügen")}
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Datum")}</Th>
                    <Th>{t("Gegenpartei / Zweck")}</Th>
                    <Th>{t("Kategorie")}</Th>
                    <Th>{t("Beleg")}</Th>
                    <Th align="right">{t("Betrag")}</Th>
                    <Th align="right">{t("Status")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="align-top hover:bg-ink-50">
                      <Td className="whitespace-nowrap text-ink-600">
                        {datum(tx.bookingDate)}
                        <p className="text-xs text-ink-500">{tx.bankAccount.name}</p>
                      </Td>
                      <Td>
                        <p className="font-medium text-ink-900">{tx.counterpartyName ?? "–"}</p>
                        <p className="max-w-md text-xs text-ink-500">{tx.purpose ?? ""}</p>
                        {tx.allocations.length > 0 && (
                          <p className="mt-1 text-xs text-brand-700">
                            Miete{" "}
                            {tx.allocations
                              .map(
                                (a) =>
                                  `${String(a.rentCharge.periodMonth).padStart(2, "0")}/${a.rentCharge.periodYear} ` +
                                  `${a.rentCharge.tenancy.tenant.firstName} ${a.rentCharge.tenancy.tenant.lastName}`,
                              )
                              .join(", ")}
                          </p>
                        )}
                        <div className="mt-1.5">
                          <Disclosure summary={t("Bearbeiten")}>
                            <AdminOnly>
                              <form action={updateTransaction} className="grid gap-3 sm:grid-cols-3">
                                <input type="hidden" name="id" value={tx.id} />
                                <input type="hidden" name="back" value="/buchhaltung" />
                                <div>
                                  <label htmlFor={`cat-${tx.id}`}>{t("Kategorie")}</label>
                                  <select id={`cat-${tx.id}`} name="category" defaultValue={tx.category ?? ""}>
                                    <option value="">{t("– keine –")}</option>
                                    {EXPENSE_CATEGORIES.map((category) => (
                                      <option key={category} value={category}>
                                        {t(category)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label htmlFor={`prop-${tx.id}`}>{t("Objekt")}</label>
                                  <select
                                    id={`prop-${tx.id}`}
                                    name="propertyId"
                                    defaultValue={tx.propertyId ?? ""}
                                  >
                                    <option value="">{t("– keins –")}</option>
                                    {properties.map((property) => (
                                      <option key={property.id} value={property.id}>
                                        {property.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label htmlFor={`rev-${tx.id}`}>{t("Status")}</label>
                                  <select
                                    id={`rev-${tx.id}`}
                                    name="reviewStatus"
                                    defaultValue={tx.reviewStatus}
                                  >
                                    <option value="OPEN">{t("Offen")}</option>
                                    <option value="MATCHED">{t("Zugeordnet")}</option>
                                    <option value="BOOKED">{t("Gebucht")}</option>
                                    <option value="IGNORED">{t("Ignorieren")}</option>
                                  </select>
                                </div>
                                <div className="sm:col-span-3">
                                  <label htmlFor={`note-${tx.id}`}>{t("Notiz")}</label>
                                  <input id={`note-${tx.id}`} name="notes" defaultValue={tx.notes ?? ""} />
                                </div>
                                <div className="sm:col-span-3">
                                  <button type="submit" className="btn btn-primary">
                                    {t("Speichern")}
                                  </button>
                                </div>
                              </form>
                            </AdminOnly>
                          </Disclosure>

                          <Disclosure summary={t("Beleg hochladen")}>
                            <AdminOnly>
                              <form action={uploadDocument} className="grid gap-3 sm:grid-cols-3">
                                <input type="hidden" name="bankTransactionId" value={tx.id} />
                                <input type="hidden" name="back" value="/buchhaltung" />
                                <input type="hidden" name="kind" value="RECEIPT" />
                                <div className="sm:col-span-3">
                                  <label htmlFor={`file-${tx.id}`}>{t("Datei *")}</label>
                                  <input
                                    id={`file-${tx.id}`}
                                    name="file"
                                    type="file"
                                    required
                                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`title-${tx.id}`}>{t("Titel")}</label>
                                  <input
                                    id={`title-${tx.id}`}
                                    name="title"
                                    defaultValue={tx.counterpartyName ?? ""}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`date-${tx.id}`}>{t("Belegdatum")}</label>
                                  <input
                                    id={`date-${tx.id}`}
                                    name="documentDate"
                                    type="date"
                                    defaultValue={toDateInput(tx.bookingDate)}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`amount-${tx.id}`}>{t("Betrag")}</label>
                                  <input
                                    id={`amount-${tx.id}`}
                                    name="amountCents"
                                    inputMode="decimal"
                                    defaultValue={centsToInput(Math.abs(tx.amountCents))}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`supplier-${tx.id}`}>{t("Lieferant")}</label>
                                  <input
                                    id={`supplier-${tx.id}`}
                                    name="supplier"
                                    defaultValue={tx.counterpartyName ?? ""}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`vat-${tx.id}`}>{t("USt-Satz %")}</label>
                                  <input id={`vat-${tx.id}`} name="vatRatePct" inputMode="decimal" placeholder="19" />
                                </div>
                                <div>
                                  <label htmlFor={`dcat-${tx.id}`}>{t("Kategorie")}</label>
                                  <select id={`dcat-${tx.id}`} name="category" defaultValue={tx.category ?? ""}>
                                    <option value="">{t("– keine –")}</option>
                                    {EXPENSE_CATEGORIES.map((category) => (
                                      <option key={category} value={category}>
                                        {t(category)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="sm:col-span-3">
                                  <button type="submit" className="btn btn-primary">
                                    {t("Beleg speichern")}
                                  </button>
                                </div>
                              </form>
                            </AdminOnly>
                          </Disclosure>
                        </div>
                      </Td>
                      <Td className="text-ink-600">
                        {tx.category ? t(tx.category) : <span className="text-ink-500">–</span>}
                        {tx.property && <p className="text-xs text-ink-500">{tx.property.name}</p>}
                      </Td>
                      <Td>
                        {tx.documents.length === 0 ? (
                          tx.direction === "DEBIT" ? (
                            <span className="text-xs font-semibold text-amber-600">{t("fehlt")}</span>
                          ) : (
                            <span className="text-ink-500">–</span>
                          )
                        ) : (
                          <ul className="space-y-0.5">
                            {tx.documents.map((document) => (
                              <li key={document.id}>
                                <a
                                  href={document.driveUrl ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-brand-700 hover:underline"
                                >
                                  {document.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td
                        align="right"
                        className={`whitespace-nowrap font-semibold tabular-nums ${
                          tx.amountCents >= 0 ? "text-emerald-600" : "text-ink-900"
                        }`}
                      >
                        {geld(tx.amountCents)}
                      </Td>
                      <Td align="right">
                        <ReviewBadge status={tx.reviewStatus} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {total > transactions.length && (
                <p className="border-t border-ink-200 px-4 py-3 text-xs text-ink-500">
                  {t("{gezeigt} von {gesamt} Buchungen angezeigt. Bitte die Filter verwenden, um die Auswahl einzugrenzen.", { gezeigt: transactions.length, gesamt: total })}
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
