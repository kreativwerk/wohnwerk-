import "server-only";

import { prisma } from "./db";
import { getSettings } from "./settings";
import { formatDate } from "./dates";
import type { ContractData } from "./contract-pdf";

export type ContractWithRelations = NonNullable<Awaited<ReturnType<typeof loadContract>>>;

export function loadContract(idOrToken: { id?: string; token?: string }) {
  return prisma.contract.findFirst({
    where: idOrToken.id ? { id: idOrToken.id } : { token: idOrToken.token },
    include: {
      tenancy: {
        include: {
          tenant: true,
          bed: { include: { room: { include: { property: true } } } },
        },
      },
      documents: true,
    },
  });
}

/**
 * Baut die Vertragsdaten aus Stammdaten und Einstellungen zusammen.
 * Ist der Vertrag bereits unterschrieben, gewinnt der gespeicherte Snapshot –
 * spaetere Aenderungen an den Einstellungen duerfen einen unterschriebenen
 * Vertrag nicht nachtraeglich veraendern.
 */
export async function buildContractData(
  contract: ContractWithRelations,
  options: { includeSignature?: boolean } = {},
): Promise<ContractData> {
  if (contract.snapshot) {
    try {
      const stored = JSON.parse(contract.snapshot) as ContractData;
      return {
        ...stored,
        startDate: new Date(stored.startDate),
        endDate: stored.endDate ? new Date(stored.endDate) : null,
        signature:
          options.includeSignature && contract.signedAt
            ? {
                name: contract.signerName ?? "",
                signedAt: contract.signedAt,
                ip: contract.signerIp,
                dataUrl: contract.signatureData,
              }
            : null,
      };
    } catch {
      // Beschaedigter Snapshot: unten frisch aufbauen.
    }
  }

  const settings = await getSettings();
  const { tenancy } = contract;
  const { tenant, bed } = tenancy;
  const room = bed.room;
  const property = room.property;

  return {
    contractNumber: contract.contractNumber,

    landlordName: settings.companyName,
    landlordStreet: settings.companyStreet,
    landlordZip: settings.companyZip,
    landlordCity: settings.companyCity,
    landlordCountry: settings.companyCountry,
    landlordPhone: settings.companyPhone,
    landlordEmail: settings.companyEmail,
    landlordVatId: settings.companyVatId,
    bankName: settings.bankName,
    bankIban: settings.bankIban,
    bankBic: settings.bankBic,

    tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
    tenantBirthDate: tenant.birthDate ? formatDate(tenant.birthDate) : null,
    tenantNationality: tenant.nationality,
    tenantIdNumber: tenant.idNumber,
    tenantStreet: tenant.street,
    tenantZip: tenant.zip,
    tenantCity: tenant.city,
    tenantCountry: tenant.country,
    tenantEmail: tenant.email,
    tenantPhone: tenant.phone,
    tenantCompany: tenant.company,

    propertyName: property.name,
    propertyStreet: property.street,
    propertyZip: property.zip,
    propertyCity: property.city,
    roomName: room.name,
    bedLabel: bed.label,

    startDate: tenancy.startDate,
    endDate: tenancy.endDate,
    monthlyRentCents: tenancy.monthlyRentCents,
    utilitiesCents: tenancy.utilitiesCents,
    depositCents: tenancy.depositCents,
    billingDay: tenancy.billingDay,
    reference: tenancy.reference,

    intro: settings.contractIntro,
    clauses: settings.contractClauses,
    houseRules: property.houseRulesUrl
      ? `${settings.contractHouseRules}\n\nHausordnung des Objekts: ${property.houseRulesUrl}`
      : settings.contractHouseRules,
    noticePeriod: settings.contractNoticePeriod,

    signature:
      options.includeSignature && contract.signedAt
        ? {
            name: contract.signerName ?? "",
            signedAt: contract.signedAt,
            ip: contract.signerIp,
            dataUrl: contract.signatureData,
          }
        : null,
  };
}

export function contractLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/vertrag/${token}`;
}
