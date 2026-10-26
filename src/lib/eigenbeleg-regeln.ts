/**
 * Regeln fuer Eigenbelege - reine Funktionen ohne Datenbank, damit sie
 * testbar sind.
 */

const ART: Record<string, string> = {
  sepa_inbound_transfer: "Gebühr für eingehende SEPA-Überweisung",
  sepa_outbound_transfer: "Gebühr für ausgehende SEPA-Überweisung",
  sepa_instant_inbound_transfer: "Gebühr für eingehende Echtzeitüberweisung",
  sepa_instant_outbound_transfer: "Gebühr für ausgehende Echtzeitüberweisung",
  additional_user: "Monatsgebühr für zusätzlichen Nutzer",
  card: "Kartengebühr",
};

export function istQontoGebuehr(tx: { direction: string; counterpartyName: string | null; bankTxCode: string | null; purpose: string | null }): boolean {
  if (tx.direction !== "DEBIT") return false;
  if (tx.bankTxCode === "qonto_fee") return true;
  return /^qonto$/i.test((tx.counterpartyName ?? "").trim()) && /abonnement|gebühr|gebuehr|fee/i.test(tx.purpose ?? "");
}

/** "sepa_inbound_transfer" -> "Gebühr für eingehende SEPA-Überweisung"; Abo-Kennungen als Kontoführung. */
export function gebuehrArt(purpose: string | null): string {
  const roh = (purpose ?? "").trim();
  if (ART[roh]) return ART[roh];
  if (/^solo_|^standard_|^essential_|^basic_|_20\d{2}/i.test(roh)) return `Kontoführungsgebühr (Abonnement ${roh})`;
  return roh || "Bankgebühr";
}

/** "Nürnbergerstr. 149" / "Nuernberger Str. 149" -> "nuernbergerstr149"; "Sankt" und "St." gleich. */
export function adressSchluessel(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\bsankt\b/g, "st")
    .replace(/stra(ss|ß)e/g, "str")
    .replace(/[^a-z0-9]/g, "");
}

export type ObjektKurz = { id: string; name: string; street: string | null; ownerName: string | null };

/**
 * Ist das eine Mietzahlung an einen Vermieter? Ausgang, "Miete" im
 * Verwendungszweck, und Adresse (oder Name) eines angemieteten Objekts im
 * Text. Gibt das Objekt zurueck oder null.
 */
export function objektZurMietzahlung(
  tx: { direction: string; purpose: string | null; counterpartyName: string | null },
  objekte: ObjektKurz[],
): ObjektKurz | null {
  if (tx.direction !== "DEBIT") return null;
  const zweck = tx.purpose ?? "";
  // Kaution an den Vermieter ist keine Ausgabe, sondern eine Forderung - kein Eigenbeleg.
  if (/kaution/i.test(zweck)) return null;
  // "Miete", "Mietzahlung" - oder der Empfaenger ist als Vermieter eines Objekts bekannt.
  const empfaenger = adressSchluessel(tx.counterpartyName);
  const bekannterVermieter = empfaenger.length >= 5 && objekte.some((o) => adressSchluessel(o.ownerName) === empfaenger);
  if (!/miet/i.test(zweck) && !bekannterVermieter) return null;
  const text = adressSchluessel(`${zweck} ${tx.counterpartyName ?? ""}`);
  const treffer = objekte.filter((o) => {
    const strasse = adressSchluessel(o.street);
    const name = adressSchluessel(o.name);
    return (strasse.length >= 6 && text.includes(strasse)) || (name.length >= 8 && text.includes(name));
  });
  return treffer.length === 1 ? treffer[0] : null;
}


/** "Rueckzahlung Kaution", "Kaution Rückzahlung", "Kaution zurück" - Ausgang an einen Mieter. */
export function istKautionsRueckzahlung(tx: { direction: string; purpose: string | null }): boolean {
  if (tx.direction !== "DEBIT") return false;
  const zweck = (tx.purpose ?? "").toLowerCase();
  if (!/kaution|kaucion|deposit/.test(zweck)) return false;
  return /r(ue|ü|u)ckzahl|zur(ue|ü|u)ck|erstatt|refund|kthim/.test(zweck);
}

/**
 * Kontoabschluss einer Hausbank (VR-Bank, Sparkasse): Kontofuehrungsentgelt,
 * Buchungsposten und Zinsen werden einmal im Monat abgebucht ("Abschluss
 * PN:905"), die Umsatzsteuer darauf als eigene Buchung ("siehe Anlage 1").
 * Eine Rechnung kommt nicht per Post - der Eigenbeleg ersetzt sie.
 */
export function istBankAbschluss(tx: { direction: string; purpose: string | null; counterpartyName: string | null }): boolean {
  if (tx.direction !== "DEBIT") return false;
  const text = `${tx.purpose ?? ""} ${tx.counterpartyName ?? ""}`;
  return (
    /\bPN:\s?905\b/i.test(text) ||
    /kontof(ü|ue)hrungs(entgelt|geb(ü|ue)hr)/i.test(text) ||
    /\babschluss vom \d{2}\.\d{2}\.\d{4} bis/i.test(text) ||
    /\bsollzins/i.test(text)
  );
}

/** Nur die Umsatzsteuer auf die Entgelte ("siehe Anlage 1")? */
export function istAbschlussSteuer(purpose: string | null): boolean {
  return /^\s*siehe anlage\s*\d*/i.test(purpose ?? "");
}

/** "Kontoführungsentgelte 05/2026" bzw. "Umsatzsteuer auf Kontoführungsentgelte 05/2026". */
export function bankAbschlussArt(purpose: string | null, buchungstag: Date): string {
  const monat = `${String(buchungstag.getUTCMonth() + 1).padStart(2, "0")}/${buchungstag.getUTCFullYear()}`;
  return istAbschlussSteuer(purpose)
    ? `Umsatzsteuer 19 % auf Kontoführungsentgelte ${monat}`
    : `Kontoführungsentgelte und Buchungsposten ${monat}`;
}

/**
 * Die Posten aus dem Buchungstext eines Abschlusses:
 * "* Überweisung Online 2 3101 0,60S" -> { text: "Überweisung Online (2)", betrag: 60 }.
 * Zinsen mit 0,00 fallen weg.
 */
export function bankAbschlussPosten(purpose: string | null): Array<{ text: string; betragCents: number }> {
  const posten: Array<{ text: string; betragCents: number }> = [];
  const muster = /\*\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß. -]*?)\s+(?:(\d{1,3})\s+)?\d{4}\s+(\d+),(\d{2})\s?[SH]/g;
  for (const t of (purpose ?? "").matchAll(muster)) {
    const cent = Number(t[3]) * 100 + Number(t[4]);
    if (cent <= 0) continue;
    posten.push({ text: t[2] ? `${t[1].trim()} (${t[2]}×)` : t[1].trim(), betragCents: cent });
  }
  const ust = /USt\.?\s*(\d{1,2})\s*%\s*(\d+),(\d{2})/i.exec(purpose ?? "");
  if (ust) posten.push({ text: `Umsatzsteuer ${ust[1]} % (gesondert abgebucht)`, betragCents: Number(ust[2]) * 100 + Number(ust[3]) });
  return posten;
}

/** Abrechnungszeitraum und Rechnungsnummer aus dem Abschlusstext. */
export function bankAbschlussKopf(purpose: string | null): { zeitraum: string | null; rechnungNr: string | null } {
  const text = purpose ?? "";
  const z = /abschluss vom (\d{2}\.\d{2}\.\d{4}) bis (\d{2}\.\d{2}\.\d{4})/i.exec(text);
  const r = /rechnung nr\.?\s*([0-9.]+[0-9])/i.exec(text);
  return { zeitraum: z ? `${z[1]} – ${z[2]}` : null, rechnungNr: r ? r[1] : null };
}
