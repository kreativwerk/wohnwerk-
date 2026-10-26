import "server-only";

import { Prisma } from "@prisma/client";

import { autoMatch } from "./accounting";
import { audit } from "./audit";
import { dedupeHash } from "./bank";
import { prisma } from "./db";
import {
  belegDateiname,
  gleicheZahlung,
  istQontoKennung,
  qontoKennung,
  qontoZuBuchung,
  type QontoAnhang,
  type QontoTransaktion,
} from "./qonto-umsatz";
import { FOLDER, uploadFile } from "./storage";
import { eigenbelegeFuerGebuehren } from "./eigenbeleg";
import { postfachBelegeNachZuordnen } from "./beleg-zuordnung";

/**
 * Abgleich mit Qonto: holt die Umsaetze des Wohnwerk-Kontos ueber die
 * Qonto Business API, legt neue als Buchung an und ordnet Mieten und
 * Kautionen mit dem vorhandenen Abgleich zu. Ersetzt das Hochladen der
 * Kontoauszuege fuer das Qonto-Konto.
 *
 * Zugang: Qonto-Login und geheimer Schluessel (Qonto > Einstellungen >
 * Integrationen > API-Schluessel). Bevorzugt aus den Umgebungsvariablen
 * QONTO_LOGIN / QONTO_SECRET_KEY, sonst aus den Einstellungen der App.
 * Der Schluessel erlaubt nur Lesen - Qonto-Schluessel koennen kein Geld
 * bewegen.
 */

const API = (process.env.QONTO_API_URL ?? "https://thirdparty.qonto.com").replace(/\/+$/, "");

const KEY_LOGIN = "qontoLogin";
const KEY_SECRET = "qontoSecretKey";
const KEY_ZULETZT = "qontoLetzterAbgleich";
const KEY_ERGEBNIS = "qontoLetztesErgebnis";

export type QontoZugang = { login: string; secretKey: string; quelle: "umgebung" | "einstellungen" };

export type QontoErgebnis = {
  ok: boolean;
  zeitpunkt: string;
  neu: number;
  doppelt: number;
  zugeordnet: number;
  /** Aus Qonto-Anhaengen abgelegte Belege. */
  belege?: number;
  /** Hinweis, wenn einzelne Belege nicht abgelegt werden konnten - der Abgleich gilt trotzdem. */
  belegHinweis?: string;
  /** Belege, zu denen es in der App keine Buchung gibt (z. B. vor dem ersten Auszug). */
  belegeOhneBuchung?: number;
  /** Beim Nachholen: Es gibt noch weitere Belege, ein weiterer Lauf holt sie. */
  belegeWeitere?: boolean;
  konten: string[];
  fehler?: string;
};

export type QontoStatus = {
  eingerichtet: boolean;
  quelle: QontoZugang["quelle"] | null;
  login: string | null;
  zuletzt: QontoErgebnis | null;
};

async function settingWerte(keys: string[]): Promise<Map<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  return new Map(rows.map((r) => [r.key, r.value]));
}

async function settingSetzen(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function qontoZugang(): Promise<QontoZugang | null> {
  const envLogin = process.env.QONTO_LOGIN?.trim();
  const envSecret = process.env.QONTO_SECRET_KEY?.trim();
  if (envLogin && envSecret) return { login: envLogin, secretKey: envSecret, quelle: "umgebung" };

  const werte = await settingWerte([KEY_LOGIN, KEY_SECRET]);
  const login = werte.get(KEY_LOGIN)?.trim();
  const secretKey = werte.get(KEY_SECRET)?.trim();
  return login && secretKey ? { login, secretKey, quelle: "einstellungen" } : null;
}

export async function qontoZugangSpeichern(login: string, secretKey: string): Promise<void> {
  await settingSetzen(KEY_LOGIN, login.trim());
  await settingSetzen(KEY_SECRET, secretKey.trim());
}

export async function qontoZugangEntfernen(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: { in: [KEY_LOGIN, KEY_SECRET] } } });
}

/** Fuer die Oberflaeche - ohne den geheimen Schluessel. */
export async function qontoStatus(): Promise<QontoStatus> {
  const zugang = await qontoZugang();
  const werte = await settingWerte([KEY_ERGEBNIS]);
  let zuletzt: QontoErgebnis | null = null;
  try {
    const roh = werte.get(KEY_ERGEBNIS);
    zuletzt = roh ? (JSON.parse(roh) as QontoErgebnis) : null;
  } catch {
    zuletzt = null;
  }
  return { eingerichtet: Boolean(zugang), quelle: zugang?.quelle ?? null, login: zugang?.login ?? null, zuletzt };
}

class QontoFehler extends Error {}

async function qontoGet<T>(zugang: QontoZugang, pfad: string, parameter: URLSearchParams = new URLSearchParams()): Promise<T> {
  const url = `${API}${pfad}${parameter.size > 0 ? `?${parameter}` : ""}`;
  let antwort: Response;
  try {
    antwort = await fetch(url, {
      headers: { Authorization: `${zugang.login}:${zugang.secretKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new QontoFehler("Qonto ist gerade nicht erreichbar. Bitte später erneut versuchen.");
  }
  if (antwort.status === 401 || antwort.status === 403) {
    throw new QontoFehler("Qonto lehnt den Zugang ab. Bitte Login und geheimen Schlüssel in den Einstellungen prüfen.");
  }
  if (antwort.status === 429) throw new QontoFehler("Qonto meldet zu viele Anfragen. Bitte in ein paar Minuten erneut versuchen.");
  if (!antwort.ok) throw new QontoFehler(`Qonto antwortet mit Fehler ${antwort.status}.`);
  return (await antwort.json()) as T;
}

type QontoKonto = { id: string; iban: string; name?: string | null; status?: string | null };

async function qontoKonten(zugang: QontoZugang): Promise<QontoKonto[]> {
  const daten = await qontoGet<{ organization?: { bank_accounts?: QontoKonto[] } }>(zugang, "/v2/organization");
  return (daten.organization?.bank_accounts ?? []).filter((k) => k.iban);
}

async function qontoUmsaetze(
  zugang: QontoZugang,
  konto: QontoKonto,
  ab: Date,
  art: "gebucht" | "mitBeleg" = "gebucht",
): Promise<QontoTransaktion[]> {
  const alle: QontoTransaktion[] = [];
  for (let seite = 1; seite <= 50; seite += 1) {
    // "mitBeleg": alles, was seit `ab` geaendert wurde und Anhaenge hat -
    // so kommen auch Belege mit, die erst Tage nach der Buchung in Qonto
    // hochgeladen wurden.
    const parameter = new URLSearchParams(
      art === "gebucht"
        ? { bank_account_id: konto.id, settled_at_from: ab.toISOString(), sort_by: "settled_at:asc", per_page: "100", page: String(seite) }
        : { bank_account_id: konto.id, updated_at_from: ab.toISOString(), with_attachments: "true", per_page: "100", page: String(seite) },
    );
    parameter.append("status[]", "completed");
    if (art === "mitBeleg") parameter.append("includes[]", "attachments");
    const daten = await qontoGet<{ transactions?: QontoTransaktion[]; meta?: { next_page?: number | null } }>(
      zugang,
      "/v2/transactions",
      parameter,
    );
    alle.push(...(daten.transactions ?? []));
    if (!daten.meta?.next_page) break;
  }
  return alle;
}

const iban = (wert: string) => wert.replace(/\s+/g, "").toUpperCase();

/**
 * Ab wann holen? Nach einem Abgleich drei Tage vor dem letzten (spaet
 * gebuchte Umsaetze), beim ersten Mal zehn Tage vor der juengsten Buchung
 * des Kontos - die Ueberlappung mit den Auszuegen faengt die Doppel-
 * erkennung ab. Ohne Buchungen: 120 Tage.
 */
async function abWann(bankAccountId: string, zuletzt: string | undefined): Promise<Date> {
  const tag = 86_400_000;
  if (zuletzt) {
    const datum = new Date(zuletzt);
    if (!Number.isNaN(datum.getTime())) return new Date(datum.getTime() - 3 * tag);
  }
  const juengste = await prisma.bankTransaction.findFirst({
    where: { bankAccountId },
    orderBy: { bookingDate: "desc" },
    select: { bookingDate: true },
  });
  return new Date((juengste?.bookingDate.getTime() ?? Date.now() - 110 * tag) - 10 * tag);
}

/**
 * Sucht dieselbe Zahlung aus einem hochgeladenen Kontoauszug. Gefunden:
 * sie bekommt die Qonto-Kennung, damit spaetere Abgleiche sie direkt
 * erkennen, und es entsteht kein Doppel.
 */
async function auszugsDoppel(
  bankAccountId: string,
  buchung: { bookingDate: Date; amountCents: number; counterpartyName: string | null },
): Promise<string | null> {
  const tag = 86_400_000;
  const kandidaten = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId,
      amountCents: buchung.amountCents,
      bookingDate: { gte: new Date(buchung.bookingDate.getTime() - 2 * tag), lte: new Date(buchung.bookingDate.getTime() + 2 * tag) },
      OR: [{ endToEndId: null }, { NOT: { endToEndId: { startsWith: "qonto:" } } }],
    },
    orderBy: { bookingDate: "asc" },
    select: { id: true, bookingDate: true, amountCents: true, counterpartyName: true, endToEndId: true },
  });
  const treffer = kandidaten.find((k) => !istQontoKennung(k.endToEndId) && gleicheZahlung(k, buchung));
  return treffer?.id ?? null;
}

const MAX_BELEG_BYTES = 20 * 1024 * 1024;

async function anhangDetails(zugang: QontoZugang, anhang: QontoAnhang): Promise<QontoAnhang> {
  if (anhang.url) return anhang;
  const daten = await qontoGet<{ attachment?: QontoAnhang }>(zugang, `/v2/attachments/${encodeURIComponent(anhang.id)}`);
  return { ...anhang, ...(daten.attachment ?? {}) };
}

/**
 * Belege aus Qonto: Haengt an einem Umsatz ein Anhang (Rechnung, Quittung),
 * landet er in der Belegablage unter "Buchhaltung / Jahr / Monat Belege",
 * verknuepft mit der Buchung. Ausgaben mit Beleg gelten danach als gebucht.
 * Jeder Anhang nur einmal - die Qonto-Kennung steht am Beleg.
 */
async function belegeHolen(
  zugang: QontoZugang,
  qk: QontoKonto,
  kontoId: string,
  ab: Date,
  ergebnis: QontoErgebnis,
  optionen: { verknuepfen?: boolean; hoechstens?: number } = {},
): Promise<void> {
  const umsaetze = await qontoUmsaetze(zugang, qk, ab, "mitBeleg");
  let fehlgeschlagen = 0;
  let letzterFehler = "";
  let geholt = 0;

  for (const umsatz of umsaetze) {
    // Eingebettete Anhaenge plus alle Kennungen, die dort fehlen.
    const eingebettet = umsatz.attachments ?? [];
    const anhaenge: QontoAnhang[] = [
      ...eingebettet,
      ...(umsatz.attachment_ids ?? []).filter((id) => !eingebettet.some((a) => a.id === id)).map((id) => ({ id })),
    ];
    if (anhaenge.length === 0) continue;

    // Schon alle Anhaenge abgelegt? Dann gar nicht erst suchen.
    const offen = [];
    for (const roh of anhaenge) {
      if (roh.id && !(await prisma.document.findUnique({ where: { qontoAttachmentId: roh.id }, select: { id: true } }))) offen.push(roh);
    }
    if (offen.length === 0) continue;

    let buchung = await prisma.bankTransaction.findFirst({
      where: { bankAccountId: kontoId, endToEndId: qontoKennung(umsatz.id) },
    });
    // Beim Nachholen: aeltere Umsaetze kamen per Kontoauszug - dieselbe
    // Zahlung dort suchen und mit Qonto verknuepfen. Angelegt wird nichts.
    if (!buchung && optionen.verknuepfen) {
      const daten = qontoZuBuchung(umsatz);
      const treffer = daten ? await auszugsDoppel(kontoId, daten) : null;
      if (treffer && daten) {
        buchung = await prisma.bankTransaction.update({ where: { id: treffer }, data: { endToEndId: daten.endToEndId } });
      }
    }
    if (!buchung) {
      ergebnis.belegeOhneBuchung = (ergebnis.belegeOhneBuchung ?? 0) + offen.length;
      continue;
    }

    for (const roh of offen) {
      if (optionen.hoechstens !== undefined && geholt >= optionen.hoechstens) {
        ergebnis.belegeWeitere = true;
        break;
      }
      geholt += 1;

      try {
        const anhang = await anhangDetails(zugang, roh);
        if (!anhang.url) throw new Error("Qonto liefert keinen Download-Link.");
        // Der Link ist vorsigniert - ohne Qonto-Zugangsdaten abrufen.
        const antwort = await fetch(anhang.url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
        if (!antwort.ok) throw new Error(`Download fehlgeschlagen (${antwort.status}).`);
        const daten = Buffer.from(await antwort.arrayBuffer());
        if (daten.byteLength === 0 || daten.byteLength > MAX_BELEG_BYTES) throw new Error("Datei leer oder größer als 20 MB.");

        const mimeType = anhang.file_content_type || antwort.headers.get("content-type") || "application/octet-stream";
        const dateiname = belegDateiname(buchung.bookingDate, buchung.counterpartyName, anhang.file_name);
        const abgelegt = await uploadFile({
          fileName: dateiname,
          mimeType,
          data: daten,
          folderSegments: FOLDER.receipts(buchung.bookingDate.getUTCFullYear(), buchung.bookingDate.getUTCMonth() + 1),
        });

        try {
          await prisma.document.create({
            data: {
              kind: "RECEIPT",
              title: buchung.counterpartyName ?? anhang.file_name ?? "Beleg aus Qonto",
              fileName: anhang.file_name || dateiname,
              mimeType,
              sizeBytes: daten.byteLength,
              driveFileId: abgelegt.fileId,
              driveUrl: abgelegt.url,
              driveFolder: abgelegt.folder,
              localPath: abgelegt.localPath,
              documentDate: buchung.bookingDate,
              amountCents: Math.abs(buchung.amountCents),
              supplier: buchung.counterpartyName,
              category: buchung.category,
              notes: "Automatisch aus Qonto übernommen",
              bankTransactionId: buchung.id,
              propertyId: buchung.propertyId,
              qontoAttachmentId: anhang.id,
            },
          });
        } catch (fehler) {
          if (fehler instanceof Prisma.PrismaClientKnownRequestError && fehler.code === "P2002") continue;
          throw fehler;
        }
        ergebnis.belege = (ergebnis.belege ?? 0) + 1;

        // Wie beim Hochladen von Hand: eine Ausgabe mit Beleg ist gebucht.
        if (buchung.direction === "DEBIT" && buchung.reviewStatus === "OPEN") {
          await prisma.bankTransaction.update({ where: { id: buchung.id }, data: { reviewStatus: "BOOKED" } });
          buchung.reviewStatus = "BOOKED";
        }
      } catch (fehler) {
        fehlgeschlagen += 1;
        letzterFehler = fehler instanceof Error ? fehler.message : String(fehler);
        console.error("Qonto-Beleg", roh.id, fehler);
      }
    }
  }

  if (fehlgeschlagen > 0) {
    ergebnis.belegHinweis = `${fehlgeschlagen} Beleg(e) konnten nicht abgelegt werden: ${letzterFehler}`;
  }
}

/**
 * Alle Belege seit `ab` nachholen - auch zu Buchungen, die per Kontoauszug
 * kamen. Je Lauf hoechstens `hoechstens` Dateien, damit die Anfrage nicht
 * zu lange dauert; ein weiterer Lauf macht weiter, schon Abgelegtes wird
 * uebersprungen.
 */
export async function qontoBelegeNachholen(ausgeloestVon: string, ab: Date, hoechstens = 40): Promise<QontoErgebnis> {
  const ergebnis: QontoErgebnis = { ok: false, zeitpunkt: new Date().toISOString(), neu: 0, doppelt: 0, zugeordnet: 0, konten: [], belege: 0 };
  try {
    const zugang = await qontoZugang();
    if (!zugang) throw new QontoFehler("Qonto ist noch nicht eingerichtet.");
    const [qontoKontenListe, appKonten] = await Promise.all([qontoKonten(zugang), prisma.bankAccount.findMany({ where: { active: true } })]);
    for (const qk of qontoKontenListe) {
      const konto = appKonten.find((k) => iban(k.iban) === iban(qk.iban));
      if (!konto) continue;
      ergebnis.konten.push(konto.name);
      await belegeHolen(zugang, qk, konto.id, ab, ergebnis, { verknuepfen: true, hoechstens });
      if (ergebnis.belegeWeitere) break;
    }
    ergebnis.ok = true;
  } catch (fehler) {
    ergebnis.fehler = fehler instanceof QontoFehler ? fehler.message : "Das Nachholen der Belege ist fehlgeschlagen.";
    if (!(fehler instanceof QontoFehler)) console.error("Qonto-Belege", fehler);
  }
  await audit(ausgeloestVon, "qonto-belege", "Document", null, ergebnis.ok ? `${ergebnis.belege ?? 0} Belege nachgeholt` : ergebnis.fehler ?? "Fehler");
  return ergebnis;
}

/**
 * Der eigentliche Abgleich. Wirft nie: Fehler stehen im Ergebnis und
 * werden fuer die Anzeige gespeichert.
 */
export async function qontoAbgleich(ausgeloestVon: string): Promise<QontoErgebnis> {
  const zeitpunkt = new Date().toISOString();
  const ergebnis: QontoErgebnis = { ok: false, zeitpunkt, neu: 0, doppelt: 0, zugeordnet: 0, konten: [] };

  try {
    const zugang = await qontoZugang();
    if (!zugang) throw new QontoFehler("Qonto ist noch nicht eingerichtet.");

    const [qontoKontenListe, appKonten, werte] = await Promise.all([
      qontoKonten(zugang),
      prisma.bankAccount.findMany({ where: { active: true } }),
      settingWerte([KEY_ZULETZT]),
    ]);

    const paare = qontoKontenListe
      .map((qk) => ({ qk, konto: appKonten.find((k) => iban(k.iban) === iban(qk.iban)) }))
      .filter((p): p is { qk: QontoKonto; konto: (typeof appKonten)[number] } => Boolean(p.konto));

    if (paare.length === 0) {
      throw new QontoFehler(
        `Kein Qonto-Konto passt zu einem Bankkonto der App. Qonto liefert: ${qontoKontenListe.map((k) => iban(k.iban)).join(", ") || "keine Konten"}.`,
      );
    }

    for (const { qk, konto } of paare) {
      ergebnis.konten.push(konto.name);
      const ab = await abWann(konto.id, werte.get(KEY_ZULETZT));
      const umsaetze = await qontoUmsaetze(zugang, qk, ab);

      const objekte = await prisma.property.findMany({ where: { bankAccountId: konto.id }, select: { id: true } });
      const objektId = objekte.length === 1 ? objekte[0].id : null;

      for (const umsatz of umsaetze) {
        const buchung = qontoZuBuchung(umsatz);
        if (!buchung) continue;

        const schonDa = await prisma.bankTransaction.findFirst({
          where: { bankAccountId: konto.id, endToEndId: buchung.endToEndId },
          select: { id: true },
        });
        if (schonDa) {
          ergebnis.doppelt += 1;
          continue;
        }

        const ausAuszug = await auszugsDoppel(konto.id, buchung);
        if (ausAuszug) {
          await prisma.bankTransaction.update({ where: { id: ausAuszug }, data: { endToEndId: buchung.endToEndId } });
          ergebnis.doppelt += 1;
          continue;
        }

        try {
          await prisma.bankTransaction.create({
            data: {
              bankAccountId: konto.id,
              bookingDate: buchung.bookingDate,
              valueDate: buchung.valueDate,
              amountCents: buchung.amountCents,
              currency: buchung.currency,
              direction: buchung.amountCents >= 0 ? "CREDIT" : "DEBIT",
              counterpartyName: buchung.counterpartyName,
              counterpartyIban: buchung.counterpartyIban,
              purpose: buchung.purpose,
              endToEndId: buchung.endToEndId,
              bankTxCode: buchung.bankTxCode,
              propertyId: objektId,
              dedupeHash: dedupeHash(konto.iban, buchung),
            },
          });
          ergebnis.neu += 1;
        } catch (fehler) {
          // Zwei Abgleiche gleichzeitig: der andere war schneller.
          if (fehler instanceof Prisma.PrismaClientKnownRequestError && fehler.code === "P2002") {
            ergebnis.doppelt += 1;
            continue;
          }
          throw fehler;
        }
      }

      await belegeHolen(zugang, qk, konto.id, ab, ergebnis);
    }

    // Qonto-Gebuehren ohne Rechnung: Eigenbeleg dran, als gebucht abhaken.
    ergebnis.belege = (ergebnis.belege ?? 0) + (await eigenbelegeFuerGebuehren());

    // Rechnungen aus dem Postfach, die vor der Abbuchung kamen: jetzt zuordnen.
    try {
      await postfachBelegeNachZuordnen();
    } catch (fehler) {
      console.error("Postfach-Belege nachzuordnen", fehler);
    }

    // Ueber alle Konten: auch offene Eingaenge aus hochgeladenen Auszuegen
    // bekommen so taeglich eine Chance.
    const zuordnung = await autoMatch();
    ergebnis.zugeordnet += zuordnung.matched;

    ergebnis.ok = true;
    await settingSetzen(KEY_ZULETZT, zeitpunkt);
  } catch (fehler) {
    ergebnis.fehler = fehler instanceof QontoFehler ? fehler.message : "Der Qonto-Abgleich ist fehlgeschlagen.";
    if (!(fehler instanceof QontoFehler)) console.error("Qonto-Abgleich", fehler);
  }

  await settingSetzen(KEY_ERGEBNIS, JSON.stringify(ergebnis));
  await audit(
    ausgeloestVon,
    "qonto-sync",
    "BankTransaction",
    null,
    ergebnis.ok
      ? `${ergebnis.neu} neu, ${ergebnis.doppelt} vorhanden, ${ergebnis.zugeordnet} zugeordnet, ${ergebnis.belege ?? 0} Belege`
      : ergebnis.fehler ?? "Fehler",
  );
  return ergebnis;
}

/** Laeuft der letzte erfolgreiche Abgleich laenger als `minuten` zurueck? */
export async function qontoVeraltet(minuten: number): Promise<boolean> {
  const werte = await settingWerte([KEY_ZULETZT]);
  const zuletzt = werte.get(KEY_ZULETZT);
  if (!zuletzt) return true;
  return Date.now() - new Date(zuletzt).getTime() > minuten * 60_000;
}
