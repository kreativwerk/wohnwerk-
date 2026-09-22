import { NextResponse } from "next/server";

import { isAdmin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TICKET_STATUS_LABEL } from "@/lib/enums";
import { uebersetzer } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export type SuchTreffer = { id: string; titel: string; untertitel: string; href: string };
export type SuchGruppe = { art: string; treffer: SuchTreffer[] };

const JE_GRUPPE = 5;

/**
 * Die Suche hinter dem Suchfeld oben auf jeder Seite. Antwortet schon
 * nach zwei Buchstaben mit Vorschlaegen, gruppiert nach Art: Mieter,
 * Objekte, Zimmer, Vertraege, Tickets. Wer kein Admin ist, sieht keine
 * Tickets - die Seiten dahinter waeren ihm ohnehin verschlossen.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireApiUser();
  } catch (antwort) {
    return antwort as Response;
  }
  const t = await uebersetzer();
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ gruppen: [] });

  const enthaelt = { contains: q, mode: "insensitive" as const };
  // Telefonnummern: Ziffern vergleichen, Leerzeichen und Striche ignorieren.
  const ziffern = q.replace(/\D/g, "");

  const [tenants, properties, rooms, contracts, tickets] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        OR: [
          { firstName: enthaelt },
          { lastName: enthaelt },
          { email: enthaelt },
          { privateEmail: enthaelt },
          { company: enthaelt },
          ...(ziffern.length >= 4 ? [{ phone: { contains: ziffern.slice(-6) } }] : []),
        ],
      },
      orderBy: [{ status: "asc" }, { lastName: "asc" }],
      take: JE_GRUPPE,
      include: {
        tenancies: {
          // Laufend oder mit Auszug in der Zukunft - wer am 24. geht, wohnt heute noch dort.
          where: { OR: [{ status: { in: ["DRAFT", "SENT", "ACTIVE"] } }, { status: "ENDED", endDate: { gt: new Date() } }] },
          take: 1,
          orderBy: { startDate: "desc" },
          include: { bed: { include: { room: { include: { property: { select: { name: true } } } } } } },
        },
      },
    }),
    prisma.property.findMany({
      where: { OR: [{ name: enthaelt }, { street: enthaelt }, { city: enthaelt }] },
      orderBy: { name: "asc" },
      take: JE_GRUPPE,
    }),
    prisma.room.findMany({
      where: { active: true, OR: [{ name: enthaelt }, { floor: enthaelt }] },
      orderBy: { name: "asc" },
      take: JE_GRUPPE,
      include: { property: { select: { id: true, name: true } }, _count: { select: { beds: true } } },
    }),
    prisma.contract.findMany({
      where: { OR: [{ contractNumber: enthaelt }, { tenancy: { reference: enthaelt } }] },
      orderBy: { createdAt: "desc" },
      take: JE_GRUPPE,
      include: { tenancy: { include: { tenant: { select: { firstName: true, lastName: true } } } } },
    }),
    isAdmin(user)
      ? prisma.ticket.findMany({
          where: { OR: [{ titel: enthaelt }, { beschreibung: enthaelt }] },
          orderBy: { createdAt: "desc" },
          take: JE_GRUPPE,
        })
      : Promise.resolve([]),
  ]);

  const gruppen: SuchGruppe[] = [
    {
      art: t("Mieter"),
      treffer: tenants.map((tenant) => {
        const ty = tenant.tenancies[0];
        const wo = ty ? `${ty.bed.room.property.name} · ${ty.bed.room.name} · ${ty.bed.label}` : tenant.status === "EHEMALIG" ? t("Ehemalig") : t("ohne Bett");
        return { id: tenant.id, titel: `${tenant.firstName} ${tenant.lastName}`.trim(), untertitel: [wo, tenant.company].filter(Boolean).join(" · "), href: `/mieter/${tenant.id}` };
      }),
    },
    {
      art: t("Objekte"),
      treffer: properties.map((p) => ({ id: p.id, titel: p.name, untertitel: `${p.street}, ${p.zip} ${p.city}`, href: `/objekte/${p.id}` })),
    },
    {
      art: t("Zimmer"),
      treffer: rooms.map((r) => ({
        id: r.id,
        titel: `${r.property.name} · ${r.name}`,
        untertitel: [r.floor, t("{anzahl} Betten", { anzahl: r._count.beds })].filter(Boolean).join(" · "),
        href: `/objekte/${r.property.id}/zimmerplan`,
      })),
    },
    {
      art: t("Verträge"),
      treffer: contracts.map((c) => ({
        id: c.id,
        titel: c.contractNumber,
        untertitel: `${c.tenancy.tenant.firstName} ${c.tenancy.tenant.lastName} · ${c.tenancy.reference}`,
        href: `/vertraege/${c.id}`,
      })),
    },
    {
      art: t("Tickets"),
      treffer: tickets.map((tk) => ({ id: tk.id, titel: tk.titel, untertitel: t(TICKET_STATUS_LABEL[tk.status] ?? tk.status), href: `/tickets/${tk.id}` })),
    },
  ].filter((g) => g.treffer.length > 0);

  return NextResponse.json({ gruppen });
}
