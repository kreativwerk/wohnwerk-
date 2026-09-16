import type { ContractData } from "@/lib/contract-pdf";
import { oberflaeche } from "@/lib/i18n";

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
export async function ContractView({ data }: { data: ContractData }) {
  const { t, datum, datumZeit, geld } = await oberflaeche();

  return (
    <article className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          {t("Vertrag {nummer}", { nummer: data.contractNumber })}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-ink-900">{t("Mietvertrag")}</h2>
        <p className="mt-0.5 text-sm text-ink-500">
          {t("Möblierter Schlafplatz zum vorübergehenden Gebrauch (Monteurunterkunft)")}
        </p>
      </header>

      <Section title={t("1. Vertragsparteien")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("Vermieter")}</p>
            <dl>
              <Row label={t("Name")} value={data.landlordName} />
              <Row
                label={t("Anschrift")}
                value={address(
                  data.landlordStreet,
                  data.landlordZip,
                  data.landlordCity,
                  data.landlordCountry,
                )}
              />
              <Row label={t("Telefon")} value={data.landlordPhone} />
              <Row label={t("E-Mail")} value={data.landlordEmail} />
              <Row label={t("USt-IdNr.")} value={data.landlordVatId} />
            </dl>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("Mieter")}</p>
            <dl>
              <Row label={t("Name")} value={data.tenantName} />
              <Row label={t("Geburtsdatum")} value={data.tenantBirthDate} />
              <Row label={t("Staatsangehörigkeit")} value={data.tenantNationality} />
              <Row label={t("Ausweisnummer")} value={data.tenantIdNumber} />
              <Row
                label={t("Meldeanschrift")}
                value={address(data.tenantStreet, data.tenantZip, data.tenantCity, data.tenantCountry)}
              />
              <Row label={t("E-Mail")} value={data.tenantEmail} />
              <Row label={t("Telefon")} value={data.tenantPhone} />
              <Row label={t("Firma")} value={data.tenantCompany} />
            </dl>
          </div>
        </div>
      </Section>

      <Section title={t("2. Mietgegenstand")}>
        <dl>
          <Row label={t("Objekt")} value={data.propertyName} />
          <Row
            label={t("Anschrift")}
            value={address(data.propertyStreet, data.propertyZip, data.propertyCity)}
          />
          <Row label={t("Zimmer")} value={data.roomName} />
          <Row label={t("Schlafplatz")} value={data.bedLabel} />
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">{data.intro}</p>
      </Section>

      <Section title={t("3. Mietzeit und Mietzins")}>
        <dl>
          <Row label={t("Mietbeginn")} value={datum(data.startDate)} />
          <Row label={t("Mietende")} value={data.endDate ? datum(data.endDate) : t("unbefristet")} />
          <Row label={t("Miete monatlich")} value={geld(data.monthlyRentCents)} />
          {data.utilitiesCents > 0 && (
            <Row label={t("davon Nebenkosten")} value={geld(data.utilitiesCents)} />
          )}
          <Row
            label={t("Kaution")}
            value={data.depositCents > 0 ? geld(data.depositCents) : t("keine")}
          />
          <Row label={t("Fälligkeit")} value={t("zum {tag}. eines Monats im Voraus", { tag: data.billingDay })} />
          <Row label={t("Verwendungszweck")} value={data.reference} />
          {data.bankIban && (
            <Row
              label={t("Zahlung auf")}
              value={[data.bankName, `IBAN ${data.bankIban}`, data.bankBic && `BIC ${data.bankBic}`]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">{data.noticePeriod}</p>
      </Section>

      <Section title={t("4. Vertragsbedingungen")}>
        <div className="space-y-2 text-sm leading-relaxed text-ink-700">
          {data.clauses.split("\n").map((line, index) =>
            line.trim() ? <p key={index}>{line}</p> : null,
          )}
        </div>
      </Section>

      <Section title={t("5. Hausordnung")}>
        <p className="text-sm leading-relaxed text-ink-700">{data.houseRules}</p>
      </Section>

      {data.signature && (
        <Section title={t("6. Unterschrift")}>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
            {data.signature.dataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={data.signature.dataUrl}
                alt={t("Unterschrift des Mieters")}
                className="h-20 object-contain"
              />
            )}
            <p className="mt-2 text-sm font-semibold text-ink-900">{data.signature.name}</p>
            <p className="text-xs text-ink-500">
              Elektronisch unterschrieben am {datumZeit(data.signature.signedAt)}
              {data.signature.ip ? ` · IP ${data.signature.ip}` : ""}
            </p>
          </div>
        </Section>
      )}
    </article>
  );
}
