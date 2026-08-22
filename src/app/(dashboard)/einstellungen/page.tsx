import { changePassword, createUser, deactivateUser, updateSettings } from "@/app/actions/settings";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { Alert, Badge, Card, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { checkDriveStatus } from "@/lib/storage";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Einstellungen" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const [me, settings, drive, users] = await Promise.all([
    requireUser(),
    getSettings(),
    checkDriveStatus(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const mailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

  return (
    <>
      <PageHeader
        title="Einstellungen"
        description="Vermieterdaten, Vertragstext, Ablage und Zugänge."
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {/* --- Systemstatus --------------------------------------------------- */}
      <Card title="Systemstatus" description="Woran die Anwendung gerade angebunden ist.">
        <ul className="space-y-3 text-sm">
          <li className="flex flex-wrap items-center gap-3">
            <Badge tone={drive.ok ? "success" : drive.configured ? "danger" : "warning"}>
              Google Drive
            </Badge>
            <span className="text-ink-600">{drive.message}</span>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <Badge tone={mailConfigured ? "success" : "warning"}>E-Mail</Badge>
            <span className="text-ink-600">
              {mailConfigured
                ? `Versand über Resend aktiv (Absender ${process.env.MAIL_FROM}).`
                : "Kein automatischer Versand – Vertragslinks werden zum Kopieren angezeigt."}
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <Badge tone="info">Vertragslinks</Badge>
            <span className="text-ink-600">
              Basis-Adresse: <code>{settings.appUrl}</code>
            </span>
          </li>
        </ul>

        {!drive.ok && (
          <div className="mt-4">
            <Alert tone="info" title="Google Drive verbinden">
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs">
                <li>
                  In der Google Cloud Console ein Dienstkonto anlegen und einen JSON-Schlüssel
                  herunterladen.
                </li>
                <li>
                  Den Ziel-Ordner in Google Drive für die E-Mail-Adresse des Dienstkontos als
                  Bearbeiter freigeben (oder eine geteilte Ablage verwenden).
                </li>
                <li>
                  In den Umgebungsvariablen <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> (der JSON-Inhalt,
                  gern Base64-kodiert) und <code>GOOGLE_DRIVE_ROOT_FOLDER_ID</code> (die ID aus der
                  Ordner-URL) setzen.
                </li>
                <li>Anwendung neu starten – der Status oben wird dann grün.</li>
              </ol>
              <p className="mt-2 text-xs">
                Ohne Drive funktioniert alles weiter, die Dateien liegen dann im Verzeichnis{" "}
                <code>./storage</code>.
              </p>
            </Alert>
          </div>
        )}
      </Card>

      {/* --- Vermieterdaten -------------------------------------------------- */}
      <form action={updateSettings} className="mt-6 space-y-6">
        <Card
          title="Vermieter"
          description="Diese Angaben erscheinen im Kopf jedes Mietvertrags."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="companyName">Firma / Name *</label>
              <input id="companyName" name="companyName" defaultValue={settings.companyName} required />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="companyStreet">Straße und Hausnummer</label>
              <input id="companyStreet" name="companyStreet" defaultValue={settings.companyStreet} />
            </div>
            <div>
              <label htmlFor="companyZip">PLZ</label>
              <input id="companyZip" name="companyZip" defaultValue={settings.companyZip} />
            </div>
            <div>
              <label htmlFor="companyCity">Ort</label>
              <input id="companyCity" name="companyCity" defaultValue={settings.companyCity} />
            </div>
            <div>
              <label htmlFor="companyCountry">Land</label>
              <input id="companyCountry" name="companyCountry" defaultValue={settings.companyCountry} />
            </div>
            <div>
              <label htmlFor="companyPhone">Telefon</label>
              <input id="companyPhone" name="companyPhone" defaultValue={settings.companyPhone} />
            </div>
            <div>
              <label htmlFor="companyEmail">E-Mail</label>
              <input id="companyEmail" name="companyEmail" type="email" defaultValue={settings.companyEmail} />
            </div>
            <div>
              <label htmlFor="companyVatId">USt-IdNr.</label>
              <input id="companyVatId" name="companyVatId" defaultValue={settings.companyVatId} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="companyRegister">Handelsregister</label>
              <input id="companyRegister" name="companyRegister" defaultValue={settings.companyRegister} />
            </div>
          </div>
        </Card>

        <Card title="Bankverbindung" description="Steht im Vertrag als Zahlungsziel für die Miete.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="bankName">Bank</label>
              <input id="bankName" name="bankName" defaultValue={settings.bankName} />
            </div>
            <div>
              <label htmlFor="bankIban">IBAN</label>
              <input id="bankIban" name="bankIban" defaultValue={settings.bankIban} />
            </div>
            <div>
              <label htmlFor="bankBic">BIC</label>
              <input id="bankBic" name="bankBic" defaultValue={settings.bankBic} />
            </div>
          </div>
        </Card>

        <Card
          title="Vertragstext"
          description="Änderungen wirken nur auf neue Verträge – bereits freigegebene behalten ihren Wortlaut."
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="contractIntro">Einleitung</label>
              <textarea id="contractIntro" name="contractIntro" rows={3} defaultValue={settings.contractIntro} />
            </div>
            <div>
              <label htmlFor="contractClauses">Vertragsbedingungen</label>
              <textarea
                id="contractClauses"
                name="contractClauses"
                rows={14}
                defaultValue={settings.contractClauses}
                className="font-mono text-xs"
              />
              <p className="field-hint">Eine Klausel je Zeile.</p>
            </div>
            <div>
              <label htmlFor="contractHouseRules">Hausordnung</label>
              <textarea
                id="contractHouseRules"
                name="contractHouseRules"
                rows={3}
                defaultValue={settings.contractHouseRules}
              />
            </div>
            <div>
              <label htmlFor="contractNoticePeriod">Kündigungsfrist</label>
              <textarea
                id="contractNoticePeriod"
                name="contractNoticePeriod"
                rows={2}
                defaultValue={settings.contractNoticePeriod}
              />
            </div>
          </div>

          <div className="mt-4">
            <Alert tone="warning" title="Rechtlicher Hinweis">
              Der mitgelieferte Text ist eine praxisnahe Vorlage für die vorübergehende Überlassung
              von Schlafplätzen (§ 549 Abs. 2 Nr. 1 BGB), aber keine Rechtsberatung. Lassen Sie ihn
              einmalig anwaltlich prüfen und passen Sie ihn hier an.
            </Alert>
          </div>
        </Card>

        <Card title="Adresse der Anwendung" description="Wird für die Vertragslinks an die Mieter verwendet.">
          <div>
            <label htmlFor="appUrl">Basis-Adresse</label>
            <input id="appUrl" name="appUrl" defaultValue={settings.appUrl} placeholder="https://verwaltung.beispiel.de" />
            <p className="field-hint">
              Ohne Schrägstrich am Ende. Nach dem Verbinden der Domain in Vercel hier eintragen.
            </p>
          </div>
        </Card>

        <button type="submit" className="btn btn-primary">
          Einstellungen speichern
        </button>
      </form>

      {/* --- Zugaenge -------------------------------------------------------- */}
      <div className="mt-8">
        <Card title="Zugänge" description="Wer sich am Dashboard anmelden darf." padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>E-Mail</Th>
                <Th>Letzte Anmeldung</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <Td className="font-medium">
                    {user.name}
                    {user.id === me.id && <span className="ml-2 text-xs text-ink-500">(Sie)</span>}
                  </Td>
                  <Td className="text-ink-600">
                    {user.email}
                    {user.role === "steuerberater" && (
                      <span className="ml-2">
                        <Badge tone="info">Steuerberater</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="text-ink-600">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nie"}
                  </Td>
                  <Td align="right">
                    {user.active ? (
                      user.id === me.id ? (
                        <Badge tone="success">Aktiv</Badge>
                      ) : (
                        <form action={deactivateUser}>
                          <input type="hidden" name="id" value={user.id} />
                          <ConfirmButton
                            className="btn btn-ghost"
                            message={`Zugang von ${user.name} deaktivieren?`}
                          >
                            Deaktivieren
                          </ConfirmButton>
                        </form>
                      )
                    ) : (
                      <Badge tone="neutral">Deaktiviert</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="space-y-4 border-t border-ink-200 p-5">
            <Disclosure summary="Weiteren Zugang anlegen">
              <form action={createUser} className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label htmlFor="new-role">Rolle</label>
                  <select id="new-role" name="role" defaultValue="admin">
                    <option value="admin">Verwaltung – voller Zugriff</option>
                    <option value="steuerberater">
                      Steuerberater – nur Buchhaltung, nur lesend
                    </option>
                  </select>
                  <p className="field-hint">
                    Ein Steuerberater-Konto sieht Buchungen, Belege, Kontoauszüge und die
                    Exporte. Ändern kann es nichts.
                  </p>
                </div>
                <div>
                  <label htmlFor="new-name">Name</label>
                  <input id="new-name" name="name" required />
                </div>
                <div>
                  <label htmlFor="new-email">E-Mail</label>
                  <input id="new-email" name="email" type="email" required />
                </div>
                <div>
                  <label htmlFor="new-password">Passwort</label>
                  <input id="new-password" name="password" type="password" required minLength={10} />
                </div>
                <div className="sm:col-span-3">
                  <button type="submit" className="btn btn-primary">
                    Zugang anlegen
                  </button>
                </div>
              </form>
            </Disclosure>

            <Disclosure summary="Eigenes Passwort ändern">
              <form action={changePassword} className="flex flex-wrap items-end gap-3">
                <div className="w-64">
                  <label htmlFor="own-password">Neues Passwort</label>
                  <input id="own-password" name="password" type="password" required minLength={10} />
                </div>
                <button type="submit" className="btn btn-primary">
                  Passwort ändern
                </button>
              </form>
            </Disclosure>
          </div>
        </Card>
      </div>
    </>
  );
}
