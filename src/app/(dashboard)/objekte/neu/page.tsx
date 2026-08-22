import Link from "next/link";

import { createProperty } from "@/app/actions/properties";
import { Card, Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Neues Objekt" };

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Neues Objekt"
        description="Adresse und Ansprechpartner der Unterkunft. Zimmer und Betten legen Sie anschließend im Objekt an."
        breadcrumb={[{ label: "Objekte", href: "/objekte" }, { label: "Neu" }]}
      />

      <Flash fehler={params.fehler} />

      <form action={createProperty} encType="multipart/form-data" className="space-y-6">
        <Card title="Stammdaten">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name">Bezeichnung *</label>
              <input id="name" name="name" required placeholder="Monteurhaus Hafenstraße" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="street">Straße und Hausnummer *</label>
              <input id="street" name="street" required />
            </div>
            <div>
              <label htmlFor="zip">PLZ *</label>
              <input id="zip" name="zip" required inputMode="numeric" />
            </div>
            <div>
              <label htmlFor="city">Ort *</label>
              <input id="city" name="city" required />
            </div>
            <div>
              <label htmlFor="country">Land</label>
              <input id="country" name="country" defaultValue="Deutschland" />
            </div>
            <div>
              <label htmlFor="shortCode">Kürzel</label>
              <input id="shortCode" name="shortCode" placeholder="HAF" />
              <p className="field-hint">Optional, taucht in Auswertungen und Ordnernamen auf.</p>
            </div>
          </div>
        </Card>

        <Card title="Ansprechpartner und Hinweise" description="Alles optional, hilft aber im Alltag.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tenure">Eigentumsverhältnis</label>
              <select id="tenure" name="tenure" defaultValue="ANGEMIETET">
                <option value="ANGEMIETET">Angemietet – wir sind Zwischenmieter</option>
                <option value="EIGENTUM">Eigentum von Wohnwerk</option>
              </select>
            </div>
            <div>
              <label htmlFor="ownerName">Vermieter / Eigentümer</label>
              <input id="ownerName" name="ownerName" placeholder="Bei angemieteten Objekten: unser Vermieter" />
            </div>
            <div>
              <label htmlFor="managerName">Hausmeister / Betreuung</label>
              <input id="managerName" name="managerName" />
            </div>
            <div>
              <label htmlFor="managerPhone">Telefon Betreuung</label>
              <input id="managerPhone" name="managerPhone" type="tel" />
            </div>
            <div>
              <label htmlFor="managerEmail">E-Mail Betreuung</label>
              <input id="managerEmail" name="managerEmail" type="email" />
            </div>
            <div>
              <label htmlFor="wifiSsid">WLAN-Name</label>
              <input id="wifiSsid" name="wifiSsid" />
            </div>
            <div>
              <label htmlFor="wifiPassword">WLAN-Passwort</label>
              <input id="wifiPassword" name="wifiPassword" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes">Notizen</label>
              <textarea id="notes" name="notes" rows={3} />
            </div>
          </div>
        </Card>

        <Card
          title="Wohnungsgeberbestätigung"
          description="Der Vordruck nach § 19 BMG, mit dem sich Ihre Mieter beim Meldeamt anmelden."
        >
          <div className="rounded-xl border border-brand-300/60 bg-brand-50 px-4 py-3 text-[0.875rem] leading-relaxed text-brand-800">
            <p>
              Jede Kommune gibt ein eigenes Formular heraus. Wohnwerk baut es deshalb nicht nach,
              sondern füllt genau die Datei aus, die Sie hier hinterlegen – am Layout ändert sich
              dabei nichts.
            </p>
            <p className="mt-1.5">
              Enthält die PDF Formularfelder, trägt Wohnwerk Name, Vorname und Einzugsdatum des
              Mieters automatisch ein. Sie prüfen die Zuordnung anschließend einmalig.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="templateKind">Art des Vordrucks</label>
              <select id="templateKind" name="templateKind" defaultValue="COMBINED">
                <option value="COMBINED">Mietvertrag mit Wohnungsgeberbestätigung</option>
                <option value="LANDLORD_CONFIRMATION">Nur Wohnungsgeberbestätigung</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="templateFile">PDF-Datei</label>
              <input
                id="templateFile"
                name="templateFile"
                type="file"
                accept="application/pdf"
                required
              />
              <p className="field-hint">
                Höchstens 12 MB. Lässt sich später jederzeit austauschen.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            Objekt anlegen
          </button>
          <Link href="/objekte" className="btn btn-secondary">
            Abbrechen
          </Link>
        </div>
      </form>
    </>
  );
}
