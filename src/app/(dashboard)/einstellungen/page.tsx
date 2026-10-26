import { qontoBelegeNachholenAktion, qontoJetztAbgleichen, qontoZugangLoeschen, qontoZugangSichern } from "@/app/actions/qonto";
import { changePassword, createUser, deactivateUser, removeLandlordSignature, updateSettings, uploadLandlordSignature } from "@/app/actions/settings";
import { ConfirmButton, Disclosure } from "@/components/interactive";
import { Alert, Badge, Card, Flash, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { qontoStatus } from "@/lib/qonto";
import { postfachStatus } from "@/lib/postfach";
import { postfachJetztAbrufen, postfachZugangLoeschen, postfachZugangSichern } from "@/app/actions/postfach";
import { checkDriveStatus } from "@/lib/storage";

import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Einstellungen") };
}
export const dynamic = "force-dynamic";
// Der Qonto-Abgleich (Abruf, Zuordnung, Belege) braucht mehr als die Standardzeit.
export const maxDuration = 60;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datumZeit } = await oberflaeche();
  await requireAdmin();
  const params = await searchParams;
  const [me, settings, drive, users, qonto, postfach] = await Promise.all([
    requireUser(),
    getSettings(),
    checkDriveStatus(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    qontoStatus(),
    postfachStatus(),
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
              <label htmlFor="bankAccountHolder">{t("Kontoinhaber in der Zahlungserinnerung")}</label>
              <input id="bankAccountHolder" name="bankAccountHolder" defaultValue={settings.bankAccountHolder} />
              <p className="field-hint">{t("Kurzform für die Überweisung, z. B. „Wohnwerk GbR“.")}</p>
            </div>
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

      {/* Eigene Formulare (Datei-Upload) - ausserhalb des grossen
          Einstellungsformulars, ein Formular im Formular gibt es nicht. */}
      <div className="mt-6">
        <Card
          title={t("Unterschrift der Hausverwaltung")}
          description={t("Wird in die Wohnungsgeberbestätigung gesetzt, wenn der Vordruck des Objekts ein Unterschriftsfeld dafür hat. Weißer Hintergrund wird automatisch entfernt.")}
        >
          <div className="flex flex-wrap items-center gap-4">
            {settings.landlordSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.landlordSignature}
                alt={t("Unterschrift der Hausverwaltung")}
                className="h-16 max-w-[16rem] rounded-lg border border-ink-200 bg-white object-contain px-3"
              />
            ) : (
              <p className="text-sm text-ink-500">{t("Noch keine Unterschrift hinterlegt.")}</p>
            )}
            <form action={uploadLandlordSignature} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="signature-file">{t("Bilddatei (PNG oder JPG)")}</label>
                <input id="signature-file" name="file" type="file" accept="image/png,image/jpeg" required />
              </div>
              <button type="submit" className="btn btn-secondary">
                {settings.landlordSignature ? t("Ersetzen") : t("Hochladen")}
              </button>
            </form>
            {settings.landlordSignature && (
              <form action={removeLandlordSignature}>
                <button type="submit" className="btn btn-ghost">
                  {t("Entfernen")}
                </button>
              </form>
            )}
          </div>
        </Card>

      </div>

      {/* --- Qonto -----------------------------------------------------------
          Eigenes Formular, ausserhalb des grossen: der geheime Schluessel
          wird nie angezeigt, nur neu gesetzt. */}
      <div className="mt-6">
        <Card
          id="qonto"
          className="scroll-mt-4"
          title={t("Qonto-Anbindung")}
          description={t("Holt die Umsätze des Wohnwerk-Kontos direkt von Qonto, hakt Mieten und Kautionen automatisch ab und legt Belege, die in Qonto am Umsatz hängen, in der Belegablage ab – jeden Morgen, beim Öffnen der Mieteingänge und auf Knopfdruck. Der Schlüssel kann nur lesen, kein Geld bewegen.")}
          actions={
            qonto.eingerichtet ? (
              <form action={qontoJetztAbgleichen}>
                <input type="hidden" name="back" value="/einstellungen#qonto" />
                <button type="submit" className="btn btn-secondary">
                  {t("Jetzt abgleichen")}
                </button>
              </form>
            ) : null
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {qonto.eingerichtet ? (
                <Badge tone="success">{t("Verbunden")}</Badge>
              ) : (
                <Badge tone="neutral">{t("Nicht verbunden")}</Badge>
              )}
              {qonto.login && (
                <span className="text-ink-600">
                  {t("Login")}: <span className="font-mono">{qonto.login}</span>
                  {qonto.quelle === "umgebung" && ` · ${t("aus den Vercel-Umgebungsvariablen")}`}
                </span>
              )}
            </div>

            {qonto.zuletzt && (
              <p className={`text-sm ${qonto.zuletzt.ok ? "text-ink-600" : "text-rose-700"}`}>
                {qonto.zuletzt.ok
                  ? t("Zuletzt abgeglichen: {zeitpunkt} · {neu} neue Buchung(en), {zugeordnet} zugeordnet, {belege} Beleg(e) abgelegt", {
                      zeitpunkt: datumZeit(new Date(qonto.zuletzt.zeitpunkt)),
                      neu: qonto.zuletzt.neu,
                      zugeordnet: qonto.zuletzt.zugeordnet,
                belege: qonto.zuletzt.belege ?? 0,
                    })
                  : `${t("Letzter Versuch fehlgeschlagen ({zeitpunkt}):", { zeitpunkt: datumZeit(new Date(qonto.zuletzt.zeitpunkt)) })} ${t(qonto.zuletzt.fehler ?? "")}`}
              </p>
            )}
            {qonto.zuletzt?.belegHinweis && <p className="text-sm text-amber-700">{qonto.zuletzt.belegHinweis}</p>}

            {qonto.quelle !== "umgebung" && (
              <form action={qontoZugangSichern} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" autoComplete="off">
                <div>
                  <label htmlFor="qontoLogin">{t("Login (Organisations-Kennung)")}</label>
                  <input
                    id="qontoLogin"
                    name="qontoLogin"
                    defaultValue={qonto.login ?? ""}
                    placeholder="wohnwerk-immobilen-1234"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="qontoSecretKey">{t("Geheimer Schlüssel")}</label>
                  <input
                    id="qontoSecretKey"
                    name="qontoSecretKey"
                    type="password"
                    placeholder={qonto.eingerichtet ? t("hinterlegt – zum Ändern neu eingeben") : ""}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  {qonto.eingerichtet ? t("Ändern und abgleichen") : t("Verbinden und abgleichen")}
                </button>
              </form>
            )}

            <Disclosure summary={t("Wo finde ich Login und Schlüssel?")}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
                <li>{t("In Qonto oben links die Organisation „Wohnwerk Immobilen A² eGbR“ wählen.")}</li>
                <li>{t("Einstellungen → Integrationen & Partner → API-Schlüssel öffnen.")}</li>
                <li>{t("Dort stehen der Login und der geheime Schlüssel. Beide hier eintragen.")}</li>
              </ol>
              <p className="mt-2 text-xs text-ink-500">
                {t("Nur Inhaber und Admins sehen den API-Schlüssel in Qonto. Abgeglichen wird jedes Qonto-Konto, dessen IBAN hier als Bankkonto angelegt ist.")}
              </p>
            </Disclosure>

            {qonto.eingerichtet && (
              <form action={qontoBelegeNachholenAktion} className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
                <button type="submit" className="btn btn-secondary">
                  {t("Alle Belege seit Jahresbeginn holen")}
                </button>
                <p className="text-xs text-ink-500">
                  {t("Holt jeden Beleg, der in Qonto an einem Umsatz hängt, legt ihn in der Belegablage ab und ordnet ihn der Buchung zu. Bereits Abgelegtes wird übersprungen.")}
                </p>
              </form>
            )}

            {qonto.quelle === "einstellungen" && (
              <form action={qontoZugangLoeschen}>
                <ConfirmButton message={t("Qonto-Zugang wirklich entfernen? Der automatische Abgleich hört dann auf.")} className="btn btn-ghost text-rose-700">
                  {t("Zugang entfernen")}
                </ConfirmButton>
              </form>
            )}
          </div>
        </Card>
      </div>


      {/* --- Postfach ---------------------------------------------------------
          IONOS, Strato oder ein anderes Postfach per IMAP/SMTP. Das Passwort
          wird verschluesselt gespeichert und nie angezeigt. */}
      <div className="mt-6">
        <Card
          id="postfach"
          className="scroll-mt-4"
          title={t("E-Mail Postfach")}
          description={t("Holt E-Mails aus eurem Postfach in die App: Rechnungen werden automatisch als Beleg abgelegt und der Abbuchung zugeordnet, Kündigungen von Mietern landen beim Mieter. Gesendet wird von eurer eigenen Adresse. Die App liest nur – sie löscht und verschiebt im Postfach nichts.")}
          actions={
            postfach.eingerichtet ? (
              <form action={postfachJetztAbrufen}>
                <input type="hidden" name="back" value="/einstellungen#postfach" />
                <button type="submit" className="btn btn-secondary">
                  {t("Jetzt abrufen")}
                </button>
              </form>
            ) : null
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {postfach.eingerichtet ? <Badge tone="success">{t("Verbunden")}</Badge> : <Badge tone="neutral">{t("Nicht verbunden")}</Badge>}
              {postfach.benutzer && (
                <span className="text-ink-600">
                  <span className="font-mono">{postfach.benutzer}</span> · {postfach.imapHost}
                  {postfach.quelle === "umgebung" && ` · ${t("aus den Vercel-Umgebungsvariablen")}`}
                </span>
              )}
            </div>
            {postfach.zuletzt && (
              <p className={`text-sm ${postfach.zuletzt.ok ? "text-ink-600" : "text-rose-700"}`}>
                {postfach.zuletzt.ok
                  ? t("Zuletzt abgerufen: {zeitpunkt} · {neu} neue E-Mail(s), {belege} Beleg(e) abgelegt", {
                      zeitpunkt: datumZeit(new Date(postfach.zuletzt.zeitpunkt)),
                      neu: postfach.zuletzt.neu,
                      belege: postfach.zuletzt.belege,
                    })
                  : `${t("Letzter Versuch fehlgeschlagen ({zeitpunkt}):", { zeitpunkt: datumZeit(new Date(postfach.zuletzt.zeitpunkt)) })} ${t(postfach.zuletzt.fehler ?? "")}`}
              </p>
            )}

            {postfach.quelle !== "umgebung" && (
              <form action={postfachZugangSichern} className="grid gap-3 sm:grid-cols-2" autoComplete="off">
                <div>
                  <label htmlFor="pf-anbieter">{t("Anbieter")}</label>
                  <select id="pf-anbieter" name="anbieter" defaultValue={postfach.anbieter ?? "ionos"}>
                    <option value="ionos">IONOS (1&amp;1)</option>
                    <option value="strato">Strato</option>
                    <option value="andere">{t("Anderer Anbieter")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pf-name">{t("Absendername")}</label>
                  <input id="pf-name" name="absenderName" defaultValue={postfach.absenderName ?? "Wohnwerk"} />
                </div>
                <div>
                  <label htmlFor="pf-benutzer">{t("E-Mail-Adresse")}</label>
                  <input
                    id="pf-benutzer"
                    name="benutzer"
                    type="email"
                    defaultValue={postfach.benutzer ?? ""}
                    placeholder="info@wohnwerk-…de"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="pf-passwort">{t("Passwort des Postfachs")}</label>
                  <input
                    id="pf-passwort"
                    name="passwort"
                    type="password"
                    placeholder={postfach.eingerichtet ? t("hinterlegt – zum Ändern neu eingeben") : ""}
                    autoComplete="new-password"
                    required={!postfach.eingerichtet}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Disclosure summary={t("Anderer Anbieter: Server eintragen")}>
                    <div className="grid gap-3 sm:grid-cols-[1fr_6rem_1fr_6rem]">
                      <div>
                        <label htmlFor="pf-imap">{t("IMAP-Server")}</label>
                        <input id="pf-imap" name="imapHost" defaultValue={postfach.anbieter === "andere" ? postfach.imapHost ?? "" : ""} placeholder="imap.anbieter.de" />
                      </div>
                      <div>
                        <label htmlFor="pf-imap-port">{t("Port")}</label>
                        <input id="pf-imap-port" name="imapPort" inputMode="numeric" placeholder="993" />
                      </div>
                      <div>
                        <label htmlFor="pf-smtp">{t("SMTP-Server")}</label>
                        <input id="pf-smtp" name="smtpHost" defaultValue={postfach.anbieter === "andere" ? postfach.smtpHost ?? "" : ""} placeholder="smtp.anbieter.de" />
                      </div>
                      <div>
                        <label htmlFor="pf-smtp-port">{t("Port")}</label>
                        <input id="pf-smtp-port" name="smtpPort" inputMode="numeric" placeholder="465" />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">{t("Bei IONOS und Strato sind die Server schon eingestellt – hier nichts eintragen.")}</p>
                  </Disclosure>
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" className="btn btn-primary">
                    {postfach.eingerichtet ? t("Ändern und testen") : t("Verbinden und testen")}
                  </button>
                  <p className="mt-1 text-xs text-ink-500">
                    {t("Die App meldet sich zur Probe an. Nur wenn Empfangen und Senden klappen, wird der Zugang gespeichert. Danach holt sie die E-Mails der letzten 30 Tage.")}
                  </p>
                </div>
              </form>
            )}

            {postfach.quelle === "einstellungen" && (
              <form action={postfachZugangLoeschen}>
                <ConfirmButton message={t("Postfach-Zugang wirklich entfernen? Neue E-Mails werden dann nicht mehr abgeholt.")} className="btn btn-ghost text-rose-700">
                  {t("Zugang entfernen")}
                </ConfirmButton>
              </form>
            )}
          </div>
        </Card>
      </div>

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
