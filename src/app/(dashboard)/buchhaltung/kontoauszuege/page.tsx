import {
  createBankAccount,
  deleteBankAccount,
  deleteStatement,
  importStatement,
} from "@/app/actions/accounting";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { Alert, Card, EmptyState, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";

export const metadata = { title: "Kontoauszüge" };
export const dynamic = "force-dynamic";

const FORMAT_LABEL: Record<string, string> = {
  csv: "CSV",
  camt053: "CAMT.053 (XML)",
  mt940: "MT940",
};

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const params = await searchParams;

  const [accounts, statements] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { transactions: true } } },
    }),
    prisma.bankStatement.findMany({
      include: { bankAccount: { select: { name: true } } },
      orderBy: { importedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Kontoauszüge"
        description="Bankdatei hochladen – die Buchungen werden eingelesen, Duplikate übersprungen und Mietzahlungen automatisch zugeordnet."
        breadcrumb={[{ label: "Buchhaltung", href: "/buchhaltung" }, { label: "Kontoauszüge" }]}
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Kontoauszug hochladen">
            {accounts.length === 0 ? (
              <Alert tone="warning" title="Zuerst ein Bankkonto anlegen">
                Rechts können Sie das Geschäftskonto mit IBAN hinterlegen. Danach lassen sich Auszüge
                hochladen.
              </Alert>
            ) : (
              <form action={importStatement} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="bankAccountId">Bankkonto *</label>
                    <select id="bankAccountId" name="bankAccountId" required>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} · {account.iban}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="file">Datei *</label>
                    <input
                      id="file"
                      name="file"
                      type="file"
                      required
                      accept=".csv,.txt,.xml,.sta,.mt940,.940"
                    />
                  </div>
                </div>

                <Alert tone="info" title="Unterstützte Formate">
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                    <li>
                      <strong>CSV</strong> – der übliche Export aus dem Online-Banking (Sparkasse, DKB,
                      ING, Comdirect, Volksbank, Qonto, N26). Spalten werden automatisch erkannt.
                    </li>
                    <li>
                      <strong>CAMT.053</strong> – XML-Auszug, enthält auch den Schlusssaldo.
                    </li>
                    <li>
                      <strong>MT940</strong> – klassisches SWIFT-Format (.sta).
                    </li>
                  </ul>
                </Alert>

                <button type="submit" className="btn btn-primary">
                  Hochladen und einlesen
                </button>
              </form>
            )}
          </Card>
        </div>

        <Card title="Bankkonten">
          {accounts.length === 0 ? (
            <p className="mb-4 text-sm text-ink-500">Noch kein Konto hinterlegt.</p>
          ) : (
            <ul className="mb-4 space-y-3">
              {accounts.map((account) => (
                <li key={account.id} className="rounded-lg border border-ink-200 p-3">
                  <p className="text-sm font-semibold text-ink-900">{account.name}</p>
                  <p className="font-mono text-xs text-ink-500">{account.iban}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {account._count.transactions} Buchung(en)
                  </p>
                  {account._count.transactions === 0 && (
                    <form action={deleteBankAccount} className="mt-2">
                      <input type="hidden" name="id" value={account.id} />
                      <ConfirmButton
                        className="btn btn-ghost"
                        message={`Konto „${account.name}“ löschen?`}
                      >
                        Löschen
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Disclosure summary="Bankkonto hinzufügen" defaultOpen={accounts.length === 0}>
            <form action={createBankAccount} className="space-y-3">
              <div>
                <label htmlFor="name">Bezeichnung *</label>
                <input id="name" name="name" required placeholder="Geschäftskonto" />
              </div>
              <div>
                <label htmlFor="iban">IBAN *</label>
                <input id="iban" name="iban" required placeholder="DE00 0000 0000 0000 0000 00" />
              </div>
              <div>
                <label htmlFor="bic">BIC</label>
                <input id="bic" name="bic" />
              </div>
              <div>
                <label htmlFor="openingBalanceCents">Anfangssaldo</label>
                <input id="openingBalanceCents" name="openingBalanceCents" inputMode="decimal" defaultValue="0,00" />
              </div>
              <button type="submit" className="btn btn-primary w-full">
                Konto anlegen
              </button>
            </form>
          </Disclosure>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Importierte Auszüge" padded={false}>
          {statements.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Noch kein Auszug importiert"
                description="Nach dem ersten Import sehen Sie hier alle Läufe mit Zeitraum und Trefferzahl."
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Importiert</Th>
                  <Th>Konto</Th>
                  <Th>Zeitraum</Th>
                  <Th>Format</Th>
                  <Th align="right">Buchungen</Th>
                  <Th align="right">Schlusssaldo</Th>
                  <Th align="right"></Th>
                </tr>
              </thead>
              <tbody>
                {statements.map((statement) => (
                  <tr key={statement.id} className="hover:bg-ink-50">
                    <Td className="text-ink-600">
                      {formatDateTime(statement.importedAt)}
                      <p className="max-w-56 truncate text-xs text-ink-500">{statement.fileName}</p>
                    </Td>
                    <Td className="text-ink-600">{statement.bankAccount.name}</Td>
                    <Td className="text-ink-600">
                      {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
                    </Td>
                    <Td className="text-ink-600">
                      {FORMAT_LABEL[statement.sourceFormat] ?? statement.sourceFormat}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {statement.rowsImported}
                      {statement.rowsDuplicate > 0 && (
                        <p className="text-xs text-ink-500">
                          {statement.rowsDuplicate} Duplikat(e)
                        </p>
                      )}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {statement.closingBalanceCents === null
                        ? "–"
                        : formatCents(statement.closingBalanceCents)}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        {statement.driveUrl && (
                          <a
                            href={statement.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost"
                          >
                            Datei
                          </a>
                        )}
                        <form action={deleteStatement}>
                          <input type="hidden" name="id" value={statement.id} />
                          <ConfirmButton
                            className="btn btn-ghost"
                            message="Auszug und alle daraus importierten Buchungen entfernen?"
                          >
                            Entfernen
                          </ConfirmButton>
                        </form>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
