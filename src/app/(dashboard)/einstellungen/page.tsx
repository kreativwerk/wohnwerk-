import { changePassword, createUser, deactivateUser, updateSettings } from "@/app/actions/settings";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { Alert, Badge, Card, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { checkDriveStatus } from "@/lib/storage";

import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Einstellungen") };
}
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datumZeit } = await oberflaeche();
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
        title={t("Einstellungen")}
        description={t("Vermieterdaten, Vertragstext, Ablage und Zugänge.")}
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      {/* --- Systemstatus --------------------------------------------------- */}
      <Card title={t("Systemstatus")} description={t("Woran die Anwendung gerade angebunden ist.")}>
        <ul className="space-y-3 text-sm">
          <li className="flex flex-wrap items-center gap-3">
            <Badge tone={drive.ok ? "success" : drive.configured ? "danger" : "warning"}>
              {t("Dokumentenablage")}
            </Badge>
            <span className="text-ink-600">{t(drive.message, drive.werte)}</span>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <Badge tone={mailConfigured ? "success" : "warning"}>{t("E-Mail")}</Badge>
            <span className="text-ink-600">
              {mailConfigured
                ? t("Versand über Resend aktiv (Absender {absender}).", { absender: process.env.MAIL_FROM ?? "" })
                : t("Kein automatischer Versand – Vertragslinks werden zum Kopieren angezeigt.")}
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <Badge tone="info">{t("Vertragslinks")}</Badge>
            <span className="text-ink-600">
              {t("Basis-Adresse:")} <code>{settings.appUrl}</code>
            </span>
          </li>
        </ul>

        {!drive.ok && (
          <div className="mt-4">
            <Alert tone="warning" title={t("Dokumentenablage nicht erreichbar")}>
              <p className="mt-1 text-xs">
                {t("Dokumente werden normalerweise ohne jede Einrichtung direkt in der Supabase-Datenbank gespeichert. Erscheint diese Meldung, ist die Datenbank gerade nicht erreichbar – bitte in ein paar Minuten erneut versuchen. Uploads werden bis dahin nicht angenommen; Kontoauszüge werden trotzdem eingelesen, nur das Original wird nicht archiviert.")}
              </p>
            </Alert>
          </div>
        )}
      </Card>

      {/* --- Vermieterdaten -------------------------------------------------- */}
      <form action={updateSettings} className="mt-6 space-y-6">
        <Card
          title={t("Vermieter")}
          description={t("Diese Angaben erscheinen im Kopf jedes Mietvertrags.")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="companyName">{t("Firma / Name *")}</label>
              <input id="companyName" name="companyName" defaultValue={settings.companyName} required />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="companyStreet">{t("Straße und Hausnummer")}</label>
              <input id="companyStreet" name="companyStreet" defaultValue={settings.companyStreet} />
            </div>
            <div>
              <label htmlFor="companyZip">PLZ</label>
              <input id="companyZip" name="companyZip" defaultValue={settings.companyZip} />
            </div>
            <div>
              <label htmlFor="companyCity">{t("Ort")}</label>
              <input id="companyCity" name="companyCity" defaultValue={settings.companyCity} />
            </div>
            <div>
              <label htmlFor="companyCountry">{t("Land")}</label>
              <input id="companyCountry" name="companyCountry" defaultValue={settings.companyCountry} />
            </div>
            <div>
              <label htmlFor="companyPhone">{t("Telefon")}</label>
              <input id="companyPhone" name="companyPhone" defaultValue={settings.companyPhone} />
            </div>
            <div>
              <label htmlFor="companyEmail">{t("E-Mail")}</label>
              <input id="companyEmail" name="companyEmail" type="email" defaultValue={settings.companyEmail} />
            </div>
            <div>
              <label htmlFor="companyVatId">{t("USt-IdNr.")}</label>
              <input id="companyVatId" name="companyVatId" defaultValue={settings.companyVatId} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="companyRegister">{t("Handelsregister")}</label>
              <input id="companyRegister" name="companyRegister" defaultValue={settings.companyRegister} />
            </div>
          </div>
        </Card>

        <Card title={t("Bankverbindung")} description={t("Steht im Vertrag als Zahlungsziel für die Miete.")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="bankName">{t("Bank")}</label>
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
          title={t("Vertragstext")}
          description={t("Änderungen wirken nur auf neue Verträge – bereits freigegebene behalten ihren Wortlaut.")}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="contractIntro">{t("Einleitung")}</label>
              <textarea id="contractIntro" name="contractIntro" rows={3} defaultValue={settings.contractIntro} />
            </div>
            <div>
              <label htmlFor="contractClauses">{t("Vertragsbedingungen")}</label>
              <textarea
                id="contractClauses"
                name="contractClauses"
                rows={14}
                defaultValue={settings.contractClauses}
                className="font-mono text-xs"
              />
              <p className="field-hint">{t("Eine Klausel je Zeile.")}</p>
            </div>
            <div>
              <label htmlFor="contractHouseRules">{t("Hausordnung")}</label>
              <textarea
                id="contractHouseRules"
                name="contractHouseRules"
                rows={3}
                defaultValue={settings.contractHouseRules}
              />
            </div>
            <div>
              <label htmlFor="contractNoticePeriod">{t("Kündigungsfrist")}</label>
              <textarea
                id="contractNoticePeriod"
                name="contractNoticePeriod"
                rows={2}
                defaultValue={settings.contractNoticePeriod}
              />
            </div>
          </div>

          <div className="mt-4">
            <Alert tone="warning" title={t("Rechtlicher Hinweis")}>
              {t("Der mitgelieferte Text ist eine praxisnahe Vorlage für die vorübergehende Überlassung von Schlafplätzen (§ 549 Abs. 2 Nr. 1 BGB), aber keine Rechtsberatung. Lassen Sie ihn einmalig anwaltlich prüfen und passen Sie ihn hier an.")}
            </Alert>
          </div>
        </Card>

        <Card title={t("Adresse der Anwendung")} description={t("Wird für die Vertragslinks an die Mieter verwendet.")}>
          <div>
            <label htmlFor="appUrl">{t("Basis-Adresse")}</label>
            <input id="appUrl" name="appUrl" defaultValue={settings.appUrl} placeholder={t("https://verwaltung.beispiel.de")} />
            <p className="field-hint">
              {t("Ohne Schrägstrich am Ende. Nach dem Verbinden der Domain in Vercel hier eintragen.")}
            </p>
          </div>
        </Card>

        <button type="submit" className="btn btn-primary">
          {t("Einstellungen speichern")}
        </button>
      </form>

      {/* --- Zugaenge -------------------------------------------------------- */}
      <div className="mt-8">
        <Card title={t("Zugänge")} description={t("Wer sich am Dashboard anmelden darf.")} padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>{t("Name")}</Th>
                <Th>{t("E-Mail")}</Th>
                <Th>{t("Letzte Anmeldung")}</Th>
                <Th align="right">{t("Status")}</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <Td className="font-medium">
                    {user.name}
                    {user.id === me.id && <span className="ml-2 text-xs text-ink-500">{t("(Sie)")}</span>}
                  </Td>
                  <Td className="text-ink-600">
                    {user.email}
                    {user.role === "steuerberater" && (
                      <span className="ml-2">
                        <Badge tone="info">{t("Steuerberater")}</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="text-ink-600">
                    {user.lastLoginAt ? datumZeit(user.lastLoginAt) : "nie"}
                  </Td>
                  <Td align="right">
                    {user.active ? (
                      user.id === me.id ? (
                        <Badge tone="success">{t("Aktiv")}</Badge>
                      ) : (
                        <form action={deactivateUser}>
                          <input type="hidden" name="id" value={user.id} />
                          <ConfirmButton
                            className="btn btn-ghost"
                            message={`Zugang von ${user.name} deaktivieren?`}
                          >
                            {t("Deaktivieren")}
                          </ConfirmButton>
                        </form>
                      )
                    ) : (
                      <Badge tone="neutral">{t("Deaktiviert")}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="space-y-4 border-t border-ink-200 p-5">
            <Disclosure summary={t("Weiteren Zugang anlegen")}>
              <form action={createUser} className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label htmlFor="new-role">{t("Rolle")}</label>
                  <select id="new-role" name="role" defaultValue="admin">
                    <option value="admin">{t("Verwaltung – voller Zugriff")}</option>
                    <option value="steuerberater">
                      {t("Steuerberater – nur Buchhaltung, nur lesend")}
                    </option>
                  </select>
                  <p className="field-hint">
                    {t("Ein Steuerberater-Konto sieht Buchungen, Belege, Kontoauszüge und die Exporte. Ändern kann es nichts.")}
                  </p>
                </div>
                <div>
                  <label htmlFor="new-name">{t("Name")}</label>
                  <input id="new-name" name="name" required />
                </div>
                <div>
                  <label htmlFor="new-email">{t("E-Mail")}</label>
                  <input id="new-email" name="email" type="email" required />
                </div>
                <div>
                  <label htmlFor="new-password">{t("Passwort")}</label>
                  <input id="new-password" name="password" type="password" required minLength={10} />
                </div>
                <div className="sm:col-span-3">
                  <button type="submit" className="btn btn-primary">
                    {t("Zugang anlegen")}
                  </button>
                </div>
              </form>
            </Disclosure>

            <Disclosure summary={t("Eigenes Passwort ändern")}>
              <form action={changePassword} className="flex flex-wrap items-end gap-3">
                <div className="w-64">
                  <label htmlFor="own-password">{t("Neues Passwort")}</label>
                  <input id="own-password" name="password" type="password" required minLength={10} />
                </div>
                <button type="submit" className="btn btn-primary">
                  {t("Passwort ändern")}
                </button>
              </form>
            </Disclosure>
          </div>
        </Card>
      </div>
    </>
  );
}
