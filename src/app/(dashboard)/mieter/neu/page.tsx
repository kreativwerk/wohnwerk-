import Link from "next/link";

import { createTenant } from "@/app/actions/tenants";
import { BedPicker } from "@/components/interactive";
import { Alert, Card, Flash, PageHeader } from "@/components/ui";
import { bedOptions } from "@/lib/options";
import { toDateInput } from "@/lib/dates";

export const metadata = { title: "Neuer Mieter" };
export const dynamic = "force-dynamic";

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; bett?: string }>;
}) {
  const params = await searchParams;
  const beds = await bedOptions();
  const freeBeds = beds.filter((bed) => !bed.occupied && !bed.blocked).length;

  return (
    <>
      <PageHeader
        title="Neuer Mieter"
        description="Person erfassen, Bett zuweisen – anschließend wird der Vertragsentwurf erzeugt."
        breadcrumb={[{ label: "Mieter", href: "/mieter" }, { label: "Neu" }]}
      />

      <Flash fehler={params.fehler} />

      {beds.length === 0 && (
        <div className="mb-5">
          <Alert tone="warning" title="Keine Betten vorhanden">
            Legen Sie zuerst ein Objekt mit Zimmern und Betten an, damit Sie den Mieter zuweisen können.{" "}
            <Link href="/objekte/neu" className="font-semibold underline">
              Objekt anlegen
            </Link>
          </Alert>
        </div>
      )}

      <form action={createTenant} className="space-y-6">
        <Card title="Person" description="Pflichtfelder sind mit * gekennzeichnet.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName">Vorname *</label>
              <input id="firstName" name="firstName" required />
            </div>
            <div>
              <label htmlFor="lastName">Nachname *</label>
              <input id="lastName" name="lastName" required />
            </div>
            <div>
              <label htmlFor="email">E-Mail *</label>
              <input id="email" name="email" type="email" required />
              <p className="field-hint">An diese Adresse geht der Vertragslink.</p>
            </div>
            <div>
              <label htmlFor="phone">Telefon</label>
              <input id="phone" name="phone" type="tel" />
            </div>
            <div>
              <label htmlFor="birthDate">Geburtsdatum</label>
              <input id="birthDate" name="birthDate" type="date" />
            </div>
            <div>
              <label htmlFor="nationality">Staatsangehörigkeit</label>
              <input id="nationality" name="nationality" />
            </div>
            <div>
              <label htmlFor="idType">Ausweisart</label>
              <select id="idType" name="idType" defaultValue="">
                <option value="">– keine Angabe –</option>
                <option value="Personalausweis">Personalausweis</option>
                <option value="Reisepass">Reisepass</option>
                <option value="Aufenthaltstitel">Aufenthaltstitel</option>
              </select>
            </div>
            <div>
              <label htmlFor="idNumber">Ausweisnummer</label>
              <input id="idNumber" name="idNumber" />
            </div>
          </div>
        </Card>

        <Card title="Meldeanschrift" description="Wohnsitz des Mieters, nicht die Unterkunft.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="street">Straße und Hausnummer</label>
              <input id="street" name="street" />
            </div>
            <div>
              <label htmlFor="zip">PLZ</label>
              <input id="zip" name="zip" />
            </div>
            <div>
              <label htmlFor="city">Ort</label>
              <input id="city" name="city" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="country">Land</label>
              <input id="country" name="country" defaultValue="Deutschland" />
            </div>
          </div>
        </Card>

        <Card title="Entsendende Firma" description="Optional – wichtig, wenn die Firma die Miete zahlt.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="company">Firma</label>
              <input id="company" name="company" />
              <p className="field-hint">
                Wird beim Abgleich der Kontoauszüge auch als Zahlender erkannt.
              </p>
            </div>
            <div>
              <label htmlFor="companyVatId">USt-IdNr.</label>
              <input id="companyVatId" name="companyVatId" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="companyStreet">Straße</label>
              <input id="companyStreet" name="companyStreet" />
            </div>
            <div>
              <label htmlFor="companyZip">PLZ</label>
              <input id="companyZip" name="companyZip" />
            </div>
            <div>
              <label htmlFor="companyCity">Ort</label>
              <input id="companyCity" name="companyCity" />
            </div>
          </div>
        </Card>

        <Card
          title="Unterkunft und Mietverhältnis"
          description={`${freeBeds} von ${beds.length} Betten sind derzeit frei. Ohne Bettauswahl wird nur der Mieter angelegt.`}
        >
          <BedPicker beds={beds} defaultBedId={params.bett} />

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="startDate">Mietbeginn</label>
              <input id="startDate" name="startDate" type="date" defaultValue={toDateInput(new Date())} />
            </div>
            <div>
              <label htmlFor="endDate">Mietende</label>
              <input id="endDate" name="endDate" type="date" />
              <p className="field-hint">Leer lassen für unbefristet.</p>
            </div>
            <div>
              <label htmlFor="billingDay">Fällig am</label>
              <input id="billingDay" name="billingDay" type="number" min={1} max={28} defaultValue={1} />
            </div>
            <div>
              <label htmlFor="monthlyRentCents">Miete / Monat</label>
              <input id="monthlyRentCents" name="monthlyRentCents" inputMode="decimal" placeholder="350,00" />
              <p className="field-hint">Wird aus dem Bett vorbelegt.</p>
            </div>
            <div>
              <label htmlFor="utilitiesCents">davon Nebenkosten</label>
              <input id="utilitiesCents" name="utilitiesCents" inputMode="decimal" defaultValue="0,00" />
            </div>
            <div>
              <label htmlFor="depositCents">Kaution</label>
              <input id="depositCents" name="depositCents" inputMode="decimal" defaultValue="0,00" />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="notes">Notizen</label>
            <textarea id="notes" name="notes" rows={2} />
          </div>
        </Card>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            Mieter anlegen
          </button>
          <Link href="/mieter" className="btn btn-secondary">
            Abbrechen
          </Link>
        </div>
      </form>
    </>
  );
}
