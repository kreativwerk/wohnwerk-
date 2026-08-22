import Link from "next/link";

import { runExport, saveDatevSettings, shareWithAccountant } from "@/app/actions/accounting";
import { readDatevSettings } from "@/lib/datev";
import { AdminOnly } from "@/components/admin-only";
import { Alert, Card, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { checkDriveStatus, folderLink } from "@/lib/storage";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Steuerberater-Export" };
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
        title="Steuerberater-Export"
        description="Alle Zahlen und Belege eines Jahres – als CSV zum Herunterladen und als Ordner in Google Drive zum Freigeben."
        breadcrumb={[{ label: "Buchhaltung", href: "/buchhaltung" }, { label: "Steuerberater" }]}
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
              Jahr wechseln
            </button>
          </form>
        }
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Einnahmen ${year}`} value={formatCents(income)} tone="success" />
        <StatCard label={`Ausgaben ${year}`} value={formatCents(expense)} tone="danger" />
        <StatCard label="Belege" value={String(documents)} hint={`${charges} Mietforderungen`} />
        <StatCard
          label="Ausgaben ohne Beleg"
          value={String(missingReceipts)}
          tone={missingReceipts > 0 ? "warning" : "success"}
          href="/buchhaltung?fehlend=1"
        />
      </div>

      {missingReceipts > 0 && (
        <div className="mt-5">
          <Alert tone="warning" title="Vor der Übergabe prüfen">
            Für {missingReceipts} Ausgabe(n) liegt noch kein Beleg vor. Ohne Beleg kann der
            Steuerberater die Buchung in der Regel nicht anerkennen.{" "}
            <Link href="/buchhaltung?fehlend=1" className="font-semibold underline">
              Fehlende Belege anzeigen
            </Link>
          </Alert>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Direkt herunterladen" description="Öffnet sich in Excel und LibreOffice ohne Umwege.">
          <Table>
            <thead>
              <tr>
                <Th>Auswertung</Th>
                <Th>Inhalt</Th>
                <Th align="right">Download</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td className="font-medium">Buchungen</Td>
                <Td className="text-xs text-ink-500">
                  Alle Bankumsätze mit Kategorie, Objekt, Mieter und Beleg-Link
                </Td>
                <Td align="right">
                  <a href={`/api/export/buchungen?jahr=${year}`} className="btn btn-secondary">
                    CSV
                  </a>
                </Td>
              </tr>
              <tr>
                <Td className="font-medium">Belegliste</Td>
                <Td className="text-xs text-ink-500">
                  Alle Belege mit Betrag, USt-Satz, Lieferant und Ablageort
                </Td>
                <Td align="right">
                  <a href={`/api/export/belege?jahr=${year}`} className="btn btn-secondary">
                    CSV
                  </a>
                </Td>
              </tr>
              <tr>
                <Td className="font-medium">DATEV-Buchungsstapel</Td>
                <Td className="text-xs text-ink-500">
                  EXTF-Format für die Kanzlei – direkt in DATEV einlesbar
                </Td>
                <Td align="right">
                  <a href={`/api/export/datev?jahr=${year}`} className="btn btn-secondary">
                    CSV
                  </a>
                </Td>
              </tr>
              <tr>
                <Td className="font-medium">Mieten</Td>
                <Td className="text-xs text-ink-500">
                  Soll und Ist je Mieter und Monat, inklusive offener Posten
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
              Einzelner Monat
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
          <Card title="In Google Drive ablegen">
            {drive.ok ? (
              <Alert tone="success">{drive.message}</Alert>
            ) : (
              <Alert tone={drive.configured ? "danger" : "warning"}>
                {drive.message}{" "}
                <Link href="/einstellungen" className="font-semibold underline">
                  Einrichten
                </Link>
              </Alert>
            )}

            <form action={runExport} className="mt-4 space-y-3">
              <input type="hidden" name="year" value={year} />
              <div>
                <label htmlFor="month">Zeitraum</label>
                <select id="month" name="month" defaultValue="0">
                  <option value="0">Gesamtes Jahr {year}</option>
                  {MONTHS.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label} {year}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary w-full">
                Export erzeugen und ablegen
              </button>
              <p className="field-hint">
                Legt die CSV-Dateien unter <code>Buchhaltung / {year} / Steuerberater-Export</code> ab.
                Die Belege liegen bereits in den Monatsordnern daneben.
              </p>
            </form>

            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary mt-3 w-full"
              >
                Ordner in Google Drive öffnen
              </a>
            )}
          </Card>

          <Card
            title="Ordner freigeben"
            description={`Der Steuerberater erhält Leserechte auf den kompletten Jahresordner ${year}.`}
          >
            <form action={shareWithAccountant} className="space-y-3">
              <input type="hidden" name="year" value={year} />
              <div>
                <label htmlFor="email">E-Mail des Steuerberaters</label>
                <input id="email" name="email" type="email" required placeholder="kanzlei@beispiel.de" />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={!drive.ok}>
                Ordner freigeben
              </button>
              {!drive.ok && (
                <p className="field-hint">
                  Erst möglich, wenn Google Drive verbunden ist.
                </p>
              )}
            </form>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminOnly>
          <Card
            title="DATEV-Stammdaten"
            description="Diese Nummern vergibt Ihre Kanzlei. Ohne sie ist der Buchungsstapel trotzdem lesbar, DATEV fragt die Zuordnung dann beim Einlesen ab."
          >
            <form action={saveDatevSettings} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="datev-berater">Beraternummer</label>
                <input id="datev-berater" name="beraterNr" inputMode="numeric" defaultValue={datev.beraterNr} placeholder="z. B. 12345" />
              </div>
              <div>
                <label htmlFor="datev-mandant">Mandantennummer</label>
                <input id="datev-mandant" name="mandantNr" inputMode="numeric" defaultValue={datev.mandantNr} placeholder="z. B. 678" />
              </div>
              <div>
                <label htmlFor="datev-bank">Sachkonto Bank</label>
                <input id="datev-bank" name="kontoBank" inputMode="numeric" defaultValue={datev.kontoBank} />
                <p className="field-hint">SKR03: 1200</p>
              </div>
              <div>
                <label htmlFor="datev-erloes">Konto Mieteinnahmen</label>
                <input id="datev-erloes" name="kontoErloes" inputMode="numeric" defaultValue={datev.kontoErloes} />
                <p className="field-hint">Mit der Kanzlei abstimmen</p>
              </div>
              <div>
                <label htmlFor="datev-aufwand">Konto Ausgaben</label>
                <input id="datev-aufwand" name="kontoAufwand" inputMode="numeric" defaultValue={datev.kontoAufwand} />
                <p className="field-hint">Sammelkonto, Kanzlei bucht um</p>
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn btn-secondary">Speichern</button>
              </div>
            </form>
          </Card>
        </AdminOnly>

        <Card
          title="Exportordner"
          description="Jeder abgelegte Stand bleibt hier nachvollziehbar – wer der Kanzlei wann welche Zahlen übergeben hat."
        >
          {abgelegte.length === 0 ? (
            <p className="text-sm text-ink-500">
              Noch kein Export abgelegt. „In Google Drive ablegen“ erzeugt alle Dateien –
              einschließlich DATEV – und verzeichnet sie hier.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Datei</Th>
                  <Th>Abgelegt</Th>
                  <Th align="right">Öffnen</Th>
                </tr>
              </thead>
              <tbody>
                {abgelegte.map((doc) => (
                  <tr key={doc.id}>
                    <Td className="font-medium">{doc.title}</Td>
                    <Td className="text-xs text-ink-500">{formatDateTime(doc.uploadedAt)}</Td>
                    <Td align="right">
                      {doc.driveUrl ? (
                        <a href={doc.driveUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                          Drive
                        </a>
                      ) : doc.localPath ? (
                        <a href={`/api/dateien/${doc.localPath.split("/").map(encodeURIComponent).join("/")}`} className="btn btn-ghost btn-sm">
                          Datei
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
        <Card title="So ist die Ablage aufgebaut">
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
            Jeder Beleg wird beim Hochladen direkt in den richtigen Monatsordner gelegt. Die
            CSV-Dateien enthalten zu jeder Buchung den Link auf den passenden Beleg – der
            Steuerberater muss nichts suchen.
          </p>
        </Card>
      </div>
    </>
  );
}
