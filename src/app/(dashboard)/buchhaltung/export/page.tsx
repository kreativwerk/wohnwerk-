import Link from "next/link";

import { runExport, saveDatevSettings, shareWithAccountant } from "@/app/actions/accounting";
import { readDatevSettings } from "@/lib/datev";
import { AdminOnly } from "@/components/admin-only";
import { Alert, Card, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { checkDriveStatus, folderLink } from "@/lib/storage";

import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Steuerberater-Export") };
}
export const dynamic = "force-dynamic";

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; jahr?: string }>;
}) {
  const { t, datumZeit, geld } = await oberflaeche();
  const params = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const year = Number(params.jahr) || currentYear;

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const [drive, transactions, documents, charges, link] = await Promise.all([
    checkDriveStatus(),
    prisma.bankTransaction.findMany({
      where: { bookingDate: { gte: from, lte: to } },
      select: { amountCents: true, direction: true, documents: { select: { id: true } } },
    }),
    prisma.document.count({
      where: {
        OR: [
          { documentDate: { gte: from, lte: to } },
          { documentDate: null, uploadedAt: { gte: from, lte: to } },
        ],
      },
    }),
    prisma.rentCharge.count({ where: { periodYear: year } }),
    folderLink(["Buchhaltung", String(year)]),
  ]);

  const income = transactions
    .filter((tx) => tx.direction === "CREDIT")
    .reduce((sum, tx) => sum + tx.amountCents, 0);
  const expense = transactions
    .filter((tx) => tx.direction === "DEBIT")
    .reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);
  const missingReceipts = transactions.filter(
    (tx) => tx.direction === "DEBIT" && tx.documents.length === 0,
  ).length;

  const years = Array.from({ length: 5 }, (_, index) => currentYear - index);
  const datev = await readDatevSettings();
  const abgelegte = await prisma.document.findMany({
    where: { kind: "EXPORT" },
    orderBy: { uploadedAt: "desc" },
    take: 30,
  });

  return (
    <>
      <PageHeader
        title={t("Steuerberater-Export")}
        description={t("Alle Zahlen und Belege eines Jahres – als CSV zum Herunterladen und als Exportordner für die Kanzlei.")}
        breadcrumb={[{ label: t("Buchhaltung"), href: "/buchhaltung" }, { label: t("Steuerberater") }]}
        actions={
          <form className="flex items-center gap-2">
            <select name="jahr" defaultValue={String(year)}>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary">
              {t("Jahr wechseln")}
            </button>
          </form>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={`Einnahmen ${year}`} value={geld(income)} tone="success" />
        <StatCard label={`Ausgaben ${year}`} value={geld(expense)} tone="danger" />
        <StatCard label={t("Belege")} value={String(documents)} hint={`${charges} Mietforderungen`} />
        <StatCard
          label={t("Ausgaben ohne Beleg")}
          value={String(missingReceipts)}
          tone={missingReceipts > 0 ? "warning" : "success"}
          href="/buchhaltung?fehlend=1"
        />
      </div>

      {missingReceipts > 0 && (
        <div className="mt-5">
          <Alert tone="warning" title={t("Vor der Übergabe prüfen")}>
            {t("Für {anzahl} Ausgabe(n) liegt noch kein Beleg vor. Ohne Beleg kann der Steuerberater die Buchung in der Regel nicht anerkennen.", { anzahl: missingReceipts })}{" "}
            <Link href="/buchhaltung?fehlend=1" className="font-semibold underline">
              {t("Fehlende Belege anzeigen")}
            </Link>
          </Alert>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title={t("Direkt herunterladen")} description={t("Öffnet sich in Excel und LibreOffice ohne Umwege.")}>
          <Table>
            <thead>
              <tr>
                <Th>{t("Auswertung")}</Th>
                <Th>{t("Inhalt")}</Th>
                <Th align="right">{t("Download")}</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td className="font-medium">{t("Buchungen")}</Td>
                <Td className="text-xs text-ink-500">
                  {t("Alle Bankumsätze mit Kategorie, Objekt, Mieter und Beleg-Link")}
                </Td>
                <Td align="right">
                  <a href={`/api/export/buchungen?jahr=${year}`} className="btn btn-secondary">
                    CSV
                  </a>
                </Td>
              </tr>
              <tr>
                <Td className="font-medium">{t("Belegliste")}</Td>
                <Td className="text-xs text-ink-500">
                  {t("Alle Belege mit Betrag, USt-Satz, Lieferant und Ablageort")}
                </Td>
                <Td align="right">
                  <a href={`/api/export/belege?jahr=${year}`} className="btn btn-secondary">
                    CSV
                  </a>
                </Td>
              </tr>
              <tr>
                <Td className="font-medium">{t("DATEV-Buchungsstapel")}</Td>
                <Td className="text-xs text-ink-500">
                  {t("EXTF-Format für die Kanzlei – direkt in DATEV einlesbar")}
                </Td>
                <Td align="right">
                  <a href={`/api/export/datev?jahr=${year}`} className="btn btn-secondary">
                    CSV
                  </a>
                </Td>
              </tr>
              <tr>
                <Td className="font-medium">{t("Mieten")}</Td>
                <Td className="text-xs text-ink-500">
                  {t("Soll und Ist je Mieter und Monat, inklusive offener Posten")}
                </Td>
                <Td align="right">
                  <a href={`/api/export/mieten?jahr=${year}`} className="btn btn-secondary">
                    CSV
                  </a>
                </Td>
              </tr>
            </tbody>
          </Table>

          <div className="mt-5 border-t border-ink-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              {t("Einzelner Monat")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MONTHS.map((label, index) => (
                <a
                  key={label}
                  href={`/api/export/buchungen?jahr=${year}&monat=${index + 1}`}
                  className="rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:border-brand-400 hover:text-brand-700"
                >
                  {label.slice(0, 3)}
                </a>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title={t("Export in die Ablage")}>
            {drive.ok ? (
              <Alert tone="success">{t(drive.message, drive.werte)}</Alert>
            ) : (
              <Alert tone={drive.configured ? "danger" : "warning"}>
                {t(drive.message, drive.werte)}{" "}
                <Link href="/einstellungen" className="font-semibold underline">
                  {t("Einrichten")}
                </Link>
              </Alert>
            )}

            <form action={runExport} className="mt-4 space-y-3">
              <input type="hidden" name="year" value={year} />
              <div>
                <label htmlFor="month">{t("Zeitraum")}</label>
                <select id="month" name="month" defaultValue="0">
                  <option value="0">{t("Gesamtes Jahr {jahr}", { jahr: year })}</option>
                  {MONTHS.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label} {year}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary w-full">
                {t("Export erzeugen und ablegen")}
              </button>
              <p className="field-hint">
                {t("Legt die CSV-Dateien unter")} <code>Buchhaltung / {year} / Steuerberater-Export</code> {t("ab. Die Belege liegen bereits in den Monatsordnern daneben.")}
              </p>
            </form>

            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary mt-3 w-full"
              >
                {t("Ordner in Google Drive öffnen")}
              </a>
            )}
          </Card>

          {drive.mode === "service-account" || drive.mode === "oauth" ? (
            <Card
              title={t("Ordner freigeben")}
              description={t("Der Steuerberater erhält Leserechte auf den kompletten Jahresordner {jahr}.", { jahr: year })}
            >
              <form action={shareWithAccountant} className="space-y-3">
                <input type="hidden" name="year" value={year} />
                <div>
                  <label htmlFor="email">{t("E-Mail des Steuerberaters")}</label>
                  <input id="email" name="email" type="email" required placeholder="kanzlei@beispiel.de" />
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={!drive.ok}>
                  {t("Ordner freigeben")}
                </button>
              </form>
            </Card>
          ) : (
            <Card
              title={t("Zugang für den Steuerberater")}
              description={t("Kein Ordner-Freigeben nötig – der Steuerberater arbeitet direkt in der App.")}
            >
              <p className="text-sm text-ink-600">
                {t("Legen Sie unter")}{" "}
                <Link href="/einstellungen" className="font-semibold text-brand-700 hover:underline">
                  {t("Einstellungen → Benutzer")}
                </Link>{" "}
                {t("einen Zugang mit der Rolle „Steuerberater“ an. Dieser sieht ausschließlich die Buchhaltung (nur lesend) und kann die Exporte und Belege hier selbst herunterladen.")}
              </p>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <AdminOnly>
          <Card
            title={t("DATEV-Stammdaten")}
            description={t("Diese Nummern vergibt Ihre Kanzlei. Ohne sie ist der Buchungsstapel trotzdem lesbar, DATEV fragt die Zuordnung dann beim Einlesen ab.")}
          >
            <form action={saveDatevSettings} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="datev-berater">{t("Beraternummer")}</label>
                <input id="datev-berater" name="beraterNr" inputMode="numeric" defaultValue={datev.beraterNr} placeholder={t("z. B. 12345")} />
              </div>
              <div>
                <label htmlFor="datev-mandant">{t("Mandantennummer")}</label>
                <input id="datev-mandant" name="mandantNr" inputMode="numeric" defaultValue={datev.mandantNr} placeholder={t("z. B. 678")} />
              </div>
              <div>
                <label htmlFor="datev-bank">{t("Sachkonto Bank")}</label>
                <input id="datev-bank" name="kontoBank" inputMode="numeric" defaultValue={datev.kontoBank} />
                <p className="field-hint">{t("SKR03: 1200")}</p>
              </div>
              <div>
                <label htmlFor="datev-erloes">{t("Konto Mieteinnahmen")}</label>
                <input id="datev-erloes" name="kontoErloes" inputMode="numeric" defaultValue={datev.kontoErloes} />
                <p className="field-hint">{t("Mit der Kanzlei abstimmen")}</p>
              </div>
              <div>
                <label htmlFor="datev-aufwand">{t("Konto Ausgaben")}</label>
                <input id="datev-aufwand" name="kontoAufwand" inputMode="numeric" defaultValue={datev.kontoAufwand} />
                <p className="field-hint">{t("Sammelkonto, Kanzlei bucht um")}</p>
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn btn-secondary">{t("Speichern")}</button>
              </div>
            </form>
          </Card>
        </AdminOnly>

        <Card
          title={t("Exportordner")}
          description={t("Jeder abgelegte Stand bleibt hier nachvollziehbar – wer der Kanzlei wann welche Zahlen übergeben hat.")}
        >
          {abgelegte.length === 0 ? (
            <p className="text-sm text-ink-500">
              {t("Noch kein Export abgelegt. „Export erzeugen und ablegen“ erzeugt alle Dateien – einschließlich DATEV – und verzeichnet sie hier.")}
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("Datei")}</Th>
                  <Th>{t("Abgelegt")}</Th>
                  <Th align="right">{t("Öffnen")}</Th>
                </tr>
              </thead>
              <tbody>
                {abgelegte.map((doc) => (
                  <tr key={doc.id}>
                    <Td className="font-medium">{doc.title}</Td>
                    <Td className="text-xs text-ink-500">{datumZeit(doc.uploadedAt)}</Td>
                    <Td align="right">
                      {doc.driveUrl ? (
                        <a href={doc.driveUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                          {doc.driveUrl.startsWith("/") ? t("Öffnen") : "Drive"}
                        </a>
                      ) : doc.localPath ? (
                        <a href={`/api/dateien/${doc.localPath.split("/").map(encodeURIComponent).join("/")}`} className="btn btn-ghost btn-sm">
                          {t("Datei")}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-500">–</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card title={t("So ist die Ablage aufgebaut")}>
          <pre className="overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs leading-relaxed text-ink-200">
{`Wohnwerk/
├── Mietverträge/
│   └── ${year}/                     Unterschriebene Verträge als PDF
└── Buchhaltung/
    └── ${year}/
        ├── 01 Belege/ … 12 Belege/  Rechnungen und Quittungen je Monat
        ├── Kontoauszüge/            Originaldateien der Bank
        └── Steuerberater-Export/    Buchungen, Belegliste, Mieten, DATEV`}
          </pre>
          <p className="mt-3 text-sm text-ink-500">
            {t("Jeder Beleg wird beim Hochladen direkt in den richtigen Monatsordner gelegt. Die CSV-Dateien enthalten zu jeder Buchung den Link auf den passenden Beleg – der Steuerberater muss nichts suchen.")}
          </p>
        </Card>
      </div>
    </>
  );
}
