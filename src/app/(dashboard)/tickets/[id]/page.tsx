import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addTicketComment,
  deleteTicket,
  setTicketStatus,
  updateTicket,
  uploadTicketDocument,
} from "@/app/actions/tickets";
import { AdminOnly } from "@/components/admin-only";
import { BelegDatei } from "@/components/beleg-datei";
import { ConfirmButton } from "@/components/interactive";
import { Badge, Card, Flash, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  TICKET_ART,
  TICKET_ART_LABEL,
  TICKET_PRIORITAET,
  TICKET_PRIORITAET_LABEL,
  TICKET_STATUS,
  TICKET_STATUS_LABEL,
} from "@/lib/enums";
import { uebersetzer } from "@/lib/i18n";
import { propertyOptions } from "@/lib/options";
import { naechsterStatus, prioritaetsTon, statusTon } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  // Tickets gehen die Verwaltung an; ein Steuerberater-Konto
  // landet wieder in der Buchhaltung.
  await requireAdmin();
  const { id } = await params;
  const suche = await searchParams;
  const t = await uebersetzer();

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true } },
      tenant: { select: { id: true, firstName: true, lastName: true } },
      documents: { orderBy: { uploadedAt: "desc" } },
      kommentare: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  const [properties, tenants] = await Promise.all([
    propertyOptions(),
    prisma.tenant.findMany({
      select: { id: true, firstName: true, lastName: true, status: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const weiter = naechsterStatus(ticket.status);

  return (
    <>
      <PageHeader
        title={`#${ticket.nummer} ${ticket.titel}`}
        description={`${t("Angelegt")} ${formatDateTime(ticket.createdAt)} · ${ticket.erstelltVon}`}
        breadcrumb={[{ label: t("Tickets"), href: "/tickets" }, { label: `#${ticket.nummer}` }]}
        actions={
          <AdminOnly>
            {weiter ? (
              <form action={setTicketStatus}>
                <input type="hidden" name="id" value={ticket.id} />
                <input type="hidden" name="status" value={weiter} />
                <input type="hidden" name="back" value={`/tickets/${ticket.id}`} />
                <button type="submit" className="btn btn-primary">
                  {t("Auf")} „{t(TICKET_STATUS_LABEL[weiter] ?? weiter)}“
                </button>
              </form>
            ) : (
              <form action={setTicketStatus}>
                <input type="hidden" name="id" value={ticket.id} />
                <input type="hidden" name="status" value="OFFEN" />
                <input type="hidden" name="back" value={`/tickets/${ticket.id}`} />
                <button type="submit" className="btn btn-secondary">
                  {t("Wieder öffnen")}
                </button>
              </form>
            )}
          </AdminOnly>
        }
      />

      <Flash ok={suche.ok} fehler={suche.fehler} />

      <div className="mb-5 flex flex-wrap gap-2">
        {ticket.art === "SUPPORT" && <Badge tone="info">{t(TICKET_ART_LABEL.SUPPORT)}</Badge>}
        <Badge tone={statusTon(ticket.status)}>
          {t(TICKET_STATUS_LABEL[ticket.status] ?? ticket.status)}
        </Badge>
        <Badge tone={prioritaetsTon(ticket.prioritaet)}>
          {t(TICKET_PRIORITAET_LABEL[ticket.prioritaet] ?? ticket.prioritaet)}
        </Badge>
        {ticket.property && (
          <Link href={`/objekte/${ticket.property.id}`}>
            <Badge tone="brand">{ticket.property.name}</Badge>
          </Link>
        )}
        {ticket.tenant && (
          <Link href={`/mieter/${ticket.tenant.id}`}>
            <Badge tone="neutral">
              {ticket.tenant.firstName} {ticket.tenant.lastName}
            </Badge>
          </Link>
        )}
        {ticket.bearbeiter && <Badge tone="info">{ticket.bearbeiter}</Badge>}
        {ticket.erledigtAm && (
          <Badge tone="success">
            {t("Erledigt am")} {formatDateTime(ticket.erledigtAm)}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title={t("Beschreibung")}>
            {ticket.beschreibung ? (
              <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-ink-700">
                {ticket.beschreibung}
              </p>
            ) : (
              <p className="text-[0.875rem] text-ink-500">{t("Keine weitere Beschreibung.")}</p>
            )}

            {/* Bei Support-Meldungen schickt die App mit, wo es passierte -
                das erspart der IT die erste Rückfrage. */}
            {ticket.kontext && (
              <p className="mt-4 border-t border-ink-200 pt-3 text-[0.75rem] leading-relaxed text-ink-500">
                {ticket.kontext}
              </p>
            )}
          </Card>

          <Card
            title={t("Verlauf")}
            description={t("Wer hat was erledigt, wen angerufen, was vereinbart.")}
          >
            {ticket.kommentare.length === 0 ? (
              <p className="text-[0.875rem] text-ink-500">{t("Noch keine Notizen.")}</p>
            ) : (
              <ol className="space-y-4">
                {ticket.kommentare.map((kommentar) => (
                  <li key={kommentar.id} className="border-l-2 border-ink-200 pl-3.5">
                    <p className="text-[0.75rem] text-ink-500">
                      {kommentar.autor} · {formatDateTime(kommentar.createdAt)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[0.9rem] leading-relaxed text-ink-800">
                      {kommentar.text}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            <AdminOnly>
              <form id="ticket-notiz" action={addTicketComment} className="mt-5 border-t border-ink-200 pt-4">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label htmlFor="text">{t("Notiz hinzufügen")}</label>
                <textarea id="text" name="text" rows={3} required placeholder={t("Was ist passiert?")} />
                <button type="submit" className="btn btn-secondary mt-2">
                  {t("Notiz speichern")}
                </button>
              </form>
            </AdminOnly>
          </Card>

          <Card
            title={t("Anhänge")}
            description={t("Fotos vom Schaden, Kostenvoranschlag, Rechnung.")}
          >
            {ticket.documents.length === 0 ? (
              <p className="text-[0.875rem] text-ink-500">{t("Noch keine Anhänge.")}</p>
            ) : (
              <ul className="space-y-2">
                {ticket.documents.map((dokument) => (
                  <li key={dokument.id} className="flex flex-wrap items-baseline gap-x-2">
                    {dokument.driveUrl ? (
                      <a
                        href={dokument.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {dokument.fileName}
                      </a>
                    ) : (
                      <span className="font-medium text-ink-900">{dokument.fileName}</span>
                    )}
                    <span className="text-xs text-ink-500">{formatDateTime(dokument.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            )}

            <AdminOnly>
              <form
                id="ticket-anhang"
                action={uploadTicketDocument}
                encType="multipart/form-data"
                className="mt-5 border-t border-ink-200 pt-4"
              >
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label htmlFor="datei">{t("Foto oder Dokument")}</label>
                <BelegDatei name="datei" />
                <button type="submit" className="btn btn-secondary mt-2">
                  {t("Anhang hinzufügen")}
                </button>
              </form>
            </AdminOnly>
          </Card>
        </div>

        <div className="min-w-0">
          <AdminOnly>
            <Card title={t("Ticket bearbeiten")}>
              <form id="ticket-bearbeiten" action={updateTicket} className="grid gap-3">
                <input type="hidden" name="id" value={ticket.id} />

                <div>
                  <label htmlFor="titel">{t("Anliegen")}</label>
                  <input id="titel" name="titel" required defaultValue={ticket.titel} />
                </div>

                <div>
                  <label htmlFor="beschreibung">{t("Beschreibung")}</label>
                  <textarea
                    id="beschreibung"
                    name="beschreibung"
                    rows={5}
                    defaultValue={ticket.beschreibung ?? ""}
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="art">{t("Art")}</label>
                  <select id="art" name="art" defaultValue={ticket.art}>
                    {TICKET_ART.map((wert) => (
                      <option key={wert} value={wert}>
                        {t(TICKET_ART_LABEL[wert])}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor="status">{t("Status")}</label>
                    <select id="status" name="status" defaultValue={ticket.status}>
                      {TICKET_STATUS.map((wert) => (
                        <option key={wert} value={wert}>
                          {t(TICKET_STATUS_LABEL[wert])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="prioritaet">{t("Dringlichkeit")}</label>
                    <select id="prioritaet" name="prioritaet" defaultValue={ticket.prioritaet}>
                      {TICKET_PRIORITAET.map((wert) => (
                        <option key={wert} value={wert}>
                          {t(TICKET_PRIORITAET_LABEL[wert])}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="propertyId">{t("Betroffenes Objekt")}</label>
                  <select id="propertyId" name="propertyId" defaultValue={ticket.propertyId ?? ""}>
                    <option value="">{t("Kein Objekt")}</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="tenantId">{t("Betroffener Mieter")}</label>
                  <select id="tenantId" name="tenantId" defaultValue={ticket.tenantId ?? ""}>
                    <option value="">{t("Kein Mieter")}</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.lastName}, {tenant.firstName}
                        {tenant.status === "EHEMALIG" ? ` (${t("Ehemalig")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bearbeiter">{t("Bearbeiter")}</label>
                  <input
                    id="bearbeiter"
                    name="bearbeiter"
                    defaultValue={ticket.bearbeiter ?? ""}
                    placeholder={t("Wer kümmert sich?")}
                  />
                </div>

                <button type="submit" className="btn btn-primary">
                  {t("Speichern")}
                </button>
              </form>

              <form action={deleteTicket} className="mt-4 border-t border-ink-200 pt-4">
                <input type="hidden" name="id" value={ticket.id} />
                <ConfirmButton
                  message={t("Ticket samt Verlauf und Anhängen löschen?")}
                  className="btn btn-ghost text-rose-700"
                >
                  {t("Ticket löschen")}
                </ConfirmButton>
              </form>
            </Card>
          </AdminOnly>
        </div>
      </div>
    </>
  );
}
