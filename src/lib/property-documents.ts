import "server-only";

import { prisma } from "./db";
import { getSettings } from "./settings";
import { formatDate } from "./dates";
import { formatCents } from "./money";
import {
  type FillValues,
  type PlaceholderKey,
  appendSignatureSheet,
  coversContract,
  coversLandlordConfirmation,
  fillTemplate,
  parseFieldMap,
} from "./pdf-template";
import type { ContractWithRelations } from "./contract";

/**
 * Erzeugt Mietvertrag und Wohnungsgeberbestaetigung aus den Vordrucken des
 * Objekts. Beide Dokumente entstehen, indem die hochgeladene Originaldatei
 * gefuellt wird - nichts daran wird nachgebaut.
 */

/** Traegt die Werte des Vertrags in die Sprache der Platzhalter um. */
export async function buildTemplateValues(
  contract: ContractWithRelations,
): Promise<FillValues> {
  const settings = await getSettings();
  const { tenancy } = contract;
  const { tenant, bed } = tenancy;
  const room = bed.room;
  const property = room.property;

  const heute = formatDate(new Date());
  const ort = settings.companyCity;

  const werte: Partial<Record<PlaceholderKey, string>> = {
    "mieter.vorname": tenant.firstName,
    "mieter.nachname": tenant.lastName,
    "mieter.name": `${tenant.firstName} ${tenant.lastName}`,
    "mieter.strasse": tenant.street ?? "",
    "mieter.plz": tenant.zip ?? "",
    "mieter.ort": tenant.city ?? "",
    "mieter.plzOrt": [tenant.zip, tenant.city].filter(Boolean).join(" "),
    "mieter.geburtsdatum": tenant.birthDate ? formatDate(tenant.birthDate) : "",
    "mieter.geburtsort": "",
    "mieter.staatsangehoerigkeit": tenant.nationality ?? "",
    "mieter.ausweisnummer": tenant.idNumber ?? "",
    "mieter.telefon": tenant.phone ?? "",
    "mieter.email": tenant.email,
    "mieter.arbeitgeber": tenant.company ?? "",

    mietbeginn: formatDate(tenancy.startDate),
    mietende: tenancy.endDate ? formatDate(tenancy.endDate) : "unbefristet",
    zimmer: room.name,
    bett: bed.label,
    miete: formatCents(tenancy.monthlyRentCents),
    kaution: formatCents(tenancy.depositCents),
    vertragsnummer: contract.contractNumber,

    "objekt.name": property.name,
    "objekt.strasse": property.street,
    "objekt.plz": property.zip,
    "objekt.ort": property.city,
    "objekt.plzOrt": `${property.zip} ${property.city}`,

    "vermieter.name": settings.companyName,
    "vermieter.strasse": settings.companyStreet,
    "vermieter.plzOrt": `${settings.companyZip} ${settings.companyCity}`,

    heute,
    ort,
    ortDatum: ort ? `${ort}, ${heute}` : heute,
  };

  if (contract.signatureData) {
    werte["mieter.unterschrift"] = contract.signatureData;
  }

  return werte;
}

export type GeneratedDocument = {
  /** Art des Vordrucks, aus dem das Dokument entstanden ist. */
  kind: string;
  title: string;
  fileName: string;
  pdf: Buffer;
  /** Ersetzt dieses Dokument den selbst erzeugten Mietvertrag? */
  istMietvertrag: boolean;
  /** Erfüllt es die Meldepflicht nach § 19 BMG? */
  istWohnungsgeberbestaetigung: boolean;
};

/**
 * Baut alle Dokumente, die sich aus den Vordrucken des Objekts ergeben.
 *
 * Ist kein Vordruck hinterlegt, kommt eine leere Liste zurueck und der Aufrufer
 * bleibt beim selbst erzeugten Mietvertrag. Ein kombinierter Vordruck deckt
 * beides ab und wird nur einmal erzeugt.
 */
export async function buildDocumentsFromTemplates(
  contract: ContractWithRelations,
): Promise<GeneratedDocument[]> {
  const propertyId = contract.tenancy.bed.room.propertyId;
  const templates = await prisma.propertyTemplate.findMany({
    where: { propertyId, active: true },
  });
  if (templates.length === 0) return [];

  const werte = await buildTemplateValues(contract);
  const mieterName = `${contract.tenancy.tenant.firstName} ${contract.tenancy.tenant.lastName}`;
  const ergebnis: GeneratedDocument[] = [];

  for (const template of templates) {
    const map = parseFieldMap(template.fieldMap);
    let pdf: Buffer;
    try {
      pdf = await fillTemplate(Buffer.from(template.data), map, werte);
    } catch (error) {
      console.error(`[vordruck] ${template.kind} konnte nicht gefüllt werden:`, error);
      continue;
    }

    // Sieht der Vordruck kein Feld fuer die Unterschrift vor, kommt der
    // Nachweis als eigenes Blatt hinterher - er darf nicht verloren gehen.
    const hatUnterschriftsfeld = Object.values(map).includes("mieter.unterschrift");
    if (!hatUnterschriftsfeld && contract.signedAt && coversContract(template.kind)) {
      pdf = await appendSignatureSheet(pdf, {
        vertragsnummer: contract.contractNumber,
        mieter: mieterName,
        unterzeichner: contract.signerName ?? mieterName,
        signedAt: contract.signedAt,
        ip: contract.signerIp,
        userAgent: contract.signerUserAgent,
        signatureDataUrl: contract.signatureData,
      });
    }

    // Ein kombinierter Vordruck traegt beides in einer Datei; er wird deshalb
    // einmal abgelegt und zaehlt fuer beide Zwecke.
    const istMietvertrag = coversContract(template.kind);
    const istBestaetigung = coversLandlordConfirmation(template.kind);

    const bezeichnung = istMietvertrag && istBestaetigung
      ? `Mietvertrag mit Wohnungsgeberbestätigung ${contract.contractNumber} – ${mieterName}`
      : istMietvertrag
        ? `Mietvertrag ${contract.contractNumber} – ${mieterName}`
        : `Wohnungsgeberbestätigung ${contract.contractNumber} – ${mieterName}`;

    const dateiname = istMietvertrag
      ? `${contract.contractNumber} ${mieterName}.pdf`
      : `Wohnungsgeberbestaetigung ${contract.contractNumber} ${mieterName}.pdf`;

    ergebnis.push({
      kind: template.kind,
      title: bezeichnung,
      fileName: dateiname,
      pdf,
      istMietvertrag,
      istWohnungsgeberbestaetigung: istBestaetigung,
    });
  }

  return ergebnis;
}
