import Link from "next/link";

import { deleteDocument, updateDocument, uploadDocument } from "@/app/actions/accounting";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { Badge, Card, EmptyState, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { DOCUMENT_KIND_LABEL, EXPENSE_CATEGORIES } from "@/lib/enums";
import { propertyOptions } from "@/lib/options";
import { centsToInput, formatCents } from "@/lib/money";
import { formatDate, toDateInput } from "@/lib/dates";
import { checkDriveStatus } from "@/lib/storage";
import { AdminOnly } from "@/components/admin-only";

export const metadata = { title: "Belege" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; art?: string; q?: string; jahr?: string }>;
}) {
  const params = await searchParams;
  const year = params.jahr ? Number(params.jahr) : null;

  const where = {
    ...(params.art ? { kind: params.art } : {}),
    ...(params.q
      ? {
          OR: [
            { title: { contains: params.q, mode: "insensitive" as const } },
            { supplier: { contains: params.q, mode: "insensitive" as const } },
            { category: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(year && !Number.isNaN(year)
      ? {
          documentDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
          },
        }
      : {}),
  };

  const [documents, properties, drive, unlinkedTransactions] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        property: { select: { name: true } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
        bankTransaction: { select: { id: true, bookingDate: true, amountCents: true } },
      },
      orderBy: [{ documentDate: "desc" }, { uploadedAt: "desc" }],
      take: 150,
    }),
    propertyOptions(),
    checkDriveStatus(),
    prisma.bankTransaction.findMany({
      where: { direction: "DEBIT", reviewStatus: { not: "IGNORED" }, documents: { none: {} } },
      orderBy: { bookingDate: "desc" },
      take: 30,
      select: {
        id: true,
        bookingDate: true,
        amountCents: true,
        counterpartyName: true,
        purpose: true,
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Belege"
        description="Rechnungen und Quittungen – sicher abgelegt, sortiert nach Jahr und Monat."
        breadcrumb={[{ label: "Buchhaltung", href: "/buchhaltung" }, { label: "Belege" }]}
        actions={
          <Link href="/buchhaltung/export" className="btn btn-secondary">
            Steuerberater-Export
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {!drive.ok && (
        <div className="mb-5">
          <Badge tone={drive.configured ? "danger" : "warning"}>
            {drive.configured ? "Ablage nicht erreichbar" : "Ablage nicht eingerichtet"}
          </Badge>
          <p className="mt-1 text-sm text-ink-600">
            {drive.message}{" "}
            <Link href="/einstellungen" className="font-semibold text-brand-700 hover:underline">
              Zu den Einstellungen
            </Link>
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card padded={false}>
            <AdminOnly>
              <form className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
                <div className="min-w-48 flex-1">
                  <label htmlFor="q">Suche</label>
                  <input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Titel, Lieferant" />
                </div>
                <div className="w-44">
                  <label htmlFor="art">Art</label>
                  <select id="art" name="art" defaultValue={params.art ?? ""}>
                    <option value="">Alle</option>
                    {Object.entries(DOCUMENT_KIND_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label htmlFor="jahr">Jahr</label>
                  <input id="jahr" name="jahr" inputMode="numeric" defaultValue={params.jahr ?? ""} />
                </div>
                <button type="submit" className="btn btn-secondary">
                  Filtern
                </button>
                <Link href="/buchhaltung/belege" className="btn btn-ghost">
                  Zurücksetzen
                </Link>
              </form>
            </AdminOnly>

            {documents.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Keine Belege"
                  description="Laden Sie rechts einen Beleg hoch oder ordnen Sie ihn direkt bei einer Buchung zu."
                />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Datum</Th>
                    <Th>Beleg</Th>
                    <Th>Zuordnung</Th>
                    <Th align="right">Betrag</Th>
                    <Th align="right"></Th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="align-top hover:bg-ink-50">
                      <Td className="whitespace-nowrap text-ink-600">
                        {formatDate(document.documentDate ?? document.uploadedAt)}
                        <p className="text-xs text-ink-500">
                          {DOCUMENT_KIND_LABEL[document.kind] ?? document.kind}
                        </p>
                      </Td>
                      <Td>
                        {document.driveUrl ? (
                          <a
                            href={document.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {document.title}
                          </a>
                        ) : (
                          <span className="font-medium text-ink-900">{document.title}</span>
                        )}
                        <p className="text-xs text-ink-500">
                          {[document.supplier, document.category].filter(Boolean).join(" · ")}
                        </p>
                        {document.kind !== "CONTRACT" && document.kind !== "STATEMENT" && (
                          <div className="mt-1.5">
                            <Disclosure summary="Bearbeiten">
                              <AdminOnly>
                                <form action={updateDocument} className="grid gap-3 sm:grid-cols-2">
                                  <input type="hidden" name="id" value={document.id} />
                                  <input type="hidden" name="back" value="/buchhaltung/belege" />
                                  <div className="sm:col-span-2">
                                    <label htmlFor={`t-${document.id}`}>Titel</label>
                                    <input id={`t-${document.id}`} name="title" defaultValue={document.title} />
                                  </div>
                                  <div>
                                    <label htmlFor={`d-${document.id}`}>Belegdatum</label>
                                    <input
                                      id={`d-${document.id}`}
                                      name="documentDate"
                                      type="date"
                                      defaultValue={toDateInput(document.documentDate)}
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor={`a-${document.id}`}>Betrag</label>
                                    <input
                                      id={`a-${document.id}`}
                                      name="amountCents"
                                      inputMode="decimal"
                                      defaultValue={centsToInput(document.amountCents)}
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor={`s-${document.id}`}>Lieferant</label>
                                    <input
                                      id={`s-${document.id}`}
                                      name="supplier"
                                      defaultValue={document.supplier ?? ""}
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor={`v-${document.id}`}>USt-Satz %</label>
                                    <input
                                      id={`v-${document.id}`}
                                      name="vatRatePct"
                                      inputMode="decimal"
                                      defaultValue={document.vatRatePct ?? ""}
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor={`c-${document.id}`}>Kategorie</label>
                                    <select
                                      id={`c-${document.id}`}
                                      name="category"
                                      defaultValue={document.category ?? ""}
                                    >
                                      <option value="">– keine –</option>
                                      {EXPENSE_CATEGORIES.map((category) => (
                                        <option key={category} value={category}>
                                          {category}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label htmlFor={`p-${document.id}`}>Objekt</label>
                                    <select
                                      id={`p-${document.id}`}
                                      name="propertyId"
                                      defaultValue={document.propertyId ?? ""}
                                    >
                                      <option value="">– keins –</option>
                                      {properties.map((property) => (
                                        <option key={property.id} value={property.id}>
                                          {property.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label htmlFor={`n-${document.id}`}>Notiz</label>
                                    <input
                                      id={`n-${document.id}`}
                                      name="notes"
                                      defaultValue={document.notes ?? ""}
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <button type="submit" className="btn btn-primary">
                                      Speichern
                                    </button>
                                  </div>
                                </form>
                              </AdminOnly>
                            </Disclosure>
                          </div>
                        )}
                      </Td>
                      <Td className="text-xs text-ink-600">
                        {document.property?.name && <p>{document.property.name}</p>}
                        {document.tenant && (
                          <Link
                            href={`/mieter/${document.tenant.id}`}
                            className="hover:text-brand-700"
                          >
                            {document.tenant.firstName} {document.tenant.lastName}
                          </Link>
                        )}
                        {document.bankTransaction && (
                          <p className="text-ink-500">
                            Buchung {formatDate(document.bankTransaction.bookingDate)} ·{" "}
                            {formatCents(document.bankTransaction.amountCents)}
                          </p>
                        )}
                        {!document.property && !document.tenant && !document.bankTransaction && (
                          <span className="text-ink-500">–</span>
                        )}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {document.amountCents === null ? "–" : formatCents(document.amountCents)}
                      </Td>
                      <Td align="right">
                        <AdminOnly>
                          <form action={deleteDocument}>
                            <input type="hidden" name="id" value={document.id} />
                            <input type="hidden" name="back" value="/buchhaltung/belege" />
                            <ConfirmButton
                              className="btn btn-ghost"
                              message={`Beleg „${document.title}“ löschen?`}
                            >
                              Löschen
                            </ConfirmButton>
                          </form>
                        </AdminOnly>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Beleg hochladen">
            <AdminOnly>
              <form action={uploadDocument} className="space-y-3">
                <input type="hidden" name="back" value="/buchhaltung/belege" />
                <div>
                  <label htmlFor="file">Datei *</label>
                  <input id="file" name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp" />
                </div>
                <div>
                  <label htmlFor="title">Titel</label>
                  <input id="title" name="title" placeholder="Rechnung Stadtwerke März" />
                </div>
                <div>
                  <label htmlFor="kind">Art</label>
                  <select id="kind" name="kind" defaultValue="RECEIPT">
                    <option value="RECEIPT">Beleg</option>
                    <option value="INVOICE">Rechnung</option>
                    <option value="OTHER">Sonstiges</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="documentDate">Belegdatum</label>
                  <input
                    id="documentDate"
                    name="documentDate"
                    type="date"
                    defaultValue={toDateInput(new Date())}
                  />
                </div>
                <div>
                  <label htmlFor="amountCents">Betrag</label>
                  <input id="amountCents" name="amountCents" inputMode="decimal" />
                </div>
                <div>
                  <label htmlFor="supplier">Lieferant</label>
                  <input id="supplier" name="supplier" />
                </div>
                <div>
                  <label htmlFor="vatRatePct">USt-Satz %</label>
                  <input id="vatRatePct" name="vatRatePct" inputMode="decimal" placeholder="19" />
                </div>
                <div>
                  <label htmlFor="category">Kategorie</label>
                  <select id="category" name="category" defaultValue="">
                    <option value="">– keine –</option>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="propertyId">Objekt</label>
                  <select id="propertyId" name="propertyId" defaultValue="">
                    <option value="">– keins –</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bankTransactionId">Zu Buchung</label>
                  <select id="bankTransactionId" name="bankTransactionId" defaultValue="">
                    <option value="">– keine Zuordnung –</option>
                    {unlinkedTransactions.map((tx) => (
                      <option key={tx.id} value={tx.id}>
                        {formatDate(tx.bookingDate)} · {formatCents(tx.amountCents)} ·{" "}
                        {(tx.counterpartyName ?? tx.purpose ?? "").slice(0, 40)}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">Zeigt Ausgaben ohne Beleg.</p>
                </div>
                <button type="submit" className="btn btn-primary w-full">
                  Beleg hochladen
                </button>
              </form>
            </AdminOnly>
          </Card>
        </div>
      </div>
    </>
  );
}
