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
