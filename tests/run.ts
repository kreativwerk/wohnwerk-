/**
 * Prüfungen für die Teile, in denen sich Fehler am teuersten rächen:
 * Beträge, Datumsformate und das Einlesen der Bankdateien.
 *
 *   npm test
 */

import assert from "node:assert/strict";

import { parseAmountToCents, formatCents, centsToInput } from "../src/lib/money";
import { parseBankDate, monthsBetween, fromDateInput } from "../src/lib/dates";
import { parseCsv, parseMt940, parseCamt053, parseStatement, dedupeHash, decodeBuffer } from "../src/lib/bank";
import { contrastRatio, readTokens } from "../src/lib/contrast";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failed = 0;
let passed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ok   ${name}`);
    })
    .catch((error) => {
      failed += 1;
      console.error(`  FAIL ${name}`);
      console.error(`       ${(error as Error).message}`);
    });
}

async function main() {
  console.log("\nBeträge");

  await test("deutsche Schreibweise", () => {
    assert.equal(parseAmountToCents("350,00"), 35000);
    assert.equal(parseAmountToCents("1.234,56"), 123456);
    assert.equal(parseAmountToCents("-1.234,56"), -123456);
    assert.equal(parseAmountToCents("1.234,56 €"), 123456);
  });

  await test("englische Schreibweise", () => {
    assert.equal(parseAmountToCents("1,234.56"), 123456);
    assert.equal(parseAmountToCents("1234.56"), 123456);
    assert.equal(parseAmountToCents("350.00"), 35000);
  });

  await test("Vorzeichen hinten und in Klammern", () => {
    assert.equal(parseAmountToCents("350,00-"), -35000);
    assert.equal(parseAmountToCents("(350,00)"), -35000);
    assert.equal(parseAmountToCents("+350,00"), 35000);
  });

  await test("Tausenderpunkt ohne Nachkommastellen", () => {
    assert.equal(parseAmountToCents("1.234"), 123400);
    assert.equal(parseAmountToCents("1,234"), 123400);
    assert.equal(parseAmountToCents("12,34"), 1234);
  });

  await test("unbrauchbare Eingaben", () => {
    assert.equal(parseAmountToCents(""), null);
    assert.equal(parseAmountToCents("keine Zahl"), null);
    assert.equal(parseAmountToCents(null), null);
  });

  await test("Ausgabeformate", () => {
    assert.equal(formatCents(35000).replace(/ /g, " "), "350,00 €");
    assert.equal(centsToInput(35000), "350,00");
    assert.equal(formatCents(null), "–");
  });

  console.log("\nDatumsangaben");

  await test("Bankformate", () => {
    assert.equal(parseBankDate("15.03.2026")?.toISOString().slice(0, 10), "2026-03-15");
    assert.equal(parseBankDate("15.03.26")?.toISOString().slice(0, 10), "2026-03-15");
    assert.equal(parseBankDate("2026-03-15")?.toISOString().slice(0, 10), "2026-03-15");
    assert.equal(parseBankDate("15/03/2026")?.toISOString().slice(0, 10), "2026-03-15");
    assert.equal(parseBankDate("Saldo"), null);
  });

  await test("Formularfeld", () => {
    assert.equal(fromDateInput("2026-03-15")?.toISOString(), "2026-03-15T00:00:00.000Z");
    assert.equal(fromDateInput(""), null);
    assert.equal(fromDateInput("kaputt"), null);
  });

  await test("Monatsreihe über den Jahreswechsel", () => {
    const months = monthsBetween(new Date(Date.UTC(2025, 10, 1)), new Date(Date.UTC(2026, 1, 1)));
    assert.deepEqual(months, [
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  console.log("\nKontoauszüge");

  const sparkasse = [
    "Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;BIC;Betrag;Waehrung",
    'DE02120300000000202051;01.03.2026;01.03.2026;GUTSCHRIFT;"Miete Maerz WW-2026-0001";Tomasz Kowalski;PL61109010140000071219812874;WBKPPLPP;350,00;EUR',
    'DE02120300000000202051;03.03.2026;03.03.2026;LASTSCHRIFT;"Strom Abschlag";Stadtwerke Bremen;DE12500105170648489890;BREXDEFF;-189,50;EUR',
  ].join("\r\n");

  await test("CSV der Sparkasse", () => {
    const result = parseCsv(sparkasse);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].amountCents, 35000);
    assert.equal(result.transactions[0].counterpartyName, "Tomasz Kowalski");
    assert.equal(result.transactions[0].purpose, "Miete Maerz WW-2026-0001");
    assert.equal(result.transactions[1].amountCents, -18950);
    assert.equal(result.transactions[0].bookingDate.toISOString().slice(0, 10), "2026-03-01");
  });

  await test("CSV mit Komma als Trennzeichen und Soll/Haben-Spalte", () => {
    const csv = [
      "Datum,Betrag,Soll/Haben,Name,Verwendungszweck",
      "05.03.2026,350.00,H,Andrei Popescu,Miete",
      "06.03.2026,50.00,S,Reinigung Meier,Endreinigung",
    ].join("\n");
    const result = parseCsv(csv);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].amountCents, 35000);
    assert.equal(result.transactions[1].amountCents, -5000);
  });

  await test("CSV mit Metazeilen vor der Kopfzeile", () => {
    const csv = [
      "Umsatzanzeige",
      "Konto;DE02120300000000202051",
      "",
      "Buchungstag;Verwendungszweck;Betrag",
      "01.03.2026;Miete;350,00",
      "Anfangssaldo;;1000,00",
    ].join("\n");
    const result = parseCsv(csv);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].amountCents, 35000);
  });

  await test("CSV ohne erkennbare Kopfzeile schlägt verständlich fehl", () => {
    assert.throws(() => parseCsv("nur;irgendwelche;woerter\nohne;zahlen;hier"), /Kopfzeile/);
  });

  await test("Windows-1252 wird erkannt", () => {
    const latin1 = Buffer.from("Buchungstag;Verwendungszweck;Betrag\n01.03.2026;Grün;350,00", "latin1");
    const text = decodeBuffer(latin1);
    assert.ok(text.includes("Grün"), "Umlaut sollte korrekt dekodiert sein");
  });

  await test("MT940", () => {
    const mt940 = [
      ":20:STARTUMS",
      ":25:DE02120300000000202051",
      ":28C:00001/001",
      ":60F:C260301EUR1000,00",
      ":61:2603010301C350,00NTRFNONREF",
      ":86:166?00GUTSCHRIFT?20Miete Maerz WW-2026-?210001?32KOWALSKI TOMASZ",
      ":61:2603030303D189,50NDDTNONREF",
      ":86:005?00LASTSCHRIFT?20Strom Abschlag?32STADTWERKE BREMEN",
      ":62F:C260331EUR1160,50",
      "-",
    ].join("\n");

    const result = parseMt940(mt940);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.iban, "DE02120300000000202051");
    assert.equal(result.transactions[0].amountCents, 35000);
    assert.equal(result.transactions[0].counterpartyName, "KOWALSKI TOMASZ");
    assert.equal(result.transactions[0].purpose, "Miete Maerz WW-2026-0001");
    assert.equal(result.transactions[1].amountCents, -18950);
    assert.equal(result.closingBalanceCents, 116050);
  });

  const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><IBAN>DE02120300000000202051</IBAN></Id></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1160.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">350.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-01</Dt></BookgDt>
        <ValDt><Dt>2026-03-01</Dt></ValDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>WW-2026-0001</EndToEndId></Refs>
          <RltdPties>
            <Dbtr><Nm>Tomasz Kowalski</Nm></Dbtr>
            <DbtrAcct><Id><IBAN>PL61109010140000071219812874</IBAN></Id></DbtrAcct>
          </RltdPties>
          <RmtInf><Ustrd>Miete Maerz WW-2026-0001</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">189.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-03-03</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Cdtr><Nm>Stadtwerke Bremen</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>Strom Abschlag</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

  await test("CAMT.053", async () => {
    const result = await parseCamt053(camt);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.iban, "DE02120300000000202051");
    assert.equal(result.transactions[0].amountCents, 35000);
    assert.equal(result.transactions[0].counterpartyName, "Tomasz Kowalski");
    assert.equal(result.transactions[0].endToEndId, "WW-2026-0001");
    assert.equal(result.transactions[1].amountCents, -18950);
    assert.equal(result.closingBalanceCents, 116050);
  });

  await test("Format wird automatisch erkannt", async () => {
    assert.equal((await parseStatement("auszug.csv", Buffer.from(sparkasse))).format, "csv");
    assert.equal((await parseStatement("auszug.xml", Buffer.from(camt))).format, "camt053");
  });

  await test("Deduplizierung erkennt dieselbe Buchung wieder", async () => {
    const a = await parseStatement("auszug.csv", Buffer.from(sparkasse));
    const b = await parseStatement("auszug-2.csv", Buffer.from(sparkasse));
    assert.equal(
      dedupeHash("DE02120300000000202051", a.transactions[0]),
      dedupeHash("DE02120300000000202051", b.transactions[0]),
    );
    assert.notEqual(
      dedupeHash("DE02120300000000202051", a.transactions[0]),
      dedupeHash("DE02120300000000202051", a.transactions[1]),
    );
  });

  console.log("\nLesbarkeit der Farben");

  const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");
  const t = readTokens(css);
  const WEISS = "#ffffff";

  // Jedes Paar, das in der Oberflaeche wirklich vorkommt, mit der Schwelle,
  // die WCAG 2.1 AA dafuer verlangt: 4.5 fuer Text, 3.0 fuer Flaechen und
  // grosse Schrift.
  const PAARE: Array<[string, string, string, number]> = [
    ["Fließtext auf Weiß", t["ink-900"], WEISS, 4.5],
    ["Nebentext auf Weiß", t["ink-500"], WEISS, 4.5],
    ["Nebentext auf Seitenhintergrund", t["ink-500"], t["ink-100"], 4.5],
    ["Beschriftung auf Weiß", t["ink-700"], WEISS, 4.5],
    ["Verweis auf Weiß", t["brand-700"], WEISS, 4.5],
    ["Primärknopf", t["ink-900"], t["accent-500"], 4.5],
    ["Primärknopf beim Überfahren", t["ink-900"], t["accent-400"], 4.5],
    ["Markenknopf", WEISS, t["brand-700"], 4.5],
    ["Badge Marke", t["brand-800"], t["brand-100"], 4.5],
    ["Badge Akzent", t["accent-700"], t["accent-50"], 4.5],
    ["Seitenleiste: Eintrag", t["brand-200"], t["brand-950"], 4.5],
    ["Seitenleiste: Gruppentitel", t["brand-400"], t["brand-950"], 4.5],
    ["Seitenleiste: aktives Symbol", t["accent-400"], t["brand-950"], 3.0],
    ["Trennlinie auf Weiß", t["ink-200"], WEISS, 1.0],
    ["Kennzahl gut", t["emerald-600"], WEISS, 4.5],
    ["Kennzahl kritisch", t["rose-600"], WEISS, 4.5],
    ["Kennzahl offen", t["amber-600"], WEISS, 4.5],
    ["Kennzahl neutral", t["sky-600"], WEISS, 4.5],
    ["Hinweis grün", t["emerald-800"], t["emerald-50"], 4.5],
    ["Hinweis rot", t["rose-800"], t["rose-50"], 4.5],
    ["Hinweis gelb", t["amber-900"], t["amber-50"], 4.5],
    ["Hinweis blau", t["sky-800"], t["sky-50"], 4.5],
  ];

  for (const [name, vorne, hinten, schwelle] of PAARE) {
    await test(`${name} (mindestens ${schwelle}:1)`, () => {
      assert.ok(vorne, `Token fehlt für "${name}"`);
      assert.ok(hinten, `Token fehlt für "${name}"`);
      const wert = contrastRatio(vorne, hinten);
      assert.ok(
        wert >= schwelle,
        `${vorne} auf ${hinten} erreicht nur ${wert.toFixed(2)}:1`,
      );
    });
  }

  await test("Markenfarben stammen unverändert aus den Logo-Dateien", () => {
    assert.equal(t["accent-500"].toLowerCase(), "#ee5627", "Orange der W-Marke");
    assert.equal(t["brand-200"].toLowerCase(), "#c9dddc", "Mint des Schriftzugs");
  });

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
  if (failed > 0) process.exit(1);
}

main();
