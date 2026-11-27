import { LogoHell } from "@/components/logo";
import { Table, Td, Th } from "@/components/ui";
import { VertraegeZip } from "@/components/vertraege-zip";
import { requireBankUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { vertragsExportStand } from "@/lib/vertrags-export";

export async function generateMetadata() {
  return { title: "Mietverträge · Wohnwerk" };
}
export const dynamic = "force-dynamic";

/**
 * Seite fuer den Bank-Zugang: nur die aktiven, unterschriebenen
 * Mietvertraege - ansehen, einzeln oder alle auf einmal herunterladen.
 * Keine Navigation in die App, keine weiteren Daten.
 */
export default async function BankPage() {
  const user = await requireBankUser();
  const heute = new Date();
  const stand = await vertragsExportStand(heute);
  const vertraege = stand.aktiv.filter((z) => z.contractId && z.pdf);

  // Monatsmiete je Vertrag fuer die Uebersicht
  const mieten = new Map(
    (
      await prisma.tenancy.findMany({
        where: { id: { in: vertraege.map((v) => v.tenancyId) } },
        select: { id: true, monthlyRentCents: true },
      })
    ).map((t) => [t.id, t.monthlyRentCents]),
  );
  const objekte = [...new Set(vertraege.map((v) => v.objekt))];
  const summe = vertraege.reduce((s, v) => s + (mieten.get(v.tenancyId) ?? 0), 0);
  const datum = heute.toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-ink-100 pb-12">
      <header className="border-b-4 border-brand-600 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <LogoHell className="h-9 w-auto" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-600">{user.name}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn-secondary btn-sm">Abmelden</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4">
        <h1 className="mt-6 text-2xl font-bold text-brand-800">Aktive Mietverträge</h1>
        <p className="mt-1 text-sm text-ink-600">
          Wohnwerk Immobilien A² eGbR · Stand {formatDate(heute)} · nur laufende, unterschriebene Verträge
        </p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-xs text-ink-500">Verträge</p>
            <p className="text-2xl font-bold text-ink-900">{vertraege.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-ink-500">Objekte</p>
            <p className="text-2xl font-bold text-ink-900">{objekte.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-ink-500">Monatsmieten zusammen</p>
            <p className="text-2xl font-bold text-ink-900">{formatCents(summe)}</p>
          </div>
        </div>

        <section className="card mt-5 p-5">
          <h2 className="text-base font-bold text-brand-700">Alle herunterladen</h2>
          <p className="mb-3 mt-1 text-sm text-ink-600">
            Alle {vertraege.length} Verträge als eine ZIP-Datei, nach Objekt sortiert.
          </p>
          <VertraegeZip
            dateien={vertraege.map((v) => ({
              url: `/api/bank/vertrag/${v.contractId}`,
              zipPfad: `Mietvertraege/${v.objekt.replace(/[\\/:*?"<>|]+/g, "-")}/${v.mieter.replace(/[\\/:*?"<>|]+/g, "-")} (${v.zimmer.replace(/[\\/:*?"<>|]+/g, "-")}).pdf`,
            }))}
            dateiname={`Wohnwerk-Mietvertraege-${datum}.zip`}
          />
        </section>

        {objekte.map((objekt) => {
          const zeilen = vertraege.filter((v) => v.objekt === objekt);
          return (
            <section key={objekt} className="card mt-5 overflow-hidden">
              <h2 className="px-5 pb-2 pt-4 text-base font-bold text-brand-700">
                {objekt} <span className="font-normal text-ink-500">({zeilen.length})</span>
              </h2>
              <Table>
                <thead>
                  <tr>
                    <Th>Mieter</Th>
                    <Th>Zimmer</Th>
                    <Th>Mietbeginn</Th>
                    <Th align="right">Miete / Monat</Th>
                    <Th align="right">Vertrag</Th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((v) => (
                    <tr key={v.tenancyId} className="odd:bg-ink-50/60">
                      <Td className="font-medium">{v.mieter}</Td>
                      <Td>{v.zimmer}</Td>
                      <Td className="whitespace-nowrap">{formatDate(v.einzug)}</Td>
                      <Td align="right" className="tabular-nums">{formatCents(mieten.get(v.tenancyId) ?? 0)}</Td>
                      <Td align="right">
                        <a href={`/api/bank/vertrag/${v.contractId}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                          PDF
                        </a>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          );
        })}

        <p className="mt-6 text-xs text-ink-500">
          Vertraulich – nur zur Prüfung durch die finanzierende Bank. Abrufe werden protokolliert.
        </p>
      </main>
    </div>
  );
}
