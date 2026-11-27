import "server-only";

import type { ContractWithRelations } from "./contract";
import { spracheAusNationalitaet } from "./einladung";
import { istVertragSprache } from "./vertrag-sprache";
import { renderZusatzblaetter } from "./zusatzblaetter-pdf";

/**
 * Hausregeln und Muelltrennung als PDF zu einem Vertrag. Sprache: aus dem
 * Aufruf (?sprache=sq), sonst die beim Unterschreiben gewaehlte, sonst aus
 * der Staatsangehoerigkeit geraten.
 */
export async function zusatzblaetterAntwort(contract: ContractWithRelations, request: Request): Promise<Response> {
  const gewuenscht = new URL(request.url).searchParams.get("sprache");
  const tenant = contract.tenancy.tenant;
  const sprache = istVertragSprache(gewuenscht)
    ? gewuenscht
    : istVertragSprache(contract.sprache)
      ? contract.sprache
      : spracheAusNationalitaet(tenant.nationality);
  const property = contract.tenancy.bed.room.property;

  const pdf = await renderZusatzblaetter({
    sprache,
    mieter: `${tenant.firstName} ${tenant.lastName}`.trim(),
    objekt: property.street ? `${property.street}, ${property.city ?? ""}`.replace(/,\s*$/, "") : property.name,
    vertragsnummer: contract.contractNumber,
  });
  const name = `${tenant.lastName}-${tenant.firstName}`.replace(/[^\p{L}\p{N}-]+/gu, "") || contract.contractNumber;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Hausregeln-Muelltrennung-${encodeURIComponent(name)}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
