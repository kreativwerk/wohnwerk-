import "server-only";

import { prisma } from "./db";
import { getSettings } from "./settings";

/**
 * DATEV-Format (EXTF-Buchungsstapel, Version 700 / Formatversion 13).
 *
 * Das ist die Datei, die eine Kanzlei ohne Nacharbeit in DATEV einlesen kann:
 * Windows-1252 kodiert, Semikolon-getrennt, Betraege mit Komma, zwei
 * Kopfzeilen nach Vorgabe. Jede gebuchte Kontobewegung wird zu einer Zeile
 * gegen das Bank-Sachkonto.
 *
 * Kontenrahmen und Nummern gibt die Kanzlei vor, deshalb sind sie unter
 * Einstellungen -> Steuerberater pflegbar statt fest verdrahtet.
 */

export type DatevSettings = {
  beraterNr: string;
  mandantNr: string;
  kontoBank: string;
  kontoErloes: string;
  kontoAufwand: string;
};

/** Spaltenkopf der Formatversion 13 - alle 125 Felder, wie DATEV ihn erwartet. */
const SPALTEN = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs",
  "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto",
  "Buchungstext", "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank",
  "Sachverhalt", "Zinssperre", "Beleglink", "Beleginfo - Art 1", "Beleginfo - Inhalt 1",
  "Beleginfo - Art 2", "Beleginfo - Inhalt 2", "Beleginfo - Art 3", "Beleginfo - Inhalt 3",
  "Beleginfo - Art 4", "Beleginfo - Inhalt 4", "Beleginfo - Art 5", "Beleginfo - Inhalt 5",
  "Beleginfo - Art 6", "Beleginfo - Inhalt 6", "Beleginfo - Art 7", "Beleginfo - Inhalt 7",
  "Beleginfo - Art 8", "Beleginfo - Inhalt 8", "KOST1 - Kostenstelle", "KOST2 - Kostenstelle",
  "Kost-Menge", "EU-Land u. UStID (Bestimmung)", "EU-Steuersatz (Bestimmung)",
  "Abw. Versteuerungsart", "Sachverhalt L+L", "Funktionsergänzung L+L", "BU 49 Hauptfunktionstyp",
  "BU 49 Hauptfunktionsnummer", "BU 49 Funktionsergänzung", "Zusatzinformation - Art 1",
  "Zusatzinformation- Inhalt 1", "Zusatzinformation - Art 2", "Zusatzinformation- Inhalt 2",
  "Zusatzinformation - Art 3", "Zusatzinformation- Inhalt 3", "Zusatzinformation - Art 4",
  "Zusatzinformation- Inhalt 4", "Zusatzinformation - Art 5", "Zusatzinformation- Inhalt 5",
  "Zusatzinformation - Art 6", "Zusatzinformation- Inhalt 6", "Zusatzinformation - Art 7",
  "Zusatzinformation- Inhalt 7", "Zusatzinformation - Art 8", "Zusatzinformation- Inhalt 8",
  "Zusatzinformation - Art 9", "Zusatzinformation- Inhalt 9", "Zusatzinformation - Art 10",
  "Zusatzinformation- Inhalt 10", "Zusatzinformation - Art 11", "Zusatzinformation- Inhalt 11",
  "Zusatzinformation - Art 12", "Zusatzinformation- Inhalt 12", "Zusatzinformation - Art 13",
  "Zusatzinformation- Inhalt 13", "Zusatzinformation - Art 14", "Zusatzinformation- Inhalt 14",
  "Zusatzinformation - Art 15", "Zusatzinformation- Inhalt 15", "Zusatzinformation - Art 16",
  "Zusatzinformation- Inhalt 16", "Zusatzinformation - Art 17", "Zusatzinformation- Inhalt 17",
  "Zusatzinformation - Art 18", "Zusatzinformation- Inhalt 18", "Zusatzinformation - Art 19",
  "Zusatzinformation- Inhalt 19", "Zusatzinformation - Art 20", "Zusatzinformation- Inhalt 20",
  "Stück", "Gewicht", "Zahlweise", "Forderungsart", "Veranlagungsjahr", "Zugeordnete Fälligkeit",
  "Skontotyp", "Auftragsnummer", "Buchungstyp", "USt-Schlüssel (Anzahlungen)",
  "EU-Land (Anzahlungen)", "Sachverhalt L+L (Anzahlungen)", "EU-Steuersatz (Anzahlungen)",
  "Erlöskonto (Anzahlungen)", "Herkunft-Kz", "Buchungs GUID", "KOST-Datum", "SEPA-Mandatsreferenz",
  "Skontosperre", "Gesellschaftername", "Beteiligtennummer", "Identifikationsnummer",
  "Zeichnernummer", "Postensperre bis", "Bezeichnung SoBil-Sachverhalt", "Kennzeichen SoBil-Buchung",
  "Festschreibung", "Leistungsdatum", "Datum Zuord. Steuerperiode", "Fälligkeit", "Generalumkehr (GU)",
  "Steuersatz", "Land", "Abrechnungsreferenz", "BVV-Position", "EU-Land u. UStID (Ursprung)",
  "EU-Steuersatz (Ursprung)", "Abw. Skontokonto",
];

function feld(text: string): string {
  return `"${text.split('"').join('""')}"`;
}

function betrag(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

function jjjjmmtt(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function ttmm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Belegfeld 1: DATEV erlaubt hoechstens 36 Zeichen aus einem engen Vorrat. */
function belegfeld(text: string): string {
  return text.replace(/[^A-Za-z0-9$%&*+-/]/g, "").slice(0, 36);
}

function buchungstext(text: string): string {
  return text.replace(/[\r\n;]+/g, " ").trim().slice(0, 60);
}

export async function readDatevSettings(): Promise<DatevSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["datevBeraterNr", "datevMandantNr", "datevKontoBank", "datevKontoErloes", "datevKontoAufwand"] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    beraterNr: map.get("datevBeraterNr") ?? "",
    mandantNr: map.get("datevMandantNr") ?? "",
    kontoBank: map.get("datevKontoBank") ?? "1200",
    kontoErloes: map.get("datevKontoErloes") ?? "8100",
    kontoAufwand: map.get("datevKontoAufwand") ?? "4900",
  };
}

/**
 * Baut den Buchungsstapel eines Zeitraums. Rueckgabe als Windows-1252-Bytes,
 * denn DATEV liest kein UTF-8.
 */
export async function buildDatevCsv(year: number, month?: number): Promise<Buffer> {
  const einstellungen = await readDatevSettings();
  const settings = await getSettings();

  const from = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1));
  const to = month
    ? new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
    : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const transactions = await prisma.bankTransaction.findMany({
    where: { bookingDate: { gte: from, lte: to } },
    orderBy: { bookingDate: "asc" },
    include: {
      allocations: { include: { rentCharge: { include: { tenancy: { include: { contract: true } } } } } },
    },
  });

  const jetzt = new Date();
  const zeitstempel =
    jjjjmmtt(jetzt) +
    String(jetzt.getUTCHours()).padStart(2, "0") +
    String(jetzt.getUTCMinutes()).padStart(2, "0") +
    String(jetzt.getUTCSeconds()).padStart(2, "0") +
    "000";

  const bezeichnung = month
    ? `Wohnwerk ${String(month).padStart(2, "0")}/${year}`
    : `Wohnwerk ${year}`;

  // Kopfzeile 1: Metadaten des Stapels nach DATEV-Vorgabe (31 Felder).
  const kopf = [
    feld("EXTF"), "700", "21", feld("Buchungsstapel"), "13", zeitstempel, "", feld("RE"),
    feld("Wohnwerk"), "", einstellungen.beraterNr || "0", einstellungen.mandantNr || "0",
    `${year}0101`, "4", jjjjmmtt(from), jjjjmmtt(to), feld(bezeichnung), "", "1", "0", "0",
    feld("EUR"), "", "", "", "", "", "", "", "", "",
  ].join(";");

  const zeilen: string[] = [kopf, SPALTEN.map(feld).join(";")];

  for (const tx of transactions) {
    const istEinnahme = tx.amountCents > 0;
    const gegenkonto = istEinnahme ? einstellungen.kontoErloes : einstellungen.kontoAufwand;
    const vertrag = tx.allocations[0]?.rentCharge.tenancy.contract?.contractNumber ?? "";

    const zeile = new Array<string>(SPALTEN.length).fill("");
    zeile[0] = betrag(tx.amountCents);
    zeile[1] = feld(istEinnahme ? "S" : "H");
    zeile[2] = feld("EUR");
    zeile[6] = einstellungen.kontoBank;
    zeile[7] = gegenkonto;
    zeile[9] = ttmm(tx.bookingDate);
    zeile[10] = feld(belegfeld(vertrag || tx.endToEndId || ""));
    zeile[13] = feld(buchungstext(`${tx.counterpartyName ?? ""} ${tx.purpose ?? ""}`));
    // Festschreibung 0: offen, die Kanzlei schreibt selbst fest.
    zeile[SPALTEN.indexOf("Festschreibung")] = "0";

    zeilen.push(zeile.join(";"));
  }

  const inhalt = zeilen.join("\r\n") + "\r\n";
  // Windows-1252: Umlaute und ß liegen dort wie in Latin-1. Alles, was der
  // Zeichenvorrat nicht kennt, wird sichtbar ersetzt statt still verstuemmelt.
  const bereinigt = Array.from(inhalt, (z) => (z.codePointAt(0)! <= 0xff ? z : "?")).join("");
  return Buffer.from(bereinigt, "latin1");
}
