import Link from "next/link";
import { Paperclip, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import type { Prisma } from "@prisma/client";

import { postfachJetztAbrufen } from "@/app/actions/postfach";
import { AdminOnly } from "@/components/admin-only";
import { SuchFeld } from "@/components/suchfeld";
import { Badge, Card, EmptyState, Flash, PageHeader, Seitenwechsel } from "@/components/ui";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { postfachAbrufen, postfachStatus, postfachVeraltet } from "@/lib/postfach";
import { vorschau } from "@/lib/postfach-regeln";

export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Postfach") };
}
export const dynamic = "force-dynamic";
// Beim Oeffnen wird das Postfach abgeholt, wenn es laenger her ist.
export const maxDuration = 60;

const ANSICHTEN = ["eingang", "belege", "mieter", "gesendet", "erledigt", "alle"] as const;
type Ansicht = (typeof ANSICHTEN)[number];
const PRO_SEITE = 30;

/**
 * Das Postfach der Hausverwaltung in der App: neue Mails, was daraus
 * automatisch geworden ist (Beleg, Kuendigung), und Antworten von hier.
 */
export default async function PostfachPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; q?: string; seite?: string; mieter?: string; ok?: string; fehler?: string }>;
}) {
  const { t, datum, datumZeit } = await oberflaeche();
  const params = await searchParams;
  const ansicht: Ansicht = ANSICHTEN.includes(params.ansicht as Ansicht) ? (params.ansicht as Ansicht) : "eingang";
  const seite = Math.max(1, Number.parseInt(params.seite ?? "1", 10) || 1);

  let status = await postfachStatus();
  const sitzung = await getSessionUser();
  if (isAdmin(sitzung) && sitzung && status.eingerichtet && (await postfachVeraltet(15))) {
    await postfachAbrufen(sitzung.email, { hoechstens: 10 });
    status = await postfachStatus();
  }

  const basis: Prisma.EmailNachrichtWhereInput = {
    ...(params.mieter ? { tenantId: params.mieter } : {}),
    ...(params.q
      ? {
          OR: [
            { betreff: { contains: params.q, mode: "insensitive" } },
            { vonAdresse: { contains: params.q, mode: "insensitive" } },
            { vonName: { contains: params.q, mode: "insensitive" } },
            { an: { contains: params.q, mode: "insensitive" } },
            { text: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const filter: Record<Ansicht, Prisma.EmailNachrichtWhereInput> = {
    eingang: { richtung: "EIN", erledigt: false },
    belege: { richtung: "EIN", anhaenge: { some: { dokument: { kind: "RECEIPT" } } } },
    mieter: { tenantId: { not: null } },
    gesendet: { richtung: "AUS" },
    erledigt: { richtung: "EIN", erledigt: true },
    alle: {},
  };
  const where = { ...basis, ...filter[ansicht] };

  const [nachrichten, gesamt, ungelesen, zahlen, mieter] = await Promise.all([
    prisma.emailNachricht.findMany({
      where,
      orderBy: { datum: "desc" },
      skip: (seite - 1) * PRO_SEITE,
      take: PRO_SEITE,
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        anhaenge: { select: { id: true, dokument: { select: { kind: true, bankTransactionId: true, category: true } } } },
      },
    }),
    prisma.emailNachricht.count({ where }),
    prisma.emailNachricht.count({ where: { richtung: "EIN", gelesen: false, erledigt: false } }),
    Promise.all(ANSICHTEN.map((a) => prisma.emailNachricht.count({ where: { ...basis, ...filter[a] } }))),
    params.mieter ? prisma.tenant.findUnique({ where: { id: params.mieter }, select: { firstName: true, lastName: true } }) : null,
  ]);
  const anzahl = Object.fromEntries(ANSICHTEN.map((a, i) => [a, zahlen[i]])) as Record<Ansicht, number>;
  const seiten = Math.max(1, Math.ceil(gesamt / PRO_SEITE));

  const adresse = (aenderung: Record<string, string | null>) => {
    const suche = new URLSearchParams();
    for (const [k, v] of Object.entries({ ansicht: ansicht === "eingang" ? null : ansicht, q: params.q ?? null, mieter: params.mieter ?? null, ...aenderung })) {
      if (v) suche.set(k, v);
    }
    const text = suche.toString();
    return text ? `/postfach?${text}` : "/postfach";
  };

  const chips: Array<{ wert: Ansicht; label: string }> = [
    { wert: "eingang", label: t("Posteingang") },
    { wert: "belege", label: t("Belege") },
    { wert: "mieter", label: t("Von Mietern") },
    { wert: "gesendet", label: t("Gesendet") },
    { wert: "erledigt", label: t("Erledigt") },
    { wert: "alle", label: t("Alle") },
  ];

  return (
    <>
      <PageHeader
        title={t("Postfach")}
        description={
          status.eingerichtet
            ? t("{adresse} · Rechnungen werden automatisch als Beleg abgelegt, Kündigungen beim Mieter.", { adresse: status.benutzer ?? "" })
            : t("E-Mails der Hausverwaltung in der App.")
        }
        actions={
          status.eingerichtet ? (
            <AdminOnly>
              <form action={postfachJetztAbrufen}>
                <input type="hidden" name="back" value={adresse({})} />
                <button type="submit" className="btn btn-secondary">
                  {t("Jetzt abrufen")}
                </button>
              </form>
              <Link href="/postfach/neu" className="btn btn-primary">
                <PencilSimple size={16} className="mr-1 inline-block align-[-3px]" aria-hidden="true" />
                {t("Neue E-Mail")}
              </Link>
            </AdminOnly>
          ) : null
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {!status.eingerichtet ? (
        <Card>
          <EmptyState
            title={t("Noch kein Postfach verbunden")}
            description={t("In den Einstellungen das Postfach (IONOS, Strato …) mit E-Mail-Adresse und Passwort eintragen. Danach holt die App neue E-Mails selbst ab.")}
            action={
              <Link href="/einstellungen#postfach" className="btn btn-primary">
                {t("Postfach einrichten")}
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {status.zuletzt && (
            <p className={`mb-3 text-xs ${status.zuletzt.ok ? "text-ink-500" : "text-rose-700"}`}>
              {status.zuletzt.ok
                ? t("Zuletzt abgerufen: {zeit}", { zeit: datumZeit(status.zuletzt.zeitpunkt) })
                : t("Letzter Abruf fehlgeschlagen ({zeit}): {fehler}", { zeit: datumZeit(status.zuletzt.zeitpunkt), fehler: t(status.zuletzt.fehler ?? "") })}
              {ungelesen > 0 && ` · ${t("{anzahl} ungelesen", { anzahl: ungelesen })}`}
            </p>
          )}

          {mieter && (
            <p className="mb-3 text-sm text-ink-700">
              {t("E-Mails von und an {name}", { name: `${mieter.firstName} ${mieter.lastName}` })} ·{" "}
              <Link href={adresse({ mieter: null })} className="font-semibold text-brand-700 hover:underline">
                {t("Alle zeigen")}
              </Link>
            </p>
          )}

          <div className="scroll-schatten -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {chips.map((chip) => {
              const aktiv = ansicht === chip.wert;
              return (
                <Link
                  key={chip.wert}
                  href={adresse({ ansicht: chip.wert === "eingang" ? null : chip.wert, seite: null })}
                  aria-current={aktiv ? "page" : undefined}
                  className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.8rem] font-medium transition-colors ${
                    aktiv ? "bg-brand-700 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:text-brand-700"
                  }`}
                >
                  {chip.label}
                  <span className={aktiv ? "tabular-nums text-white/70" : "tabular-nums text-ink-400"}>{anzahl[chip.wert]}</span>
                </Link>
              );
            })}
          </div>

          <div className="mb-3 max-w-md">
            <SuchFeld defaultValue={params.q ?? ""} placeholder={t("Absender, Betreff, Text …")} />
          </div>

          <Card padded={false}>
            {nachrichten.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={ansicht === "eingang" ? t("Posteingang ist leer") : t("Keine E-Mails")}
                  description={ansicht === "eingang" ? t("Alles erledigt – neue E-Mails erscheinen hier automatisch.") : t("Andere Ansicht wählen oder Suche anpassen.")}
                />
              </div>
            ) : (
              <ul className="zebra-liste divide-y divide-ink-200/70">
                {nachrichten.map((n) => {
                  const ungelesenZeile = n.richtung === "EIN" && !n.gelesen;
                  const belege = n.anhaenge.filter((a) => a.dokument?.kind === "RECEIPT");
                  const zugeordnet = belege.filter((a) => a.dokument?.bankTransactionId).length;
                  const kuendigung = n.anhaenge.some((a) => a.dokument?.category === "Kündigung") || (n.ergebnis ?? "").startsWith("Kündigung");
                  const wer = n.richtung === "AUS" ? `${t("An")}: ${n.an}` : n.vonName || n.vonAdresse;
                  return (
                    <li key={n.id}>
                      <Link href={`/postfach/${n.id}`} className="block px-4 py-3 transition-colors hover:bg-brand-100/60">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`min-w-0 truncate text-sm ${ungelesenZeile ? "font-bold text-ink-900" : "font-medium text-ink-800"}`}>
                            {ungelesenZeile && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-600 align-middle" aria-label={t("ungelesen")} />}
                            {wer}
                          </p>
                          <span className="shrink-0 text-xs tabular-nums text-ink-500">{datum(n.datum)}</span>
                        </div>
                        <p className={`truncate text-sm ${ungelesenZeile ? "font-semibold text-ink-900" : "text-ink-700"}`}>{n.betreff}</p>
                        <p className="truncate text-xs text-ink-500">{vorschau(n.text)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {n.anhaenge.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-ink-500">
                              <Paperclip size={13} aria-hidden="true" />
                              {n.anhaenge.length}
                            </span>
                          )}
                          {belege.length > 0 && (
                            <Badge tone={zugeordnet === belege.length ? "success" : "warning"}>
                              {zugeordnet === belege.length ? t("Beleg zugeordnet") : t("Beleg ohne Buchung")}
                            </Badge>
                          )}
                          {kuendigung && <Badge tone="danger">{t("Kündigung")}</Badge>}
                          {n.tenant && (
                            <Badge tone="brand">
                              {n.tenant.firstName} {n.tenant.lastName}
                            </Badge>
                          )}
                          {n.richtung === "AUS" && <Badge tone="info">{t("Gesendet")}</Badge>}
                          {n.erledigt && n.richtung === "EIN" && <Badge tone="neutral">{t("Erledigt")}</Badge>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Seitenwechsel
              seite={seite}
              seiten={seiten}
              href={(ziel: number) => adresse({ seite: ziel > 1 ? String(ziel) : null })}
              beschriftung={t("Seite {seite} von {seiten} · {gesamt} E-Mails", { seite, seiten, gesamt })}
              zurueck={t("Zurück")}
              weiter={t("Weiter")}
            />
          </Card>
        </>
      )}
    </>
  );
}
