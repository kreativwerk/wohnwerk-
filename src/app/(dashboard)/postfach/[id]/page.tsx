import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowBendUpLeft, FilePdf, Image as BildIcon, Paperclip } from "@phosphor-icons/react/dist/ssr";

import {
  emailAnhangAlsBeleg,
  emailAnhangZumMieter,
  emailErledigt,
  emailMieterZuordnen,
  emailSenden,
  emailUngelesen,
} from "@/app/actions/postfach";
import { AdminOnly } from "@/components/admin-only";
import { Disclosure } from "@/components/interactive";
import { Badge, Card, Flash, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { MIETER_DOKUMENT_ARTEN } from "@/lib/mieterdokumente";
import { antwortBetreff, antwortZitat } from "@/lib/postfach-regeln";

export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("E-Mail") };
}
export const dynamic = "force-dynamic";

const TAG = 24 * 60 * 60 * 1000;

function groesse(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datum, datumZeit, geld } = await oberflaeche();
  const { id } = await params;
  const hinweis = await searchParams;

  const n = await prisma.emailNachricht.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
      anhaenge: {
        orderBy: { createdAt: "asc" },
        include: {
          dokument: {
            select: {
              id: true,
              kind: true,
              category: true,
              tenantId: true,
              amountCents: true,
              bankTransaction: { select: { id: true, bookingDate: true, amountCents: true, counterpartyName: true } },
            },
          },
        },
      },
    },
  });
  if (!n) notFound();
  if (n.richtung === "EIN" && !n.gelesen) {
    await prisma.emailNachricht.update({ where: { id }, data: { gelesen: true } });
  }

  const offeneAnhaenge = n.anhaenge.filter((a) => !a.dokument);
  const [mieterListe, ausgaben, antworten] = await Promise.all([
    prisma.tenant.findMany({
      where: { tenancies: { some: { status: { in: ["DRAFT", "SENT", "ACTIVE", "ENDED"] } } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    offeneAnhaenge.length > 0
      ? prisma.bankTransaction.findMany({
          where: {
            direction: "DEBIT",
            reviewStatus: { not: "IGNORED" },
            documents: { none: {} },
            bookingDate: { gte: new Date(n.datum.getTime() - 60 * TAG), lte: new Date(n.datum.getTime() + 90 * TAG) },
          },
          orderBy: { bookingDate: "desc" },
          take: 150,
          select: { id: true, bookingDate: true, amountCents: true, counterpartyName: true },
        })
      : [],
    prisma.emailNachricht.findMany({ where: { antwortAufId: id }, orderBy: { datum: "asc" }, select: { id: true, datum: true, an: true } }),
  ]);

  const absender = n.vonName ? `${n.vonName} <${n.vonAdresse}>` : n.vonAdresse;
  const antwortAn = n.richtung === "EIN" ? n.vonAdresse : n.an;
  const back = `/postfach/${id}`;

  return (
    <>
      <PageHeader
        title={n.betreff}
        breadcrumb={[{ label: t("Postfach"), href: "/postfach" }, { label: n.richtung === "AUS" ? t("Gesendet") : t("E-Mail") }]}
        actions={
          <AdminOnly>
            {n.richtung === "EIN" && (
              <form action={emailErledigt}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="erledigt" value={n.erledigt ? "0" : "1"} />
                <input type="hidden" name="back" value={n.erledigt ? back : "/postfach"} />
                <button type="submit" className={n.erledigt ? "btn btn-ghost" : "btn btn-primary"}>
                  {n.erledigt ? t("Wieder in den Posteingang") : t("✓ Erledigt")}
                </button>
              </form>
            )}
            {n.richtung === "EIN" && (
              <form action={emailUngelesen}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="btn btn-ghost">
                  {t("Als ungelesen markieren")}
                </button>
              </form>
            )}
          </AdminOnly>
        }
      />

      <Flash ok={hinweis.ok} fehler={hinweis.fehler} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card padded={false}>
            <div className="border-b border-ink-200 px-4 py-3 text-sm">
              <p className="text-ink-900">
                <span className="text-ink-500">{t("Von")}: </span>
                <span className="font-medium break-all">{absender}</span>
              </p>
              <p className="text-ink-700 break-all">
                <span className="text-ink-500">{t("An")}: </span>
                {n.an}
              </p>
              {n.cc && (
                <p className="text-ink-700 break-all">
                  <span className="text-ink-500">{t("Kopie")}: </span>
                  {n.cc}
                </p>
              )}
              <p className="text-ink-500">{datumZeit(n.datum)}</p>
              {antworten.length > 0 && (
                <p className="mt-1 text-xs text-emerald-700">
                  {antworten.map((a) => (
                    <Link key={a.id} href={`/postfach/${a.id}`} className="mr-2 hover:underline">
                      {t("Beantwortet am {zeit}", { zeit: datumZeit(a.datum) })}
                    </Link>
                  ))}
                </p>
              )}
            </div>
            {n.ergebnis && (
              <div className="border-b border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-[0.82rem] leading-relaxed text-emerald-900">
                <p className="font-semibold">{t("Automatisch erledigt")}</p>
                {n.ergebnis.split("\n").map((z, i) => (
                  <p key={i}>{z}</p>
                ))}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-relaxed text-ink-800">
              {n.text?.trim() || <span className="text-ink-400">{t("(kein Text)")}</span>}
            </div>
          </Card>

          {n.anhaenge.length > 0 && (
            <Card title={t("Anhänge")} padded={false}>
              <ul className="divide-y divide-ink-200/70">
                {n.anhaenge.map((a) => {
                  const Icon = a.mimeType === "application/pdf" ? FilePdf : a.mimeType.startsWith("image/") ? BildIcon : Paperclip;
                  const d = a.dokument;
                  return (
                    <li key={a.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a
                          href={a.driveUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-w-0 items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
                        >
                          <Icon size={18} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{a.dateiname}</span>
                          <span className="shrink-0 text-xs font-normal text-ink-500">{groesse(a.sizeBytes)}</span>
                        </a>
                        {d?.kind === "RECEIPT" && d.bankTransaction && (
                          <Badge tone="success">
                            {t("Beleg zu {buchung}", {
                              buchung: `${datum(d.bankTransaction.bookingDate)} · ${geld(d.bankTransaction.amountCents)}`,
                            })}
                          </Badge>
                        )}
                        {d?.kind === "RECEIPT" && !d.bankTransaction && (
                          <Badge tone="warning">
                            {t("Beleg ohne Buchung")}
                            {d.amountCents ? ` · ${geld(d.amountCents)}` : ""}
                          </Badge>
                        )}
                        {d && d.kind !== "RECEIPT" && d.tenantId && (
                          <Link href={`/mieter/${d.tenantId}#dokumente`}>
                            <Badge tone="brand">{t("Beim Mieter: {art}", { art: t(d.category ?? "Sonstiges") })}</Badge>
                          </Link>
                        )}
                      </div>

                      {!d && (
                        <AdminOnly>
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            <form action={emailAnhangAlsBeleg} className="rounded-lg border border-ink-200 p-3">
                              <input type="hidden" name="anhangId" value={a.id} />
                              <input type="hidden" name="nachrichtId" value={n.id} />
                              <label htmlFor={`buchung-${a.id}`}>{t("Als Beleg ablegen")}</label>
                              <select id={`buchung-${a.id}`} name="bankTransactionId" defaultValue="">
                                <option value="">{t("Buchung automatisch suchen")}</option>
                                {ausgaben.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {datum(b.bookingDate)} · {geld(b.amountCents)} · {(b.counterpartyName ?? "–").slice(0, 40)}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="btn btn-secondary btn-sm mt-2">
                                {t("Ablegen")}
                              </button>
                            </form>
                            <form action={emailAnhangZumMieter} className="rounded-lg border border-ink-200 p-3">
                              <input type="hidden" name="anhangId" value={a.id} />
                              <input type="hidden" name="nachrichtId" value={n.id} />
                              <label htmlFor={`mieter-${a.id}`}>{t("Beim Mieter ablegen")}</label>
                              <select id={`mieter-${a.id}`} name="tenantId" defaultValue={n.tenantId ?? ""} required>
                                <option value="">{t("– Mieter wählen –")}</option>
                                {mieterListe.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.lastName}, {m.firstName}
                                  </option>
                                ))}
                              </select>
                              <select name="art" defaultValue="Kündigung" className="mt-2" aria-label={t("Art")}>
                                {MIETER_DOKUMENT_ARTEN.map((art) => (
                                  <option key={art} value={art}>
                                    {t(art)}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="btn btn-secondary btn-sm mt-2">
                                {t("Ablegen")}
                              </button>
                            </form>
                          </div>
                        </AdminOnly>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <AdminOnly>
            <Card>
              <Disclosure summary={t("Antworten")} defaultOpen={false}>
                <form action={emailSenden} encType="multipart/form-data" className="grid gap-3">
                  <input type="hidden" name="antwortAufId" value={n.id} />
                  {n.tenantId && <input type="hidden" name="tenantId" value={n.tenantId} />}
                  <div>
                    <label htmlFor="an">{t("An")}</label>
                    <input id="an" name="an" defaultValue={antwortAn} required />
                  </div>
                  <div>
                    <label htmlFor="betreff">{t("Betreff")}</label>
                    <input id="betreff" name="betreff" defaultValue={antwortBetreff(n.betreff)} required />
                  </div>
                  <div>
                    <label htmlFor="text">{t("Nachricht")}</label>
                    <textarea
                      id="text"
                      name="text"
                      rows={10}
                      defaultValue={antwortZitat(absender, datumZeit(n.datum), n.text)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="dateien">{t("Anhänge")}</label>
                    <input id="dateien" name="dateien" type="file" multiple />
                  </div>
                  <div>
                    <button type="submit" className="btn btn-primary">
                      <ArrowBendUpLeft size={16} className="mr-1 inline-block align-[-3px]" aria-hidden="true" />
                      {t("Senden")}
                    </button>
                  </div>
                </form>
              </Disclosure>
            </Card>
          </AdminOnly>
        </div>

        <div className="space-y-4">
          <Card title={t("Mieter")}>
            {n.tenant ? (
              <p className="text-sm">
                <Link href={`/mieter/${n.tenant.id}`} className="font-semibold text-brand-700 hover:underline">
                  {n.tenant.firstName} {n.tenant.lastName}
                </Link>
              </p>
            ) : (
              <p className="text-sm text-ink-500">{t("Keinem Mieter zugeordnet.")}</p>
            )}
            <AdminOnly>
              <form action={emailMieterZuordnen} className="mt-3 grid gap-2">
                <input type="hidden" name="id" value={n.id} />
                <label htmlFor="zuordnen" className="sr-only">
                  {t("Mieter")}
                </label>
                <select id="zuordnen" name="tenantId" defaultValue={n.tenantId ?? ""}>
                  <option value="">{t("– keiner –")}</option>
                  {mieterListe.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.lastName}, {m.firstName}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-secondary btn-sm">
                  {t("Zuordnen")}
                </button>
              </form>
            </AdminOnly>
          </Card>
        </div>
      </div>
    </>
  );
}
