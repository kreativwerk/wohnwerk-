/**
 * Reine Regeln fuer das Postfach - ohne Datenbank und ohne Netz, damit sie
 * sich testen lassen: Ist das eine Rechnung? Welche Betraege stehen drin?
 * Zu welcher Ausgabe passt der Beleg? Ist das eine Kuendigung?
 */

export type Anbieter = "ionos" | "strato" | "andere";

/** Die ueblichen Server der deutschen Webhoster - SSL auf 993 und 465. */
export const ANBIETER: Record<Exclude<Anbieter, "andere">, { name: string; imapHost: string; smtpHost: string }> = {
  ionos: { name: "IONOS", imapHost: "imap.ionos.de", smtpHost: "smtp.ionos.de" },
  strato: { name: "Strato", imapHost: "imap.strato.de", smtpHost: "smtp.strato.de" },
};

/** Welche Anhaenge die App ablegt. Alles andere (HTML, Skripte, Archive) bleibt draussen. */
const ERLAUBTE_TYPEN = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;

const ENDUNG_TYP: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
};

/**
 * Den Typ eines Anhangs bestimmen - manche Mailprogramme schicken PDFs als
 * application/octet-stream, dann entscheidet die Endung. null: nicht ablegen.
 */
export function anhangTyp(dateiname: string, mimeType: string | null | undefined): string | null {
  const typ = (mimeType ?? "").toLowerCase().split(";")[0].trim();
  if ((ERLAUBTE_TYPEN as readonly string[]).includes(typ)) return typ;
  const endung = dateiname.toLowerCase().split(".").pop() ?? "";
  return ENDUNG_TYP[endung] ?? null;
}

/**
 * Logos und Signaturbilder sind keine Anhaenge: eingebettete Bilder unter
 * 20 KB fallen weg. PDFs werden immer behalten.
 */
export function anhangBehalten(a: { dateiname: string; mimeType: string | null; groesse: number; eingebettet: boolean }): boolean {
  const typ = anhangTyp(a.dateiname, a.mimeType);
  if (!typ) return false;
  if (a.groesse <= 0 || a.groesse > 15 * 1024 * 1024) return false;
  if (typ.startsWith("image/") && (a.eingebettet || a.groesse < 20 * 1024)) return false;
  return true;
}

const RECHNUNG =
  /rechnung|invoice|quittung|beleg|kassenbon|kassenzettel|abschlag|bescheid|gutschrift|faktura|receipt|zahlungsaufforderung|bestellbest[aä]tigung|lastschriftank[uü]ndigung|vorabank[uü]ndigung|beitragsrechnung|jahresabrechnung|abrechnung/i;

/** Sieht nach Rechnung oder Beleg aus? Betreff, Mailtext und PDF-Text zusammen. */
export function istRechnung(...texte: Array<string | null | undefined>): boolean {
  return texte.some((t) => Boolean(t && RECHNUNG.test(t)));
}

const KUENDIGUNG =
  /k(?:ü|ue|u)ndig|termination|terminate|cancell?ation|notice to (?:leave|quit|vacate)|move[- ]?out|dor[eë]heq|largohem|anulim|felmond|kiköltöz|прекрат|напуска|reziliere|evacuare/i;

/** Will jemand kuendigen? In jeder Sprache der Bewohner. */
export function istKuendigung(...texte: Array<string | null | undefined>): boolean {
  return texte.some((t) => Boolean(t && KUENDIGUNG.test(t)));
}

/** Zeilen mit diesen Woertern tragen den Rechnungsbetrag - nicht Einzelposten oder Steuer. */
const SUMMEN_WORT =
  /gesamt|summe|zu zahlen|zahlbetrag|rechnungsbetrag|endbetrag|total|brutto|abschlag|betrag|amount due|amount paid|forderung|zahlung|lastschrift/i;
const NUR_STEUER = /mwst|ust\.?|umsatzsteuer|mehrwertsteuer|vat|netto|steuer/i;

/**
 * Alle Geldbetraege in einem Text, in Cent. Deutsch (1.234,56) und
 * englisch (1,234.56). Betraege aus Summenzeilen stehen vorn - sie sind
 * fast immer der Rechnungsbetrag.
 */
export function betraegeAusText(text: string): number[] {
  const summen: number[] = [];
  const mitWaehrungListe: number[] = [];
  const andere: number[] = [];
  const muster = /(?<![\d.,])(\d{1,3}(?:[.,\s]\d{3})+|\d+)([.,])(\d{2})(?![\d])/g;
  for (const zeile of text.split(/\r?\n/)) {
    const istSumme = SUMMEN_WORT.test(zeile) && !(NUR_STEUER.test(zeile) && !/brutto|gesamt|total|zu zahlen/i.test(zeile));
    for (const treffer of zeile.matchAll(muster)) {
      const ganz = treffer[1].replace(/[.\s,]/g, "");
      // "1.234,56" und "1,234.56": Tausenderzeichen ist das andere Zeichen als das Dezimalzeichen.
      if (/[.,]/.test(treffer[1]) && treffer[1].includes(treffer[2])) continue;
      const cent = Number.parseInt(ganz, 10) * 100 + Number.parseInt(treffer[3], 10);
      if (!Number.isFinite(cent) || cent <= 0 || cent > 100_000_000) continue;
      // Datumsangaben wie 12.05 (ohne Jahr) sind keine Betraege - aber 12.05 € schon.
      const danach = zeile.slice((treffer.index ?? 0) + treffer[0].length, (treffer.index ?? 0) + treffer[0].length + 6);
      const davor = zeile.slice(Math.max(0, (treffer.index ?? 0) - 6), treffer.index ?? 0);
      const mitWaehrung = /€|eur|\$/i.test(danach) || /€|eur|\$/i.test(davor);
      if (treffer[2] === "." && /^\.\d{2,4}\b/.test(danach) && !mitWaehrung) continue;
      (istSumme ? summen : mitWaehrung ? mitWaehrungListe : andere).push(cent);
    }
  }
  // Mehrere Summenzeilen: der groesste Betrag ist meist der Endbetrag (brutto).
  summen.sort((a, b) => b - a);
  return [...new Set([...summen, ...mitWaehrungListe, ...andere])];
}

/** Rechnungsdatum: das erste Datum nach "Rechnungsdatum"/"Datum", sonst das erste im Text. */
export function datumAusText(text: string): Date | null {
  const muster = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/g;
  const zeilen = text.split(/\r?\n/);
  const bevorzugt = zeilen.filter((z) => /rechnungsdatum|belegdatum|datum|date|vom/i.test(z));
  for (const gruppe of [bevorzugt, zeilen]) {
    for (const zeile of gruppe) {
      for (const t of zeile.matchAll(muster)) {
        const tag = Number(t[1]);
        const monat = Number(t[2]);
        let jahr = Number(t[3]);
        if (jahr < 100) jahr += 2000;
        if (tag < 1 || tag > 31 || monat < 1 || monat > 12 || jahr < 2000 || jahr > 2100) continue;
        return new Date(Date.UTC(jahr, monat - 1, tag));
      }
    }
  }
  return null;
}

/** Woerter des Absenders, an denen man ihn im Kontoauszug wiedererkennt ("ikea", "telefonica"). */
export function absenderWoerter(adresse: string, name?: string | null): string[] {
  const allgemein = new Set([
    "gmbh", "info", "noreply", "no-reply", "service", "rechnung", "rechnungen", "invoice", "kundenservice",
    "mail", "email", "online", "shop", "deutschland", "germany", "com", "net", "org", "kontakt", "support",
    "buchhaltung", "billing", "versand", "order", "orders", "team", "der", "die", "das", "und", "von",
  ]);
  const domain = adresse.toLowerCase().split("@")[1] ?? "";
  const teile = [
    ...domain.split(".").slice(0, -1),
    ...(name ?? "").toLowerCase().split(/[^a-z0-9äöüß]+/),
  ];
  return [...new Set(teile.map((w) => w.replace(/[^a-z0-9äöüß]/g, "")).filter((w) => w.length >= 4 && !allgemein.has(w)))];
}

export type BelegDaten = {
  betraege: number[];
  datum: Date;
  absenderWoerter: string[];
  /** Rechnungsnummer - steht sie im Buchungstext, ist der Treffer sicher. */
  rechnungsnummer?: string | null;
  /** Angekuendigter Einzugstag ("wird am 13.11.2026 eingezogen") - naeher dran als das Rechnungsdatum. */
  einzug?: Date | null;
  /** Nur ein Treffer ueber die Rechnungsnummer zaehlt (von Hand abgelegte Belege). */
  nurMitNummer?: boolean;
};

/** Ziffern und Buchstaben, ohne Leer- und Trennzeichen: "478753781/37" -> "47875378137". */
function nummerSchluessel(nr: string): string {
  return nr.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Rechnungsnummer aus Rechnungstext oder Buchungstext ("Rechnungsnummer 478753781/37", "Rg-Nr.:436451796/37"). */
export function rechnungsnummerAusText(text: string | null | undefined): string | null {
  const t = /(?:rechnungs-?\s?(?:nummer|nr\.?)|rg\.?-?\s?nr\.?|invoice\s?(?:no\.?|number))\s*[:#]?\s*([A-Z0-9][A-Z0-9/._-]{3,}[A-Z0-9])/i.exec(text ?? "");
  return t && /\d{3,}/.test(t[1]) ? t[1] : null;
}

/** "wird ... am 13.11.2026 eingezogen" / "Abbuchung am 13.11.2026". */
export function einzugAusText(text: string | null | undefined): Date | null {
  const flach = (text ?? "").replace(/\s+/g, " ");
  const t =
    /am (\d{1,2})\.(\d{1,2})\.(\d{4}) (?:eingezogen|abgebucht|belastet|abgebucht)/i.exec(flach) ??
    /(?:einzug|abbuchung|lastschrift|belastung) (?:erfolgt )?(?:am|zum) (\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(flach);
  if (!t) return null;
  const d = new Date(Date.UTC(Number(t[3]), Number(t[2]) - 1, Number(t[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export type AusgabeKandidat = {
  id: string;
  /** Betrag der Ausgabe, positiv in Cent. */
  betragCents: number;
  datum: Date;
  gegenpartei: string | null;
  zweck: string | null;
};

const TAG = 24 * 60 * 60 * 1000;

/**
 * Zu welcher Ausgabe ohne Beleg gehoert dieser Beleg? Nur bei eindeutigem
 * Treffer - lieber unzugeordnet lassen als falsch buchen.
 *
 * Gleicher Betrag auf den Cent, Buchung zwischen 20 Tagen vor und 75 Tagen
 * nach dem Belegdatum. Bei mehreren gewinnt, wessen Name zum Absender
 * passt; danach der vordere Betrag (Summenzeile), dann das naechste Datum.
 */
export function passendeAusgabe(beleg: BelegDaten, kandidaten: AusgabeKandidat[]): string | null {
  // Rechnungsnummer im Buchungstext: eindeutig. Eine andere Nummer dort: sicher nicht diese Rechnung.
  if (beleg.rechnungsnummer) {
    const eigene = nummerSchluessel(beleg.rechnungsnummer);
    const genau = kandidaten.filter((k) => nummerSchluessel(k.zweck ?? "").includes(eigene) && beleg.betraege.includes(k.betragCents));
    if (genau.length === 1) return genau[0].id;
    if (beleg.nurMitNummer) return null;
    kandidaten = kandidaten.filter((k) => {
      const fremd = rechnungsnummerAusText(k.zweck);
      return !fremd || nummerSchluessel(fremd) === eigene;
    });
  }
  const bezug = beleg.einzug ?? beleg.datum;
  const treffer = kandidaten
    .map((k) => {
      const rang = beleg.betraege.indexOf(k.betragCents);
      const abstand = (k.datum.getTime() - bezug.getTime()) / TAG;
      const text = `${k.gegenpartei ?? ""} ${k.zweck ?? ""}`.toLowerCase();
      const name = beleg.absenderWoerter.some((w) => text.includes(w));
      return { k, rang, abstand, name };
    })
    .filter((t) => t.rang >= 0 && t.abstand >= -20 && t.abstand <= 75);
  if (treffer.length === 0) return null;
  if (treffer.length === 1) {
    const [t] = treffer;
    // Ein Betrag aus dem Kleingedruckten (nicht vorn) reicht nur mit passendem Namen.
    return t.rang <= 2 || t.name ? t.k.id : null;
  }

  const mitName = treffer.filter((t) => t.name);
  const auswahl = mitName.length > 0 ? mitName : treffer;
  auswahl.sort((a, b) => a.rang - b.rang || Math.abs(a.abstand) - Math.abs(b.abstand));
  const [erster, zweiter] = auswahl;
  if (!zweiter) return erster.k.id;
  // Gleich gut: nicht raten.
  if (erster.rang === zweiter.rang && Math.abs(Math.abs(erster.abstand) - Math.abs(zweiter.abstand)) < 3) return null;
  if (mitName.length === 0 && erster.rang === zweiter.rang) return null;
  return erster.k.id;
}

/** "Re: " vor den Betreff - aber nicht doppelt. */
export function antwortBetreff(betreff: string): string {
  return /^\s*(re|aw|antw)\s*:/i.test(betreff) ? betreff : `Re: ${betreff}`;
}

/** Zitat der Originalnachricht unter der Antwort. */
export function antwortZitat(von: string, datum: string, text: string | null): string {
  const zeilen = (text ?? "").trim().split(/\r?\n/).slice(0, 60).map((z) => `> ${z}`);
  return `\n\n${datum}, ${von}:\n${zeilen.join("\n")}`;
}

/** Kurzer Auszug fuer die Liste. */
export function vorschau(text: string | null, laenge = 140): string {
  const flach = (text ?? "").replace(/\s+/g, " ").trim();
  return flach.length > laenge ? `${flach.slice(0, laenge - 1)}…` : flach;
}

/** E-Mail-Adressen aus einem Eingabefeld ("a@b.de, c@d.de; e@f.de"). */
export function adressenLesen(eingabe: string): string[] {
  return [...new Set(
    eingabe
      .split(/[,;\s]+/)
      .map((a) => a.trim().replace(/^<|>$/g, ""))
      .filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)),
  )];
}
