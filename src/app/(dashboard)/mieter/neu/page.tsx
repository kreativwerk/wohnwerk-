import Link from "next/link";

import { createTenant } from "@/app/actions/tenants";
import { BedPicker } from "@/components/interactive";
import { Alert, Card, Flash, PageHeader } from "@/components/ui";
import { bedOptions } from "@/lib/options";
import { toDateInput } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";
import { oberflaeche, uebersetzer } from "@/lib/i18n";

/** Der Reiter im Browser gehoert zur Oberflaeche und folgt der Sprache. */
export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Neuer Mieter") };
}
export const dynamic = "force-dynamic";

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; bett?: string }>;
}) {
  const { t } = await oberflaeche();
  await requireAdmin();
  const params = await searchParams;
  const beds = await bedOptions();
  const freeBeds = beds.filter((bed) => !bed.occupied && !bed.blocked).length;

  return (
    <>
      <PageHeader
        title={t("Neuer Mieter")}
        description={t("Person erfassen, Bett zuweisen – anschließend wird der Vertragsentwurf erzeugt.")}
        breadcrumb={[{ label: t("Mieter"), href: "/mieter" }, { label: t("Neu") }]}
      />

      <Flash fehler={params.fehler} />

      {beds.length === 0 && (
        <div className="mb-5">
          <Alert tone="warning" title={t("Keine Betten vorhanden")}>
            {t("Legen Sie zuerst ein Objekt mit Zimmern und Betten an, damit Sie den Mieter zuweisen können.")}{" "}
            <Link href="/objekte/neu" className="font-semibold underline">
              {t("Objekt anlegen")}
            </Link>
          </Alert>
        </div>
      )}

      <form action={createTenant} className="space-y-6">
        <Card title={t("Person")} description={t("Pflichtfelder sind mit * gekennzeichnet.")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName">{t("Vorname *")}</label>
              <input id="firstName" name="firstName" required />
            </div>
            <div>
              <label htmlFor="lastName">{t("Nachname *")}</label>
              <input id="lastName" name="lastName" />
            </div>
            <div>
              <label htmlFor="email">{t("E-Mail *")}</label>
              <input id="email" name="email" type="email" />
              <p className="field-hint">{t("An diese Adresse geht der Vertragslink.")}</p>
            </div>
            <div>
              <label htmlFor="phone">{t("Telefon")}</label>
              <input id="phone" name="phone" type="tel" />
              <p className="field-hint">
                {t("Mit Landesvorwahl, z. B. +49 151 2345678 – für den WhatsApp-Link bei den Mieteingängen.")}
              </p>
            </div>
            <div>
              <label htmlFor="birthDate">{t("Geburtsdatum")}</label>
              <input id="birthDate" name="birthDate" type="date" />
            </div>
            <div>
              <label htmlFor="nationality">{t("Staatsangehörigkeit")}</label>
              <input id="nationality" name="nationality" />
            </div>
            <div>
              <label htmlFor="idType">{t("Ausweisart")}</label>
              <select id="idType" name="idType" defaultValue="">
                <option value="">{t("– keine Angabe –")}</option>
                <option value="Personalausweis">{t("Personalausweis")}</option>
                <option value="Reisepass">{t("Reisepass")}</option>
                <option value="Aufenthaltstitel">{t("Aufenthaltstitel")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="idNumber">{t("Ausweisnummer")}</label>
              <input id="idNumber" name="idNumber" />
            </div>
          </div>
        </Card>

        <Card title={t("Meldeanschrift")} description={t("Wohnsitz des Mieters, nicht die Unterkunft.")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="street">{t("Straße und Hausnummer")}</label>
              <input id="street" name="street" />
            </div>
            <div>
              <label htmlFor="zip">PLZ</label>
              <input id="zip" name="zip" />
            </div>
            <div>
              <label htmlFor="city">{t("Ort")}</label>
              <input id="city" name="city" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="country">{t("Land")}</label>
              <input id="country" name="country" defaultValue="Deutschland" />
            </div>
          </div>
        </Card>

        <Card title={t("Entsendende Firma")} description={t("Optional – wichtig, wenn die Firma die Miete zahlt.")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="company">{t("Firma")}</label>
              <input id="company" name="company" />
              <p className="field-hint">
                {t("Wird beim Abgleich der Kontoauszüge auch als Zahlender erkannt.")}
              </p>
            </div>
            <div>
              <label htmlFor="companyVatId">{t("USt-IdNr.")}</label>
              <input id="companyVatId" name="companyVatId" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="companyStreet">{t("Straße")}</label>
              <input id="companyStreet" name="companyStreet" />
            </div>
            <div>
              <label htmlFor="companyZip">PLZ</label>
              <input id="companyZip" name="companyZip" />
            </div>
            <div>
              <label htmlFor="companyCity">{t("Ort")}</label>
              <input id="companyCity" name="companyCity" />
            </div>
          </div>
        </Card>

        <Card
          title={t("Unterkunft und Mietverhältnis")}
          description={t("{frei} von {gesamt} Betten sind derzeit frei. Ohne Bettauswahl wird nur der Mieter angelegt.", { frei: freeBeds, gesamt: beds.length })}
        >
          <BedPicker beds={beds} defaultBedId={params.bett} />

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="startDate">{t("Mietbeginn")}</label>
              <input id="startDate" name="startDate" type="date" defaultValue={toDateInput(new Date())} />
            </div>
            <div>
              <label htmlFor="endDate">{t("Mietende")}</label>
              <input id="endDate" name="endDate" type="date" />
              <p className="field-hint">{t("Leer lassen für unbefristet.")}</p>
            </div>
            <div>
              <label htmlFor="billingDay">{t("Fällig am")}</label>
              <input id="billingDay" name="billingDay" type="number" min={1} max={28} defaultValue={1} />
            </div>
            <div>
              <label htmlFor="monthlyRentCents">{t("Miete / Monat")}</label>
              <input id="monthlyRentCents" name="monthlyRentCents" inputMode="decimal" placeholder="350,00" />
              <p className="field-hint">{t("Wird aus dem Bett vorbelegt.")}</p>
            </div>
            <div>
              <label htmlFor="utilitiesCents">{t("davon Nebenkosten")}</label>
              <input id="utilitiesCents" name="utilitiesCents" inputMode="decimal" defaultValue="0,00" />
            </div>
            <div>
              <label htmlFor="depositCents">{t("Kaution")}</label>
              <input id="depositCents" name="depositCents" inputMode="decimal" defaultValue="200,00" />
              <p className="field-hint">{t("0,00 eintragen = keine Kaution")}</p>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="notes">{t("Notizen")}</label>
            <textarea id="notes" name="notes" rows={2} />
          </div>
        </Card>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            {t("Mieter anlegen")}
          </button>
          <Link href="/mieter" className="btn btn-secondary">
            {t("Abbrechen")}
          </Link>
        </div>
      </form>
    </>
  );
}
