import type { ContractData } from "@/lib/contract-pdf";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-1 gap-0.5 py-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold text-ink-500">{label}</dt>
      <dd className="text-sm text-ink-900">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-200 pt-5">
      <h3 className="mb-2 text-sm font-semibold text-brand-700">{title}</h3>
      {children}
    </section>
  );
}

function address(street?: string | null, zip?: string | null, city?: string | null, country?: string | null) {
  const parts = [street, [zip, city].filter(Boolean).join(" "), country].filter(
    (part) => part && String(part).trim(),
  );
  return parts.join(", ");
}

/** Lesbare Fassung des Vertrags – inhaltsgleich zum erzeugten PDF. */
export function ContractView({ data }: { data: ContractData }) {
  return (
    <article className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          Vertrag {data.contractNumber}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-ink-900">Mietvertrag</h2>
        <p className="mt-0.5 text-sm text-ink-500">
          Möblierter Schlafplatz zum vorübergehenden Gebrauch (Monteurunterkunft)
        </p>
      </header>

      <Section title="1. Vertragsparteien">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Vermieter</p>
            <dl>
              <Row label="Name" value={data.landlordName} />
              <Row
                label="Anschrift"
                value={address(
                  data.landlordStreet,
                  data.landlordZip,
                  data.landlordCity,
                  data.landlordCountry,
                )}
              />
              <Row label="Telefon" value={data.landlordPhone} />
              <Row label="E-Mail" value={data.landlordEmail} />
              <Row label="USt-IdNr." value={data.landlordVatId} />
            </dl>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Mieter</p>
            <dl>
              <Row label="Name" value={data.tenantName} />
              <Row label="Geburtsdatum" value={data.tenantBirthDate} />
              <Row label="Staatsangehörigkeit" value={data.tenantNationality} />
              <Row label="Ausweisnummer" value={data.tenantIdNumber} />
              <Row
                label="Meldeanschrift"
                value={address(data.tenantStreet, data.tenantZip, data.tenantCity, data.tenantCountry)}
              />
              <Row label="E-Mail" value={data.tenantEmail} />
              <Row label="Telefon" value={data.tenantPhone} />
              <Row label="Firma" value={data.tenantCompany} />
            </dl>
          </div>
        </div>
      </Section>

      <Section title="2. Mietgegenstand">
        <dl>
          <Row label="Objekt" value={data.propertyName} />
          <Row
            label="Anschrift"
            value={address(data.propertyStreet, data.propertyZip, data.propertyCity)}
          />
          <Row label="Zimmer" value={data.roomName} />
          <Row label="Schlafplatz" value={data.bedLabel} />
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">{data.intro}</p>
      </Section>

      <Section title="3. Mietzeit und Mietzins">
        <dl>
          <Row label="Mietbeginn" value={formatDate(data.startDate)} />
          <Row label="Mietende" value={data.endDate ? formatDate(data.endDate) : "unbefristet"} />
          <Row label="Miete monatlich" value={formatCents(data.monthlyRentCents)} />
          {data.utilitiesCents > 0 && (
            <Row label="davon Nebenkosten" value={formatCents(data.utilitiesCents)} />
          )}
          <Row
            label="Kaution"
            value={data.depositCents > 0 ? formatCents(data.depositCents) : "keine"}
          />
          <Row label="Fälligkeit" value={`zum ${data.billingDay}. eines Monats im Voraus`} />
          <Row label="Verwendungszweck" value={data.reference} />
          {data.bankIban && (
            <Row
              label="Zahlung auf"
              value={[data.bankName, `IBAN ${data.bankIban}`, data.bankBic && `BIC ${data.bankBic}`]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">{data.noticePeriod}</p>
      </Section>

      <Section title="4. Vertragsbedingungen">
        <div className="space-y-2 text-sm leading-relaxed text-ink-700">
          {data.clauses.split("\n").map((line, index) =>
            line.trim() ? <p key={index}>{line}</p> : null,
          )}
        </div>
      </Section>

      <Section title="5. Hausordnung">
        <p className="text-sm leading-relaxed text-ink-700">{data.houseRules}</p>
      </Section>

      {data.signature && (
        <Section title="6. Unterschrift">
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
            {data.signature.dataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={data.signature.dataUrl}
                alt="Unterschrift des Mieters"
                className="h-20 object-contain"
              />
            )}
            <p className="mt-2 text-sm font-semibold text-ink-900">{data.signature.name}</p>
            <p className="text-xs text-ink-500">
              Elektronisch unterschrieben am {formatDateTime(data.signature.signedAt)}
              {data.signature.ip ? ` · IP ${data.signature.ip}` : ""}
            </p>
          </div>
        </Section>
      )}
    </article>
  );
}
