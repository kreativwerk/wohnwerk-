import Link from "next/link";

import { updateTenantContact } from "@/app/actions/tenants";
import { AdminOnly } from "@/components/admin-only";
import { Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { whatsappNummer } from "@/lib/mahnung";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Kontakte") };
}
export const dynamic = "force-dynamic";

/**
 * Kontaktliste: alle Mieter untereinander, Name, Telefon und private
 * E-Mail direkt in der Zeile aenderbar.
 *
 * Der Weg ueber die Mieterseite - oeffnen, scrollen, speichern, zurueck -
 * ist fuer eine Handvoll Nummern in Ordnung, fuer vierzig Monteure nicht.
 * Hier tippt man eine Nummer nach der anderen ein und drueckt Speichern.
 * Jede Zeile ist ihr eigenes Formular, damit ein Fehler in einer Zeile
 * die anderen nicht mitreisst.
 *
 * Alles freiwillig. Die Vertrags-E-Mail bleibt auf der Mieterseite.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; alle?: string }>;
}) {
  await requireAdmin();
  const { t } = await oberflaeche();
  const params = await searchParams;
  const mitEhemaligen = params.alle === "1";
  const back = mitEhemaligen ? "/mieter/kontakte?alle=1" : "/mieter/kontakte";

  const tenants = await prisma.tenant.findMany({
    where: mitEhemaligen ? {} : { status: "AKTIV" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      privateEmail: true,
      status: true,
      tenancies: {
        where: { status: { in: ["SENT", "ACTIVE"] } },
        select: { bed: { select: { label: true, room: { select: { name: true, property: { select: { name: true } } } } } } },
        take: 1,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const ohneTelefon = tenants.filter((m) => !whatsappNummer(m.phone)).length;

  return (
    <>
      <PageHeader
        title={t("Kontakte")}
        description={t("Name, Telefon und private E-Mail aller Mieter – direkt in der Zeile ändern. Nichts davon ist Pflicht.")}
        breadcrumb={[{ label: t("Mieter"), href: "/mieter" }, { label: t("Kontakte") }]}
        actions={
          <Link href={mitEhemaligen ? "/mieter/kontakte" : "/mieter/kontakte?alle=1"} className="btn btn-secondary">
            {mitEhemaligen ? t("Nur aktive Mieter") : t("Auch ehemalige Mieter")}
          </Link>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {ohneTelefon > 0 && (
        <p className="mb-4 text-sm text-ink-600">
          {t("{anzahl} von {gesamt} Mietern haben noch keine Telefonnummer – ohne sie gibt es bei den Mieteingängen keinen WhatsApp-Link.", {
            anzahl: ohneTelefon,
            gesamt: tenants.length,
          })}
        </p>
      )}

      {tenants.length === 0 ? (
        <Card>
          <EmptyState title={t("Noch keine Mieter")} />
        </Card>
      ) : (
        <Card padded={false}>
          {/* Kopfzeile nur am Schreibtisch; am Handy traegt jedes Feld seine
              eigene Beschriftung, sonst weiss man nicht, was wohin gehoert. */}
          <div className="hidden grid-cols-[0.85fr_0.85fr_1.15fr_1.35fr_auto] gap-3 border-b border-ink-200 px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-500 md:grid">
            <span>{t("Vorname")}</span>
            <span>{t("Nachname")}</span>
            <span>{t("Telefon")}</span>
            <span>{t("E-Mail privat")}</span>
            <span className="w-24" />
          </div>

          <ul className="divide-y divide-ink-100">
            {tenants.map((m) => {
              const bett = m.tenancies[0]?.bed;
              const wo = bett ? `${bett.room.property.name} · ${bett.room.name} · ${bett.label}` : null;
              return (
                <li key={m.id} className="px-4 py-3">
                  <form
                    action={updateTenantContact}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-[0.85fr_0.85fr_1.15fr_1.35fr_auto] md:items-end md:gap-3"
                  >
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="back" value={back} />

                    <div className="min-w-0 sm:col-span-2 md:col-span-5 md:hidden">
                      <Link href={`/mieter/${m.id}`} className="text-[0.9rem] font-medium text-ink-900 hover:text-brand-700">
                        {m.firstName} {m.lastName}
                      </Link>
                      {wo && <p className="text-xs text-ink-500">{wo}</p>}
                    </div>

                    <div className="min-w-0">
                      <label htmlFor={`vn-${m.id}`} className="md:sr-only">{t("Vorname")}</label>
                      <input id={`vn-${m.id}`} name="firstName" defaultValue={m.firstName} autoComplete="off" />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`nn-${m.id}`} className="md:sr-only">{t("Nachname")}</label>
                      <input id={`nn-${m.id}`} name="lastName" defaultValue={m.lastName} autoComplete="off" />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`tel-${m.id}`} className="md:sr-only">{t("Telefon")}</label>
                      <input
                        id={`tel-${m.id}`}
                        name="phone"
                        type="tel"
                        defaultValue={m.phone ?? ""}
                        placeholder="+49 151 2345678"
                        autoComplete="off"
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`em-${m.id}`} className="md:sr-only">{t("E-Mail privat")}</label>
                      <input
                        id={`em-${m.id}`}
                        name="privateEmail"
                        type="email"
                        defaultValue={m.privateEmail ?? ""}
                        placeholder="name@beispiel.de"
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2 md:col-span-1">
                      <AdminOnly>
                        <button type="submit" className="btn btn-secondary btn-sm w-24">
                          {t("Speichern")}
                        </button>
                      </AdminOnly>
                      {/* Am Schreibtisch steht der Name in den Feldern; der Weg
                          zur Mieterseite und der Ort brauchen trotzdem Platz. */}
                      <Link
                        href={`/mieter/${m.id}`}
                        className="hidden truncate text-xs text-ink-500 hover:text-brand-700 md:inline"
                        title={wo ?? undefined}
                      >
                        {wo ?? t("Kein Bett")}
                      </Link>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
