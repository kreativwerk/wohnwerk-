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
import { renderWohnungsgeberbestaetigung, type WohnungsgeberAngaben } from "./wohnungsgeber-pdf";

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
    // Die Kaestchen der Wohnungsgeberbestaetigung; "divers" oder keine
    // Angabe laesst beide leer.
    "mieter.maennlich": tenant.gender === "M" ? "ja" : "nein",
    "mieter.weiblich": tenant.gender === "W" ? "ja" : "nein",

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
    "vermieter.plzOrtStrasse": `${settings.companyZip} ${settings.companyCity}, ${settings.companyStreet}`,
    "vermieter.telefonEmail": [settings.companyPhone, settings.companyEmail].filter(Boolean).join(" · "),
    // Wohnwerk ist eine Firma; ob es auch Eigentuemer ist, sagt das Objekt.
    "vermieter.istFirma": "ja",
    "vermieter.istEigentuemer": property.tenure === "EIGENTUM" ? "ja" : "nein",
    "vermieter.nichtEigentuemer": property.tenure === "EIGENTUM" ? "nein" : "ja",

    "eigentuemer.name": property.tenure === "EIGENTUM" ? "" : (property.ownerName ?? ""),
    "eigentuemer.anschrift": property.tenure === "EIGENTUM" ? "" : (property.ownerAddress ?? ""),
    "eigentuemer.kontakt": property.tenure === "EIGENTUM" ? "" : (property.ownerContact ?? ""),

    "objekt.plzOrtStrasse": `${property.zip} ${property.city}, ${property.street}`,
    lage: [room.floor, room.name, bed.label].filter(Boolean).join(", "),

    heute,
    ort,
    ortDatum: ort ? `${ort}, ${heute}` : heute,
    // Fuer Kaestchen, die auf jedem Exemplar gleich sind (z. B. "Einzug").
    "immer.ja": "ja",
  };

  if (contract.signatureData) {
    werte["mieter.unterschrift"] = contract.signatureData;
  }
  if (settings.landlordSignature.startsWith("data:image/png;base64,")) {
    werte["vermieter.unterschrift"] = settings.landlordSignature;
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
  const mieterName = `${contract.tenancy.tenant.firstName} ${contract.tenancy.tenant.lastName}`;
  const ergebnis: GeneratedDocument[] = [];

  // Ohne Vordruck der Gemeinde: die Bestaetigung im eigenen Layout - die
  // Meldepflicht haengt nicht am Formular, nur an den Angaben nach § 19 BMG.
  if (!templates.some((t) => coversLandlordConfirmation(t.kind))) {
    ergebnis.push({
      kind: "LANDLORD_CONFIRMATION",
      title: `Wohnungsgeberbestätigung ${contract.contractNumber} – ${mieterName}`,
      fileName: `Wohnungsgeberbestaetigung ${contract.contractNumber} ${mieterName}.pdf`,
      pdf: await renderWohnungsgeberbestaetigung(await wohnungsgeberAngaben(contract)),
      istMietvertrag: false,
      istWohnungsgeberbestaetigung: true,
    });
  }
  if (templates.length === 0) return ergebnis;

  const werte = await buildTemplateValues(contract);

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

const STOCKWERK: Record<string, string> = {
  KG: "Kellergeschoss",
  UG: "Untergeschoss",
  EG: "Erdgeschoss",
  OG: "Obergeschoss",
  DG: "Dachgeschoss",
};

/** "EG" -> "Erdgeschoss", "1. OG" -> "1. Obergeschoss"; Unbekanntes bleibt. */
export function stockwerkAusgeschrieben(kurz: string | null | undefined): string {
  const roh = (kurz ?? "").trim();
  if (!roh) return "";
  return roh.replace(/\b(KG|UG|EG|OG|DG)\b/g, (k) => STOCKWERK[k] ?? k);
}

/** Lage fuer die Meldebehoerde: Stockwerk und Zimmer, ohne Doppelungen und ohne Bettnummer. */
export function lageImHaus(stockwerk: string | null | undefined, zimmer: string | null | undefined): string {
  const s = stockwerkAusgeschrieben(stockwerk);
  const z = (zimmer ?? "").trim();
  if (!z || z.toLowerCase() === s.toLowerCase() || z.toLowerCase() === (stockwerk ?? "").trim().toLowerCase()) return s || z;
  return s ? `${s}, ${z}` : z;
}

/** Ort der Meldebehoerde aus dem Ort des Objekts - ohne Ortsteil in Klammern. */
export function meldeOrt(ort: string): string {
  return ort.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

/** Angaben fuer die selbst gesetzte Wohnungsgeberbestaetigung. */
export async function wohnungsgeberAngaben(contract: ContractWithRelations): Promise<WohnungsgeberAngaben> {
  const settings = await getSettings();
  const { tenancy } = contract;
  const { tenant, bed } = tenancy;
  const property = bed.room.property;
  const heute = formatDate(new Date());
  const istEigentuemer = property.tenure === "EIGENTUM";
  return {
    wohnungsgeber: {
      name: settings.companyName,
      anschrift: `${settings.companyStreet}, ${settings.companyZip} ${settings.companyCity}`,
      kontakt: [settings.companyPhone, settings.companyEmail].filter(Boolean).join(" · ") || null,
    },
    istEigentuemer,
    eigentuemer: istEigentuemer ? null : { name: property.ownerName ?? "", anschrift: property.ownerAddress ?? "" },
    wohnung: {
      anschrift: `${property.street}, ${property.zip} ${property.city}`,
      lage: lageImHaus(bed.room.floor, bed.room.name),
    },
    meldebehoerde: meldeOrt(property.city),
    art: "EINZUG",
    datum: formatDate(tenancy.startDate),
    personen: [
      {
        familienname: tenant.lastName,
        vornamen: tenant.firstName,
        geburtsdatum: tenant.birthDate ? formatDate(tenant.birthDate) : null,
      },
    ],
    ortDatum: settings.companyCity ? `${settings.companyCity}, ${heute}` : heute,
    unterschrift: settings.landlordSignature.startsWith("data:image/png;base64,") ? settings.landlordSignature : null,
    referenz: `Mietvertrag ${contract.contractNumber}`,
  };
}
