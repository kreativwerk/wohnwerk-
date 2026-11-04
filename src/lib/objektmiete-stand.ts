import "server-only";

import { prisma } from "./db";
import {
  monateMitZahlungen,
  passtZumVertrag,
  vertragsMonate,
  zahlungVerteilen,
  type MietZahlung,
  type Mietmonat,
} from "./objektmiete";

/** Wie weit zurueck abgeglichen wird - aelter interessiert hier nicht mehr. */
const MONATE_ZURUECK = 6;
const MONATE_VORAUS = 3;

export type ObjektmieteStand = Awaited<ReturnType<typeof objektmietenStand>>;

/**
 * Alle Vertraege, in denen wir Mieter sind, mit den Monaten der letzten
 * Zeit und der naechsten Zeit - abgeglichen mit unseren Abbuchungen.
 */
export async function objektmietenStand(heute: Date) {
  const von = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - MONATE_ZURUECK, 1));
  const bis = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() + MONATE_VORAUS + 1, 0));

  const vertraege = await prisma.objektmiete.findMany({
    include: { property: { select: { id: true, name: true, street: true, city: true } } },
    orderBy: [{ property: { name: "asc" } }, { bezeichnung: "asc" }],
  });

  // Abbuchungen ab etwas vor dem Zeitraum: Miete wird oft vorab gezahlt.
  const abbuchungen = vertraege.length
    ? await prisma.bankTransaction.findMany({
        where: {
          direction: "DEBIT",
          reviewStatus: { not: "IGNORED" },
          bookingDate: { gte: new Date(von.getTime() - 31 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true, bookingDate: true, amountCents: true, counterpartyName: true, purpose: true },
        orderBy: { bookingDate: "asc" },
      })
    : [];

  const zahlungenJeVertrag = new Map<string, MietZahlung[]>();
  for (const tx of abbuchungen) {
    // Eine Kaution an den Vermieter ist keine Monatsmiete.
    if (/kaution/i.test(tx.purpose ?? "")) continue;
    const passend = vertraege.filter((v) => passtZumVertrag(v.suchbegriffe, tx));
    for (const { vertrag, betragCents } of zahlungVerteilen(passend, tx)) {
      const liste = zahlungenJeVertrag.get(vertrag.id) ?? [];
      liste.push({ id: tx.id, datum: tx.bookingDate, betragCents, zweck: tx.purpose });
      zahlungenJeVertrag.set(vertrag.id, liste);
    }
  }

  const zeilen = vertraege.map((v) => {
    const monate = monateMitZahlungen(vertragsMonate(v, von, bis), zahlungenJeVertrag.get(v.id) ?? [], heute);
    const naechsteOffen = monate.find((m) => m.status !== "BEZAHLT" && m.faellig >= heute) ?? null;
    const laeuft = !v.ende || v.ende >= heute;
    return { vertrag: v, monate, naechsteOffen, laeuft, zahlungen: zahlungenJeVertrag.get(v.id) ?? [] };
  });

  // Offene und ueberfaellige Monate ueber alle Vertraege, aelteste zuerst.
  const offen = zeilen
    .flatMap((z) => z.monate.filter((m) => m.status !== "BEZAHLT" && m.faellig <= bis).map((m) => ({ zeile: z, monat: m })))
    .sort((a, b) => a.monat.faellig.getTime() - b.monat.faellig.getTime());

  const ueberfaellig = offen.filter((o) => o.monat.faellig < heute);
  const kommend = offen.filter((o) => o.monat.faellig >= heute);

  // Naechster Zahltag: alle Vertraege, die am selben Tag faellig sind.
  const naechsterTag = kommend[0]?.monat.faellig ?? null;
  const naechste = naechsterTag
    ? kommend.filter((o) => o.monat.faellig.getTime() === naechsterTag.getTime())
    : [];

  return {
    zeilen,
    offen,
    ueberfaellig,
    naechsterTag,
    naechste,
  };
}

/** Was von diesen Monaten noch zu zahlen ist. */
export function restSumme(liste: Array<{ monat: Mietmonat }>): number {
  return liste.reduce((s, o) => s + Math.max(0, o.monat.sollCents - o.monat.bezahltCents), 0);
}


