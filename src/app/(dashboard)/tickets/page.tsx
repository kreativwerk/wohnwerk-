import Link from "next/link";

import { createTicket, setTicketStatus } from "@/app/actions/tickets";
import { AdminOnly } from "@/components/admin-only";
import { SupportAusloeser } from "@/components/support-melden";
import { BelegDatei } from "@/components/beleg-datei";
import { Badge, Card, EmptyState, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
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
import { liegtSeitTagen, naechsterStatus, prioritaetsTon, sortiereTickets, statusTon } from "@/lib/tickets";

export const metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; status?: string; art?: string }>;
}) {
  // Tickets gehen die Verwaltung an; ein Steuerberater-Konto
  // landet wieder in der Buchhaltung.
  await requireAdmin();
  const params = await searchParams;
  const t = await uebersetzer();

  // Ohne Auswahl zeigt die Liste alles, was noch nicht erledigt ist -
  // erledigte Tickets sucht man bewusst.
  const filter = params.status ?? "";
  const statusFilter =
    filter && TICKET_STATUS.includes(filter as (typeof TICKET_STATUS)[number])
      ? { status: filter }
      : filter === "alle"
        ? {}
        : { status: { not: "ERLEDIGT" } };

  // Zwei Sorten Arbeit: Anliegen aus den Objekten und Meldungen zur
  // Anwendung selbst. Ohne Auswahl stehen beide zusammen.
  const art = TICKET_ART.includes(params.art as (typeof TICKET_ART)[number]) ? params.art! : "";
  const where = { ...statusFilter, ...(art ? { art } : {}) };

  /** Baut einen Link, der die jeweils andere Auswahl stehen laesst. */
  const ziel = (naechsteArt: string, naechsterFilter: string) => {
    const suche = new URLSearchParams();
    if (naechsterFilter) suche.set("status", naechsterFilter);
    if (naechsteArt) suche.set("art", naechsteArt);
    const text = suche.toString();
    return text ? `/tickets?${text}` : "/tickets";
  };

  const [rohdaten, properties, tenants, zaehler, artZaehler] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        property: { select: { name: true } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { documents: true, kommentare: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    propertyOptions(),
    prisma.tenant.findMany({
      where: { status: "AKTIV" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: art ? { art } : {},
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({ by: ["art"], _count: { _all: true } }),
  ]);

  // Offene zuerst, darin die dringenden, darin die neuesten.
  const tickets = sortiereTickets(rohdaten);

  const anzahl = (status: string) =>
    zaehler.find((eintrag) => eintrag.status === status)?._count._all ?? 0;

  // Nach dem Statuswechsel landet man wieder in derselben Ansicht.
  const zurueck = ziel(art, filter);

  const artAnzahl = (wert: string) =>
    artZaehler.find((eintrag) => eintrag.art === wert)?._count._all ?? 0;

  const artZiele = [
    { wert: "", label: t("Alle Arten"), zahl: artZaehler.reduce((summe, e) => summe + e._count._all, 0) },
    { wert: "OBJEKT", label: t("Objekte"), zahl: artAnzahl("OBJEKT") },
    { wert: "SUPPORT", label: t("Support"), zahl: artAnzahl("SUPPORT") },
  ];

  const filterZiele = [
    { wert: "", label: t("Aktuell"), zahl: anzahl("OFFEN") + anzahl("IN_ARBEIT") },
    { wert: "OFFEN", label: t("Offen"), zahl: anzahl("OFFEN") },
    { wert: "IN_ARBEIT", label: t("In Arbeit"), zahl: anzahl("IN_ARBEIT") },
    { wert: "ERLEDIGT", label: t("Erledigt"), zahl: anzahl("ERLEDIGT") },
    { wert: "alle", label: t("Alle"), zahl: zaehler.reduce((summe, e) => summe + e._count._all, 0) },
  ];

  return (
    <>
      <PageHeader
        title={t("Tickets")}
        description={t(
          "Anliegen aus den Objekten: was kaputt ist, was fehlt, was jemand gemeldet hat.",
        )}
        actions={
          <AdminOnly>
            {/* Stimmt etwas an der Anwendung nicht, geht es hier zur IT. */}
            <SupportAusloeser className="btn btn-secondary">
              {t("Problem melden")}
            </SupportAusloeser>
            <a href="#ticket-anlegen" className="btn btn-primary">
              {t("Ticket anlegen")}
            </a>
          </AdminOnly>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {/* Zwei Filterzeilen: erst welche Sorte Arbeit, dann welcher Stand.
          Beide scrollen am Handy waagerecht statt umzubrechen. */}
      <div className="mb-2">
        <ChipReihe eintraege={artZiele} aktivWert={art} href={(wert) => ziel(wert, filter)} />
      </div>
      <div className="mb-5">
        <ChipReihe eintraege={filterZiele} aktivWert={filter} href={(wert) => ziel(art, wert)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* min-w-0: sonst zieht die Tabelle die Spalte am Handy in die Breite. */}
        <div className="min-w-0 lg:col-span-2">
          <Card padded={false}>
            {tickets.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={t("Keine Tickets")}
                  description={t("Hier steht, was in den Objekten zu tun ist. Legen Sie das erste Anliegen an.")}
                />
              </div>
            ) : (
              <>
                {/* Am Handy eine Liste statt einer Tabelle: in vier Spalten
                    bleibt vom Anliegen sonst ein Wort pro Zeile uebrig. */}
                <ul className="divide-y divide-ink-100 sm:hidden">
                  {tickets.map((ticket) => {
                    const weiter = naechsterStatus(ticket.status);
                    const tage = liegtSeitTagen(ticket.createdAt);
                    return (
                      <li key={ticket.id} className="px-4 py-3.5">
                        <Link href={`/tickets/${ticket.id}`} className="block">
                          <p className="text-[0.92rem] font-medium leading-snug text-ink-900">
                            <span className="tabular-nums text-ink-400">#{ticket.nummer}</span>{" "}
                            {ticket.titel}
                          </p>
                          <p className="mt-1 text-xs text-ink-500">
                            {[
                              formatDateTime(ticket.createdAt),
                              ticket.property?.name,
                              ticket.tenant && `${ticket.tenant.firstName} ${ticket.tenant.lastName}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </Link>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {ticket.art === "SUPPORT" && (
                            <Badge tone="info">{t(TICKET_ART_LABEL.SUPPORT)}</Badge>
                          )}
                          <Badge tone={statusTon(ticket.status)}>
                            {t(TICKET_STATUS_LABEL[ticket.status] ?? ticket.status)}
                          </Badge>
                          {ticket.prioritaet !== "NORMAL" && (
                            <Badge tone={prioritaetsTon(ticket.prioritaet)}>
                              {t(TICKET_PRIORITAET_LABEL[ticket.prioritaet] ?? ticket.prioritaet)}
                            </Badge>
                          )}
                          {ticket._count.documents > 0 && (
                            <span className="text-xs text-ink-500">
                              {ticket._count.documents} {t("Anhänge")}
                            </span>
                          )}
                          {ticket._count.kommentare > 0 && (
                            <span className="text-xs text-ink-500">
                              {ticket._count.kommentare} {t("Notizen")}
                            </span>
                          )}
                          {ticket.status !== "ERLEDIGT" && tage >= 7 && (
                            <span className="text-xs font-medium text-amber-700">
                              {t("Liegt seit")} {tage} {t("Tagen")}
                            </span>
                          )}
                          {weiter && (
                            <AdminOnly>
                              <form action={setTicketStatus} className="ml-auto">
                                <input type="hidden" name="id" value={ticket.id} />
                                <input type="hidden" name="status" value={weiter} />
                                <input type="hidden" name="back" value={zurueck} />
                                <button type="submit" className="btn btn-secondary whitespace-nowrap">
                                  {t(TICKET_STATUS_LABEL[weiter] ?? weiter)}
                                </button>
                              </form>
                            </AdminOnly>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <Table className="hidden sm:block">
                  <thead>
                    <tr>
                      <Th>{t("Anliegen")}</Th>
                      <Th>{t("Zuordnung")}</Th>
                      <Th>{t("Status")}</Th>
                      <Th align="right"></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => {
                      const weiter = naechsterStatus(ticket.status);
                      const tage = liegtSeitTagen(ticket.createdAt);
                      return (
                        <tr key={ticket.id} className="align-top hover:bg-ink-50">
                          <Td>
                            <Link
                              href={`/tickets/${ticket.id}`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              <span className="tabular-nums text-ink-400">#{ticket.nummer}</span>{" "}
                              {ticket.titel}
                            </Link>
                            <p className="mt-0.5 text-xs text-ink-500">
                              {formatDateTime(ticket.createdAt)} · {ticket.erstelltVon}
                              {ticket._count.documents > 0 &&
                                ` · ${ticket._count.documents} ${t("Anhänge")}`}
                              {ticket._count.kommentare > 0 &&
                                ` · ${ticket._count.kommentare} ${t("Notizen")}`}
                            </p>
                            {/* Was lange liegt, soll auffallen - ohne Zahlenspiel. */}
                            {ticket.status !== "ERLEDIGT" && tage >= 7 && (
                              <p className="mt-0.5 text-xs font-medium text-amber-700">
                                {t("Liegt seit")} {tage} {t("Tagen")}
                              </p>
                            )}
                          </Td>
                          <Td className="text-ink-600">
                            {ticket.property?.name ?? "–"}
                            {ticket.tenant && (
                              <p className="text-xs text-ink-500">
                                {ticket.tenant.firstName} {ticket.tenant.lastName}
                              </p>
                            )}
                          </Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              {ticket.art === "SUPPORT" && (
                                <Badge tone="info">{t(TICKET_ART_LABEL.SUPPORT)}</Badge>
                              )}
                              <Badge tone={statusTon(ticket.status)}>
                                {t(TICKET_STATUS_LABEL[ticket.status] ?? ticket.status)}
                              </Badge>
                              {ticket.prioritaet !== "NORMAL" && (
                                <Badge tone={prioritaetsTon(ticket.prioritaet)}>
                                  {t(TICKET_PRIORITAET_LABEL[ticket.prioritaet] ?? ticket.prioritaet)}
                                </Badge>
                              )}
                            </div>
                          </Td>
                          <Td align="right">
                            {weiter && (
                              <AdminOnly>
                                <form action={setTicketStatus}>
                                  <input type="hidden" name="id" value={ticket.id} />
                                  <input type="hidden" name="status" value={weiter} />
                                  <input type="hidden" name="back" value={zurueck} />
                                  <button type="submit" className="btn btn-secondary whitespace-nowrap">
                                    {t(TICKET_STATUS_LABEL[weiter] ?? weiter)}
                                  </button>
                                </form>
                              </AdminOnly>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <AdminOnly>
            <Card title={t("Ticket anlegen")} description={t("Ein Satz genügt; Foto und Details sind freiwillig.")}>
              <form id="ticket-anlegen" action={createTicket} encType="multipart/form-data" className="grid gap-3">
                <div>
                  <label htmlFor="titel">{t("Anliegen")}</label>
                  <input
                    id="titel"
                    name="titel"
                    required
                    placeholder={t("z. B. Boiler in Bad 2 tropft")}
                  />
                </div>

                <div>
                  <label htmlFor="beschreibung">{t("Beschreibung")}</label>
                  <textarea
                    id="beschreibung"
                    name="beschreibung"
                    rows={4}
                    placeholder={t("Was genau ist passiert? Seit wann? Wer hat es gemeldet?")}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor="prioritaet">{t("Dringlichkeit")}</label>
                    <select id="prioritaet" name="prioritaet" defaultValue="NORMAL">
                      {TICKET_PRIORITAET.map((wert) => (
                        <option key={wert} value={wert}>
                          {t(TICKET_PRIORITAET_LABEL[wert])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="propertyId">{t("Betroffenes Objekt")}</label>
                    <select id="propertyId" name="propertyId" defaultValue="">
                      <option value="">{t("Kein Objekt")}</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="tenantId">{t("Betroffener Mieter")}</label>
                  <select id="tenantId" name="tenantId" defaultValue="">
                    <option value="">{t("Kein Mieter")}</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.lastName}, {tenant.firstName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* min-w-0: das Dateifeld bringt eine eigene Mindestbreite
                    mit und wuerde die Gitterspalte sonst aufziehen. */}
                <div className="min-w-0">
                  <label htmlFor="datei">{t("Foto oder Dokument")}</label>
                  {/* Dieselbe Kamera-Auswahl wie bei den Belegen, hier freiwillig. */}
                  <BelegDatei name="datei" required={false} />
                </div>

                <button type="submit" className="btn btn-primary">
                  {t("Ticket anlegen")}
                </button>
              </form>
            </Card>
          </AdminOnly>
        </div>
      </div>
    </>
  );
}

/** Eine Zeile runder Filterknoepfe mit Zahl dahinter. */
function ChipReihe({
  eintraege,
  aktivWert,
  href,
}: {
  eintraege: Array<{ wert: string; label: string; zahl: number }>;
  aktivWert: string;
  href: (wert: string) => string;
}) {
  return (
    <div className="scroll-schatten -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {eintraege.map((eintrag) => {
        const aktiv = aktivWert === eintrag.wert;
        return (
          <Link
            key={eintrag.wert || "alle"}
            href={href(eintrag.wert)}
            aria-current={aktiv ? "page" : undefined}
            className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.8rem] font-medium transition-colors ${
              aktiv
                ? "bg-brand-700 text-white"
                : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:text-brand-700"
            }`}
          >
            {eintrag.label}
            <span className={aktiv ? "text-white/70 tabular-nums" : "text-ink-400 tabular-nums"}>
              {eintrag.zahl}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
