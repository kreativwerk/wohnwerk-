import "server-only";

import { prisma } from "./db";
import { absenderWoerter, passendeAusgabe, rechnungsnummerAusText, type BelegDaten } from "./postfach-regeln";

const TAG = 24 * 60 * 60 * 1000;

export type GefundeneAusgabe = { id: string; bookingDate: Date; amountCents: number; counterpartyName: string | null };

/**
 * Sucht die Ausgabe ohne Beleg, zu der ein Beleg gehoert - gleicher Betrag
 * auf den Cent, passender Zeitraum, im Zweifel der passende Name. Kein
 * eindeutiger Treffer: null.
 */
export async function ausgabeFuerBeleg(beleg: BelegDaten): Promise<GefundeneAusgabe | null> {
  if (beleg.betraege.length === 0) return null;
  const bezug = beleg.einzug ?? beleg.datum;
  const kandidaten = await prisma.bankTransaction.findMany({
    where: {
      direction: "DEBIT",
      reviewStatus: { not: "IGNORED" },
      documents: { none: {} },
      bookingDate: { gte: new Date(bezug.getTime() - 20 * TAG), lte: new Date(bezug.getTime() + 75 * TAG) },
      amountCents: { in: beleg.betraege.slice(0, 40).map((b) => -b) },
    },
    select: { id: true, bookingDate: true, amountCents: true, counterpartyName: true, purpose: true },
  });
  const id = passendeAusgabe(
    beleg,
    kandidaten.map((k) => ({
      id: k.id,
      betragCents: Math.abs(k.amountCents),
      datum: k.bookingDate,
      gegenpartei: k.counterpartyName,
      zweck: k.purpose,
    })),
  );
  const treffer = kandidaten.find((k) => k.id === id);
  return treffer ? { id: treffer.id, bookingDate: treffer.bookingDate, amountCents: treffer.amountCents, counterpartyName: treffer.counterpartyName } : null;
}

/** Beleg an die Buchung haengen - eine Ausgabe mit Beleg gilt als gebucht. */
export async function belegAnBuchung(documentId: string, bankTransactionId: string): Promise<void> {
  const dokument = await prisma.document.update({
    where: { id: documentId },
    data: { bankTransactionId },
    select: { category: true },
  });
  await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { reviewStatus: "BOOKED", ...(dokument.category ? { category: dokument.category } : {}) },
  });
}

/**
 * Belege aus dem Postfach, zu denen es beim Abholen noch keine Buchung gab
 * (die Rechnung kommt oft vor der Abbuchung): bei jedem Postfach- und
 * Qonto-Abgleich erneut versuchen. Gibt die Zahl der neu zugeordneten zurueck.
 */
export async function postfachBelegeNachZuordnen(): Promise<number> {
  const offen = await prisma.document.findMany({
    where: {
      // Aus dem Postfach - oder von Hand abgelegt, aber mit Rechnungsnummer (sicherer Treffer).
      OR: [{ emailAnhangId: { not: null } }, { notes: { contains: "Rechnungsnr." } }],
      bankTransactionId: null,
      kind: "RECEIPT",
      amountCents: { not: null },
      documentDate: { gte: new Date(Date.now() - 200 * TAG) },
    },
    select: {
      id: true,
      amountCents: true,
      documentDate: true,
      notes: true,
      supplier: true,
      emailAnhangId: true,
      emailAnhang: { select: { nachricht: { select: { vonAdresse: true, vonName: true, datum: true } } } },
    },
    take: 200,
  });

  let zugeordnet = 0;
  for (const d of offen) {
    const nachricht = d.emailAnhang?.nachricht;
    // Weitere Betraege aus der Rechnung stehen in der Notiz ("Beträge: 12,34 / 56,78").
    const weitere = [...(d.notes ?? "").matchAll(/(\d+),(\d{2})(?!\d)/g)].map((t) => Number(t[1]) * 100 + Number(t[2]));
    const rechnungsnummer = rechnungsnummerAusText(d.notes);
    const einzugTreffer = /Einzug (\d{2})\.(\d{2})\.(\d{4})/.exec(d.notes ?? "");
    // Von Hand abgelegt: nur ueber die Rechnungsnummer, nie nur ueber den Betrag.
    if (!d.emailAnhangId && !rechnungsnummer) continue;
    const treffer = await ausgabeFuerBeleg({
      betraege: [...new Set([d.amountCents as number, ...weitere])],
      datum: d.documentDate ?? nachricht?.datum ?? new Date(),
      absenderWoerter: nachricht ? absenderWoerter(nachricht.vonAdresse, nachricht.vonName) : absenderWoerter("", d.supplier),
      rechnungsnummer,
      einzug: einzugTreffer ? new Date(Date.UTC(Number(einzugTreffer[3]), Number(einzugTreffer[2]) - 1, Number(einzugTreffer[1]))) : null,
      nurMitNummer: !d.emailAnhangId,
    });
    if (!treffer) continue;
    await belegAnBuchung(d.id, treffer.id);
    zugeordnet += 1;
  }
  return zugeordnet;
}
