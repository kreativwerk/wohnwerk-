import crypto from "node:crypto";

import { parseAmountToCents } from "./money";
import { parseBankDate } from "./dates";

/**
 * Einlesen von Kontoauszuegen.
 *
 * Unterstuetzt werden die drei Formate, die deutsche Banken im Online-Banking
 * anbieten: CSV (Sparkasse, DKB, ING, Comdirect, Volksbank, Qonto, N26 ...),
 * CAMT.053 (XML) und MT940 (SWIFT). Die Spaltennamen unterscheiden sich je
 * Bank, deshalb wird die Kopfzeile heuristisch zugeordnet statt fest verdrahtet.
 */

export type ParsedTransaction = {
  bookingDate: Date;
  valueDate: Date | null;
  amountCents: number;
  currency: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  endToEndId: string | null;
  bankTxCode: string | null;
};

export type ParseResult = {
  format: "csv" | "camt053" | "mt940" | "pdf";
  iban: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  closingBalanceCents: number | null;
  transactions: ParsedTransaction[];
  warnings: string[];
};

// --- Zeichenkodierung ------------------------------------------------------

/** Deutsche Bank-Exporte kommen haeufig als Windows-1252 statt UTF-8. */
export function decodeBuffer(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  try {
    return new TextDecoder("windows-1252").decode(buffer).replace(/^﻿/, "");
  } catch {
    return utf8.replace(/^﻿/, "");
  }
}

// --- CSV -------------------------------------------------------------------

function detectDelimiter(sample: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestScore = -1;
  for (const candidate of candidates) {
    // Anzahl der Felder in den ersten Zeilen; das konsistenteste Zeichen gewinnt.
    const counts = sample
      .split(/\r?\n/)
      .slice(0, 8)
      .filter((line) => line.trim())
      .map((line) => splitCsvLine(line, candidate).length);
    if (counts.length === 0) continue;
    const max = Math.max(...counts);
    const consistent = counts.filter((c) => c === max).length;
    const score = max > 1 ? max * 10 + consistent : 0;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  out.push(field);
  return out.map((value) => value.trim());
}

/** Zerlegt CSV-Text in Zeilen; Zeilenumbrueche innerhalb von Anfuehrungszeichen bleiben Teil des Feldes. */
function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endRow = () => {
    row.push(field.trim());
    field = "";
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
      i += 1;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  endRow();
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

type ColumnMap = {
  bookingDate: number;
  valueDate: number;
  amount: number;
  currency: number;
  debitCredit: number;
  name: number;
  iban: number;
  purpose: number;
  txType: number;
  endToEnd: number;
};

const COLUMN_PATTERNS: Array<{ field: keyof ColumnMap; patterns: string[]; exact?: boolean }> = [
  {
    field: "bookingDate",
    patterns: ["buchungstag", "buchungsdatum", "belegdatum", "bookingdate", "datum", "date"],
  },
  {
    field: "valueDate",
    patterns: ["valutadatum", "wertstellung", "valuta", "valuedate", "wertstellungstag"],
  },
  {
    field: "amount",
    patterns: [
      "betrag",
      "betrageur",
      "umsatzineur",
      "umsatz",
      "amount",
      "betragineur",
      "wert",
    ],
  },
  { field: "currency", patterns: ["waehrung", "currency", "waehrungbetrag"] },
  { field: "debitCredit", patterns: ["sollhaben", "sh", "debitcreditindicator", "habensoll"] },
  {
    field: "name",
    patterns: [
      "beguenstigterzahlungspflichtiger",
      "auftraggeberempfaenger",
      "namezahlungsbeteiligter",
      "beguenstigter",
      "zahlungsempfaenger",
      "empfaenger",
      "auftraggeber",
      "name",
      "counterparty",
      "payeepayer",
    ],
  },
  {
    field: "iban",
    patterns: [
      "ibanzahlungsbeteiligter",
      "kontonummeriban",
      "ibanempfaenger",
      "iban",
      "kontonummer",
      "counterpartyiban",
    ],
  },
  {
    field: "purpose",
    patterns: [
      "verwendungszweck",
      "verwendungszweck1",
      "vwz",
      "referenz",
      "beschreibung",
      "purpose",
      "remittanceinformation",
      "vermerk",
    ],
  },
  { field: "txType", patterns: ["buchungstext", "umsatzart", "transaktionstyp", "typ", "art"] },
  { field: "endToEnd", patterns: ["endtoendreferenz", "endtoendid", "kundenreferenz", "mandatsreferenz"] },
];

function mapColumns(header: string[]): ColumnMap {
  const normalized = header.map(normalizeHeader);
  const map: ColumnMap = {
    bookingDate: -1,
    valueDate: -1,
    amount: -1,
    currency: -1,
    debitCredit: -1,
    name: -1,
    iban: -1,
    purpose: -1,
    txType: -1,
    endToEnd: -1,
  };

  for (const { field, patterns } of COLUMN_PATTERNS) {
    // Erst exakte Treffer, dann Teilstring-Treffer – so gewinnt "Buchungstag"
    // gegen ein allgemeines "Datum" in derselben Datei.
    let index = normalized.findIndex((h) => patterns.includes(h));
    if (index === -1) {
      index = normalized.findIndex(
        (h, i) => !Object.values(map).includes(i) && patterns.some((p) => h.includes(p)),
      );
    }
    if (index !== -1 && !Object.values(map).includes(index)) map[field] = index;
  }
  return map;
}

/** Findet die Kopfzeile, auch wenn die Datei mit Metazeilen beginnt. */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const map = mapColumns(rows[i]);
    if (map.bookingDate !== -1 && map.amount !== -1) return i;
  }
  return -1;
}

function cell(row: string[], index: number): string {
  if (index < 0 || index >= row.length) return "";
  return (row[index] ?? "").trim();
}

export function parseCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const delimiter = detectDelimiter(text.slice(0, 4000));
  const rows = csvRows(text, delimiter);

  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    throw new Error(
      "In der CSV-Datei wurde keine Kopfzeile mit Buchungsdatum und Betrag gefunden. " +
        "Bitte den Original-Export der Bank hochladen.",
    );
  }

  const map = mapColumns(rows[headerIndex]);
  const transactions: ParsedTransaction[] = [];

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.every((value) => !value)) continue;

    const bookingDate = parseBankDate(cell(row, map.bookingDate));
    if (!bookingDate) {
      // Abschlusszeilen ("Anfangssaldo", Summenzeilen) still uebergehen.
      continue;
    }

    let amountCents = parseAmountToCents(cell(row, map.amount));
    if (amountCents === null) {
      warnings.push(`Zeile ${i + 1}: Betrag konnte nicht gelesen werden, Zeile übersprungen.`);
      continue;
    }

    // Manche Exporte fuehren das Vorzeichen in einer eigenen Soll/Haben-Spalte.
    const sh = cell(row, map.debitCredit).toUpperCase();
    if (sh === "S" || sh === "SOLL" || sh === "DBIT" || sh === "D") {
      amountCents = -Math.abs(amountCents);
    } else if (sh === "H" || sh === "HABEN" || sh === "CRDT" || sh === "C") {
      amountCents = Math.abs(amountCents);
    }

    // Die IBAN in der Zeile ist die des Gegenkontos, nicht die des eigenen Kontos.
    const rowIban = cell(row, map.iban).replace(/\s/g, "").toUpperCase() || null;

    transactions.push({
      bookingDate,
      valueDate: parseBankDate(cell(row, map.valueDate)),
      amountCents,
      currency: (cell(row, map.currency) || "EUR").toUpperCase().slice(0, 3),
      counterpartyName: cell(row, map.name) || null,
      counterpartyIban: rowIban,
      purpose: cell(row, map.purpose) || null,
      endToEndId: cell(row, map.endToEnd) || null,
      bankTxCode: cell(row, map.txType) || null,
    });
  }

  if (transactions.length === 0) {
    throw new Error("Die CSV-Datei enthält keine lesbaren Buchungen.");
  }

  const dates = transactions.map((t) => t.bookingDate.getTime());
  return {
    format: "csv",
    // Das eigene Konto steht in CSV-Exporten selten drin - es wird beim Upload gewaehlt.
    iban: null,
    periodStart: new Date(Math.min(...dates)),
    periodEnd: new Date(Math.max(...dates)),
    closingBalanceCents: null,
    transactions,
    warnings,
  };
}

// --- CAMT.053 (XML) --------------------------------------------------------

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return textOf((value as Record<string, unknown>)["#text"]);
  }
  return null;
}

export async function parseCamt053(text: string): Promise<ParseResult> {
  const { XMLParser } = await import("fast-xml-parser");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });

  const doc = parser.parse(text);
  const statements = asArray(doc?.Document?.BkToCstmrStmt?.Stmt);
  if (statements.length === 0) {
    throw new Error("Die XML-Datei enthält keinen CAMT.053-Kontoauszug (BkToCstmrStmt/Stmt).");
  }

  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];
  let iban: string | null = null;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  let closingBalanceCents: number | null = null;

  for (const stmt of statements) {
    iban = iban ?? textOf(stmt?.Acct?.Id?.IBAN);

    const from = textOf(stmt?.FrToDt?.FrDtTm) ?? textOf(stmt?.FrToDt?.FrDt);
    const to = textOf(stmt?.FrToDt?.ToDtTm) ?? textOf(stmt?.FrToDt?.ToDt);
    if (from) periodStart = new Date(from);
    if (to) periodEnd = new Date(to);

    for (const balance of asArray(stmt?.Bal)) {
      const code = textOf(balance?.Tp?.CdOrPrtry?.Cd);
      if (code === "CLBD") {
        const amount = parseAmountToCents(textOf(balance?.Amt) ?? "");
        if (amount !== null) {
          closingBalanceCents = textOf(balance?.CdtDbtInd) === "DBIT" ? -amount : amount;
        }
      }
    }

    for (const entry of asArray(stmt?.Ntry)) {
      const rawAmount = parseAmountToCents(textOf(entry?.Amt) ?? "");
      if (rawAmount === null) {
        warnings.push("Ein Eintrag ohne lesbaren Betrag wurde übersprungen.");
        continue;
      }
      const credit = textOf(entry?.CdtDbtInd) !== "DBIT";
      const amountCents = credit ? Math.abs(rawAmount) : -Math.abs(rawAmount);

      const bookingRaw = textOf(entry?.BookgDt?.Dt) ?? textOf(entry?.BookgDt?.DtTm);
      const valueRaw = textOf(entry?.ValDt?.Dt) ?? textOf(entry?.ValDt?.DtTm);
      const bookingDate = bookingRaw ? new Date(bookingRaw) : null;
      if (!bookingDate || Number.isNaN(bookingDate.getTime())) {
        warnings.push("Ein Eintrag ohne Buchungsdatum wurde übersprungen.");
        continue;
      }

      const details = asArray(entry?.NtryDtls);
      const txDetails = details.flatMap((d: unknown) =>
        asArray((d as Record<string, unknown>)?.TxDtls),
      );
      const first = txDetails[0] as Record<string, any> | undefined;

      const related = first?.RltdPties;
      const counterparty = credit ? related?.Dbtr : related?.Cdtr;
      const counterpartyAcct = credit ? related?.DbtrAcct : related?.CdtrAcct;

      const purposeParts = [
        textOf(first?.RmtInf?.Ustrd),
        ...asArray(first?.RmtInf?.Ustrd).map(textOf),
        textOf(entry?.AddtlNtryInf),
      ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

      transactions.push({
        bookingDate,
        valueDate: valueRaw ? new Date(valueRaw) : null,
        amountCents,
        currency: (textOf(entry?.Amt?.["@Ccy"]) ?? "EUR").toUpperCase(),
        counterpartyName: textOf(counterparty?.Nm) ?? textOf(counterparty?.Pty?.Nm),
        counterpartyIban: textOf(counterpartyAcct?.Id?.IBAN),
        purpose: purposeParts.join(" ") || null,
        endToEndId: textOf(first?.Refs?.EndToEndId),
        bankTxCode:
          textOf(entry?.BkTxCd?.Domn?.Fmly?.SubFmlyCd) ?? textOf(entry?.BkTxCd?.Prtry?.Cd),
      });
    }
  }

  if (transactions.length === 0) {
    throw new Error("Der CAMT.053-Auszug enthält keine Buchungen.");
  }

  const dates = transactions.map((t) => t.bookingDate.getTime());
  return {
    format: "camt053",
    iban,
    periodStart: periodStart ?? new Date(Math.min(...dates)),
    periodEnd: periodEnd ?? new Date(Math.max(...dates)),
    closingBalanceCents,
    transactions,
    warnings,
  };
}

// --- MT940 -----------------------------------------------------------------

export function parseMt940(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];
  let iban: string | null = null;
  let closingBalanceCents: number | null = null;

  // Fortsetzungszeilen an das jeweilige Feld anhaengen
  const fields: Array<{ tag: string; value: string }> = [];
  for (const line of lines) {
    const match = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (match) fields.push({ tag: match[1], value: match[2] });
    else if (fields.length > 0 && line.trim() && line.trim() !== "-") {
      fields[fields.length - 1].value += line;
    }
  }

  let pending: ParsedTransaction | null = null;
  let statementYearHint: number | null = null;

  const pushPending = () => {
    if (pending) transactions.push(pending);
    pending = null;
  };

  for (const { tag, value } of fields) {
    if (tag === "25") {
      const candidate = value.replace(/\s/g, "").toUpperCase();
      if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(candidate)) iban = candidate;
    } else if (tag === "62F" || tag === "62M") {
      const m = /^([CD])(\d{6})([A-Z]{3})([\d,\.]+)$/.exec(value.trim());
      if (m) {
        const amount = parseAmountToCents(m[4]);
        if (amount !== null) closingBalanceCents = m[1] === "D" ? -amount : amount;
      }
    } else if (tag === "60F" || tag === "60M") {
      const m = /^[CD](\d{2})(\d{2})(\d{2})/.exec(value.trim());
      if (m) statementYearHint = 2000 + Number(m[1]);
    } else if (tag === "61") {
      pushPending();
      // :61:YYMMDD[MMDD]C/D<Betrag>N<Code>//<Ref>
      const m = /^(\d{6})(\d{4})?(R?[CD])([A-Z]?)([\d,\.]+)N?([A-Z0-9]{3,4})?/.exec(value.trim());
      if (!m) {
        warnings.push(`Buchungszeile konnte nicht gelesen werden: ${value.slice(0, 40)}`);
        continue;
      }
      const year = 2000 + Number(m[1].slice(0, 2));
      const valueDate = new Date(Date.UTC(year, Number(m[1].slice(2, 4)) - 1, Number(m[1].slice(4, 6))));
      let bookingDate = valueDate;
      if (m[2]) {
        const bookingYear = statementYearHint ?? year;
        bookingDate = new Date(
          Date.UTC(bookingYear, Number(m[2].slice(0, 2)) - 1, Number(m[2].slice(2, 4))),
        );
      }
      const raw = parseAmountToCents(m[5]);
      if (raw === null) {
        warnings.push(`Betrag konnte nicht gelesen werden: ${value.slice(0, 40)}`);
        continue;
      }
      const debit = m[3].includes("D");
      pending = {
        bookingDate,
        valueDate,
        amountCents: debit ? -Math.abs(raw) : Math.abs(raw),
        currency: "EUR",
        counterpartyName: null,
        counterpartyIban: null,
        purpose: null,
        endToEndId: null,
        bankTxCode: m[6] ?? null,
      };
    } else if (tag === "86" && pending) {
      // Strukturierte Subfelder ?20..?29 = Verwendungszweck, ?32/?33 = Name, ?31 = IBAN
      const subfields = new Map<string, string>();
      const regex = /\?(\d{2})([^?]*)/g;
      let sub: RegExpExecArray | null;
      while ((sub = regex.exec(value)) !== null) {
        subfields.set(sub[1], (subfields.get(sub[1]) ?? "") + sub[2]);
      }
      if (subfields.size > 0) {
        const purpose = Array.from({ length: 10 }, (_, i) => subfields.get(String(20 + i)) ?? "")
          .join("")
          .trim();
        const name = `${subfields.get("32") ?? ""}${subfields.get("33") ?? ""}`.trim();
        pending.purpose = purpose || null;
        pending.counterpartyName = name || null;
        pending.counterpartyIban = (subfields.get("31") ?? "").replace(/\s/g, "").toUpperCase() || null;
      } else {
        pending.purpose = value.trim() || null;
      }
    }
  }
  pushPending();

  if (transactions.length === 0) {
    throw new Error("Die MT940-Datei enthält keine Buchungen.");
  }

  const dates = transactions.map((t) => t.bookingDate.getTime());
  return {
    format: "mt940",
    iban,
    periodStart: new Date(Math.min(...dates)),
    periodEnd: new Date(Math.max(...dates)),
    closingBalanceCents,
    transactions,
    warnings,
  };
}

// --- Einstieg --------------------------------------------------------------

export async function parseStatement(fileName: string, buffer: Buffer): Promise<ParseResult> {
  const lower = fileName.toLowerCase();

  // PDF zuerst: die Magic Bytes stehen fest, bevor irgendetwas dekodiert wird.
  if (lower.endsWith(".pdf") || buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return parsePdf(buffer);
  }

  const text = decodeBuffer(buffer);

  if (lower.endsWith(".xml") || text.trimStart().startsWith("<?xml") || text.includes("<Document")) {
    return parseCamt053(text);
  }
  if (lower.endsWith(".sta") || lower.endsWith(".mt940") || lower.endsWith(".940") || /^:20:/m.test(text)) {
    return parseMt940(text);
  }
  return parseCsv(text);
}

// ---------------------------------------------------------------------------
// PDF-Kontoauszuege
// ---------------------------------------------------------------------------

/**
 * Liest einen PDF-Kontoauszug. PDFs sind fuer Menschen gesetzt, nicht fuer
 * Maschinen - deshalb arbeitet der Parser mit den Mustern, die deutsche
 * Banken (VR-Bank, Sparkasse und Verwandte) im Auszug drucken: Buchungszeilen
 * beginnen mit ein oder zwei Daten im Format TT.MM., der Betrag steht am
 * Zeilenende mit S/H oder Minus/Plus, Folgezeilen gehoeren zum
 * Verwendungszweck. Salden- und Uebertragszeilen werden uebersprungen.
 *
 * Wo das PDF vom Muster abweicht, sagen die Warnungen welche Zeilen nicht
 * gelesen wurden - lieber sichtbar auslassen als still falsch buchen.
 */
export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const { getDocumentProxy } = await import("unpdf");

  let text: string;
  try {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const seiten: string[] = [];

    for (let nr = 1; nr <= doc.numPages; nr += 1) {
      const seite = await doc.getPage(nr);
      const inhalt = await seite.getTextContent();

      // PDF kennt keine Zeilen, nur positionierte Textstuecke. Die Zeilen
      // entstehen hier neu: Stuecke mit (fast) gleicher Hoehe gehoeren
      // zusammen, innerhalb der Zeile ordnet die X-Position.
      type Stueck = { x: number; y: number; text: string };
      const stuecke: Stueck[] = [];
      for (const item of inhalt.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        stuecke.push({ x: item.transform[4], y: item.transform[5], text: item.str });
      }

      const zeilen: Stueck[][] = [];
      for (const stueck of stuecke.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const letzte = zeilen[zeilen.length - 1];
        if (letzte && Math.abs(letzte[0].y - stueck.y) < 2.5) letzte.push(stueck);
        else zeilen.push([stueck]);
      }

      seiten.push(
        zeilen
          .map((zeile) =>
            zeile
              .sort((a, b) => a.x - b.x)
              .map((st) => st.text)
              .join(" "),
          )
          .join("\n"),
      );
    }

    text = seiten.join("\n");
  } catch (error) {
    console.error("[pdf] Lesen fehlgeschlagen:", error);
    throw new Error(
      "Die PDF-Datei konnte nicht gelesen werden. Ist sie passwortgeschützt oder beschädigt?",
      { cause: error },
    );
  }

  if (!text.trim()) {
    throw new Error(
      "Die PDF enthält keinen lesbaren Text – vermutlich ein eingescanntes Bild. Bitte den Original-Auszug aus dem Online-Banking verwenden.",
    );
  }
  return parsePdfText(text);
}

const SALDO_MUSTER =
  /kontostand|zwischensaldo|anfangssaldo|endsaldo|alter saldo|neuer saldo|übertrag|uebertrag|summe umsätze|summe umsaetze|blatt \d|seite \d/i;

/** Aus dem PDF extrahierter Text -> Buchungen. Getrennt testbar. */
export function parsePdfText(text: string): ParseResult {
  const zeilen = text.split(/\r?\n/);
  const warnings: string[] = [];

  // IBAN des Kontos: die erste deutsche IBAN im Kopf.
  const ibanTreffer = text.replace(/\s+/g, " ").match(/\bDE\d{2}(?: ?\d{4}){4}(?: ?\d{1,2})?\b/);
  const iban = ibanTreffer ? ibanTreffer[0].replace(/\s+/g, "") : null;

  // Jahr: aus einem vollstaendigen Datum oder einer Jahreszahl im Kopf.
  const jahrTreffer =
    text.match(/\b\d{2}\.\d{2}\.(20\d{2})\b/) ?? text.match(/\b(20\d{2})\b/);
  const jahr = jahrTreffer ? Number(jahrTreffer[1]) : new Date().getUTCFullYear();

  const START =
    /^\s*(\d{2})\.(\d{2})\.(\d{4})?\s+(?:(\d{2})\.(\d{2})\.(\d{4})?\s+)?(.*)$/;
  const BETRAG = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*([SH+-])?\s*$/;

  type Roh = {
    tag: number; monat: number; jahr: number | null;
    wtag: number | null; wmonat: number | null;
    kopf: string; betragText: string; zeichen: string | null;
    zweck: string[];
  };

  const buchungen: Roh[] = [];
  let aktuelle: Roh | null = null;
  let uebersprungen = 0;

  for (const roh of zeilen) {
    const zeile = roh.replace(/\s+$/g, "");
    if (!zeile.trim()) continue;
    if (SALDO_MUSTER.test(zeile)) {
      aktuelle = null;
      continue;
    }

    const start = zeile.match(START);
    if (start) {
      const rest = start[7] ?? "";
      const betrag = rest.match(BETRAG);
      if (betrag) {
        aktuelle = {
          tag: Number(start[1]), monat: Number(start[2]),
          jahr: start[3] ? Number(start[3]) : null,
          wtag: start[4] ? Number(start[4]) : null,
          wmonat: start[5] ? Number(start[5]) : null,
          kopf: rest.slice(0, rest.length - betrag[0].length).trim(),
          betragText: betrag[1], zeichen: betrag[2] ?? null,
          zweck: [],
        };
        buchungen.push(aktuelle);
        continue;
      }
      // Datumszeile ohne Betrag: Betrag folgt evtl. auf einer der naechsten
      // Zeilen (mehrspaltige Layouts). Als offene Buchung vormerken.
      aktuelle = {
        tag: Number(start[1]), monat: Number(start[2]),
        jahr: start[3] ? Number(start[3]) : null,
        wtag: start[4] ? Number(start[4]) : null,
        wmonat: start[5] ? Number(start[5]) : null,
        kopf: rest.trim(), betragText: "", zeichen: null, zweck: [],
      };
      buchungen.push(aktuelle);
      continue;
    }

    if (aktuelle) {
      const betrag = zeile.match(BETRAG);
      if (!aktuelle.betragText && betrag && zeile.trim() === betrag[0].trim()) {
        aktuelle.betragText = betrag[1];
        aktuelle.zeichen = betrag[2] ?? null;
        continue;
      }
      aktuelle.zweck.push(zeile.trim());
      continue;
    }

    uebersprungen += 1;
  }

  const transactions: ParsedTransaction[] = [];
  let ohneZeichen = 0;

  for (const b of buchungen) {
    if (!b.betragText) {
      warnings.push(
        `Buchung vom ${String(b.tag).padStart(2, "0")}.${String(b.monat).padStart(2, "0")}. ohne erkennbaren Betrag übersprungen.`,
      );
      continue;
    }
    const cents = Math.round(Number(b.betragText.split(".").join("").replace(",", ".")) * 100);
    if (!Number.isFinite(cents)) continue;

    let vorzeichen = 1;
    if (b.zeichen === "S" || b.zeichen === "-") vorzeichen = -1;
    else if (b.zeichen === "H" || b.zeichen === "+") vorzeichen = 1;
    else ohneZeichen += 1;

    const buchungsJahr = b.jahr ?? jahr;
    const zweck = [b.kopf, ...b.zweck].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    transactions.push({
      bookingDate: new Date(Date.UTC(buchungsJahr, b.monat - 1, b.tag)),
      valueDate:
        b.wtag && b.wmonat ? new Date(Date.UTC(buchungsJahr, b.wmonat - 1, b.wtag)) : null,
      amountCents: vorzeichen * cents,
      currency: "EUR",
      counterpartyName: b.zweck[0]?.trim() || null,
      counterpartyIban: null,
      purpose: zweck || null,
      endToEndId: null,
      bankTxCode: null,
    });
  }

  if (transactions.length === 0) {
    throw new Error(
      "In der PDF wurden keine Buchungszeilen erkannt. Der Auszug weicht vom bekannten Aufbau ab – bitte eine Beispieldatei bereitstellen, dann wird der Leser darauf eingerichtet.",
    );
  }
  if (ohneZeichen > 0) {
    warnings.push(
      `${ohneZeichen} Buchung(en) ohne Soll/Haben-Kennzeichen wurden als Eingang gewertet – bitte prüfen.`,
    );
  }
  if (uebersprungen > 5) {
    warnings.push(`${uebersprungen} Textzeilen außerhalb von Buchungen wurden ignoriert.`);
  }

  const daten = transactions.map((t) => t.bookingDate.getTime());
  return {
    format: "pdf",
    iban,
    periodStart: new Date(Math.min(...daten)),
    periodEnd: new Date(Math.max(...daten)),
    // PDF-Auszuege drucken Salden als Text zwischen den Buchungen; ein
    // verlaesslicher Schlusssaldo laesst sich daraus nicht ableiten.
    closingBalanceCents: null,
    transactions,
    warnings,
  };
}

/**
 * Fachlicher Hash zur Deduplizierung: gleiche Buchung darf beim erneuten
 * Hochladen desselben Zeitraums nicht doppelt in der Buchhaltung landen.
 */
export function dedupeHash(iban: string, tx: ParsedTransaction): string {
  const parts = [
    iban.toUpperCase(),
    tx.bookingDate.toISOString().slice(0, 10),
    String(tx.amountCents),
    (tx.counterpartyName ?? "").toLowerCase().replace(/\s+/g, " ").trim(),
    (tx.counterpartyIban ?? "").toUpperCase(),
    (tx.purpose ?? "").toLowerCase().replace(/\s+/g, " ").trim(),
    tx.endToEndId ?? "",
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}
