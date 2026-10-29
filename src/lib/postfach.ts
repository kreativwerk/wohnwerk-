import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { audit } from "./audit";
import { ausgabeFuerBeleg, belegAnBuchung, postfachBelegeNachZuordnen } from "./beleg-zuordnung";
import { prisma } from "./db";
import {
  ANBIETER,
  absenderWoerter,
  anhangBehalten,
  anhangTyp,
  betraegeAusText,
  datumAusText,
  einzugAusText,
  rechnungsnummerAusText,
  istKuendigung,
  istRechnung,
  type Anbieter,
} from "./postfach-regeln";
import { FOLDER, uploadFile, type StoredFile } from "./storage";

/**
 * Das Postfach der Hausverwaltung (IONOS, Strato oder ein anderer Anbieter)
 * per IMAP und SMTP:
 *
 *   - Abholen: neue Mails landen in der App (Postfach), Anhaenge in der Ablage.
 *   - Rechnungen: PDF-Anhaenge werden als Beleg abgelegt und - wenn Betrag und
 *     Zeitraum eindeutig passen - gleich der Ausgabe zugeordnet. Kommt die
 *     Abbuchung erst spaeter, ordnet der naechste Abgleich nach.
 *   - Kuendigungen von Bewohnern (Absender = hinterlegte E-Mail des Mieters)
 *     kommen zum Mieter unter Dokumente.
 *   - Senden: Antworten und neue Mails gehen ueber den SMTP-Server des
 *     Postfachs und liegen danach auch im Ordner "Gesendet".
 *
 * Gelesen wird nur - die App markiert und loescht im Postfach nichts.
 */

const KEY = {
  anbieter: "postfachAnbieter",
  imapHost: "postfachImapHost",
  imapPort: "postfachImapPort",
  smtpHost: "postfachSmtpHost",
  smtpPort: "postfachSmtpPort",
  benutzer: "postfachBenutzer",
  passwort: "postfachPasswort",
  absenderName: "postfachAbsenderName",
  ergebnis: "postfachLetztesErgebnis",
  test: "postfachLetzterTest",
} as const;

export type PostfachZugang = {
  anbieter: Anbieter;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  benutzer: string;
  passwort: string;
  absenderName: string;
  quelle: "umgebung" | "einstellungen";
};

export type PostfachErgebnis = {
  ok: boolean;
  zeitpunkt: string;
  neu: number;
  belege: number;
  belegeZugeordnet: number;
  kuendigungen: number;
  nachZugeordnet: number;
  weitere?: boolean;
  fehler?: string;
};

export type PostfachStatus = {
  eingerichtet: boolean;
  quelle: PostfachZugang["quelle"] | null;
  benutzer: string | null;
  anbieter: Anbieter | null;
  imapHost: string | null;
  smtpHost: string | null;
  absenderName: string | null;
  zuletzt: PostfachErgebnis | null;
};

// --- Passwort verschluesselt ablegen ----------------------------------------

function schluessel(): Buffer {
  return createHash("sha256").update(`postfach:${process.env.AUTH_SECRET ?? "wohnwerk"}`).digest();
}

function verschluesseln(klartext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", schluessel(), iv);
  const inhalt = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), inhalt]).toString("base64")}`;
}

function entschluesseln(wert: string): string | null {
  if (!wert.startsWith("v1:")) return wert;
  try {
    const roh = Buffer.from(wert.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", schluessel(), roh.subarray(0, 12));
    decipher.setAuthTag(roh.subarray(12, 28));
    return Buffer.concat([decipher.update(roh.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    // AUTH_SECRET geaendert - das Passwort muss neu eingegeben werden.
    return null;
  }
}

// --- Zugang -------------------------------------------------------------------

async function werte(keys: string[]): Promise<Map<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  return new Map(rows.map((r) => [r.key, r.value]));
}

async function setzen(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

function zahl(wert: string | undefined, vorgabe: number): number {
  const n = Number.parseInt(wert ?? "", 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : vorgabe;
}

export async function postfachZugang(): Promise<PostfachZugang | null> {
  const env = process.env;
  if (env.POSTFACH_BENUTZER?.trim() && env.POSTFACH_PASSWORT && env.POSTFACH_IMAP_HOST?.trim()) {
    return {
      anbieter: "andere",
      imapHost: env.POSTFACH_IMAP_HOST.trim(),
      imapPort: zahl(env.POSTFACH_IMAP_PORT, 993),
      smtpHost: env.POSTFACH_SMTP_HOST?.trim() || env.POSTFACH_IMAP_HOST.trim().replace(/^imap\./, "smtp."),
      smtpPort: zahl(env.POSTFACH_SMTP_PORT, 465),
      benutzer: env.POSTFACH_BENUTZER.trim(),
      passwort: env.POSTFACH_PASSWORT,
      absenderName: env.POSTFACH_ABSENDER?.trim() || "Wohnwerk",
      quelle: "umgebung",
    };
  }

  const w = await werte(Object.values(KEY));
  const benutzer = w.get(KEY.benutzer)?.trim();
  const passwortRoh = w.get(KEY.passwort);
  const imapHost = w.get(KEY.imapHost)?.trim();
  if (!benutzer || !passwortRoh || !imapHost) return null;
  const passwort = entschluesseln(passwortRoh);
  if (passwort === null) return null;
  const anbieter = (["ionos", "strato", "andere"] as const).find((a) => a === w.get(KEY.anbieter)) ?? "andere";
  return {
    anbieter,
    imapHost,
    imapPort: zahl(w.get(KEY.imapPort), 993),
    smtpHost: w.get(KEY.smtpHost)?.trim() || imapHost.replace(/^imap\./, "smtp."),
    smtpPort: zahl(w.get(KEY.smtpPort), 465),
    benutzer,
    passwort,
    absenderName: w.get(KEY.absenderName)?.trim() || "Wohnwerk",
    quelle: "einstellungen",
  };
}

/** Aus dem Formular: Anbieter waehlen genuegt, Server stehen dann fest. */
export function zugangAusEingabe(e: {
  anbieter: string;
  benutzer: string;
  passwort: string;
  absenderName?: string;
  imapHost?: string;
  imapPort?: string;
  smtpHost?: string;
  smtpPort?: string;
}): PostfachZugang {
  const anbieter: Anbieter = e.anbieter === "ionos" || e.anbieter === "strato" ? e.anbieter : "andere";
  const vorgabe = anbieter === "andere" ? null : ANBIETER[anbieter];
  const imapHost = (vorgabe?.imapHost ?? e.imapHost ?? "").trim();
  return {
    anbieter,
    imapHost,
    imapPort: vorgabe ? 993 : zahl(e.imapPort, 993),
    smtpHost: (vorgabe?.smtpHost ?? (e.smtpHost?.trim() || imapHost.replace(/^imap\./, "smtp."))).trim(),
    smtpPort: vorgabe ? 465 : zahl(e.smtpPort, 465),
    benutzer: e.benutzer.trim(),
    passwort: e.passwort,
    absenderName: e.absenderName?.trim() || "Wohnwerk",
    quelle: "einstellungen",
  };
}

export async function postfachZugangSpeichern(z: PostfachZugang): Promise<void> {
  await setzen(KEY.anbieter, z.anbieter);
  await setzen(KEY.imapHost, z.imapHost);
  await setzen(KEY.imapPort, String(z.imapPort));
  await setzen(KEY.smtpHost, z.smtpHost);
  await setzen(KEY.smtpPort, String(z.smtpPort));
  await setzen(KEY.benutzer, z.benutzer);
  await setzen(KEY.passwort, verschluesseln(z.passwort));
  await setzen(KEY.absenderName, z.absenderName);
}

/** Gespeichertes Passwort, wenn im Formular keines eingegeben wurde. */
export async function gespeichertesPasswort(): Promise<string | null> {
  const w = await werte([KEY.passwort]);
  const roh = w.get(KEY.passwort);
  return roh ? entschluesseln(roh) : null;
}

export async function postfachZugangEntfernen(): Promise<void> {
  await prisma.setting.deleteMany({
    where: { key: { in: [KEY.passwort, KEY.benutzer, KEY.imapHost, KEY.smtpHost, KEY.imapPort, KEY.smtpPort, KEY.anbieter] } },
  });
}

export async function postfachStatus(): Promise<PostfachStatus> {
  const zugang = await postfachZugang();
  const w = await werte([KEY.ergebnis]);
  let zuletzt: PostfachErgebnis | null = null;
  try {
    const roh = w.get(KEY.ergebnis);
    zuletzt = roh ? (JSON.parse(roh) as PostfachErgebnis) : null;
  } catch {
    zuletzt = null;
  }
  return {
    eingerichtet: Boolean(zugang),
    quelle: zugang?.quelle ?? null,
    benutzer: zugang?.benutzer ?? null,
    anbieter: zugang?.anbieter ?? null,
    imapHost: zugang?.imapHost ?? null,
    smtpHost: zugang?.smtpHost ?? null,
    absenderName: zugang?.absenderName ?? null,
    zuletzt,
  };
}

export type PostfachTest = { zeitpunkt: string; ok: boolean; fehler: string | null; benutzer: string; anbieter: string; imapHost: string };

/** Ergebnis des letzten Verbindungstests - ohne Passwort, fuer die Anzeige und die Fehlersuche. */
export async function postfachTestMerken(t: Omit<PostfachTest, "zeitpunkt">): Promise<void> {
  await setzen(KEY.test, JSON.stringify({ ...t, zeitpunkt: new Date().toISOString() }));
}

export async function postfachLetzterTest(): Promise<PostfachTest | null> {
  const w = await werte([KEY.test]);
  try {
    const roh = w.get(KEY.test);
    return roh ? (JSON.parse(roh) as PostfachTest) : null;
  } catch {
    return null;
  }
}

/** Laenger als `minuten` nicht abgeholt (oder nie)? */
export async function postfachVeraltet(minuten: number): Promise<boolean> {
  const status = await postfachStatus();
  if (!status.zuletzt) return true;
  return Date.now() - new Date(status.zuletzt.zeitpunkt).getTime() > minuten * 60 * 1000;
}

// --- Verbindungen ---------------------------------------------------------------

class PostfachFehler extends Error {}

function fehlerText(error: unknown, art: "IMAP" | "SMTP"): string {
  const e = error as { message?: string; authenticationFailed?: boolean; responseCode?: number; code?: string };
  const text = `${e?.message ?? ""} ${e?.code ?? ""}`;
  if (e?.authenticationFailed || e?.responseCode === 535 || /auth|login|credentials|535/i.test(text)) {
    return "Das Postfach lehnt die Anmeldung ab. Bitte E-Mail-Adresse und Passwort prüfen.";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) return `Der ${art}-Server wurde nicht gefunden. Bitte den Anbieter bzw. Server prüfen.`;
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ECONNRESET/i.test(text)) return `Der ${art}-Server ist nicht erreichbar. Bitte später erneut versuchen.`;
  return `${art}: ${e?.message ?? "Unbekannter Fehler"}`.slice(0, 300);
}

async function imapVerbinden(z: PostfachZugang) {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: z.imapHost,
    port: z.imapPort,
    secure: z.imapPort === 993,
    auth: { user: z.benutzer, pass: z.passwort },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    // Lokale Testserver ohne TLS; echte Anbieter laufen auf 993 mit TLS.
    ...(z.imapPort === 993 ? {} : { tls: { rejectUnauthorized: false }, doSTARTTLS: false }),
  });
  client.on("error", () => {
    // Abbrueche melden die einzelnen Aufrufe selbst.
  });
  try {
    await client.connect();
  } catch (error) {
    throw new PostfachFehler(fehlerText(error, "IMAP"));
  }
  return client;
}

async function smtpTransport(z: PostfachZugang) {
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host: z.smtpHost,
    port: z.smtpPort,
    secure: z.smtpPort === 465,
    auth: { user: z.benutzer, pass: z.passwort },
    connectionTimeout: 20_000,
    ...(z.smtpPort === 465 || z.smtpPort === 587 ? {} : { ignoreTLS: true }),
  });
}

/** Zugang ausprobieren: IMAP anmelden und SMTP pruefen. */
export async function postfachTesten(z: PostfachZugang): Promise<{ ok: boolean; fehler?: string }> {
  try {
    const client = await imapVerbinden(z);
    await client.logout().catch(() => undefined);
  } catch (error) {
    return { ok: false, fehler: error instanceof PostfachFehler ? error.message : fehlerText(error, "IMAP") };
  }
  try {
    const transport = await smtpTransport(z);
    await transport.verify();
    transport.close();
  } catch (error) {
    return { ok: false, fehler: `Empfangen klappt, Senden nicht: ${fehlerText(error, "SMTP")}` };
  }
  return { ok: true };
}

// --- PDF-Text -------------------------------------------------------------------

/** Text eines PDFs zeilenweise - fuer Betrag und Datum der Rechnung. */
export async function pdfText(daten: Buffer): Promise<string> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(daten));
    const seiten: string[] = [];
    for (let nr = 1; nr <= Math.min(doc.numPages, 6); nr += 1) {
      const seite = await doc.getPage(nr);
      const inhalt = await seite.getTextContent();
      type Stueck = { x: number; y: number; text: string };
      const stuecke: Stueck[] = [];
      for (const item of inhalt.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        stuecke.push({ x: item.transform[4], y: item.transform[5], text: item.str });
      }
      const zeilen: Stueck[][] = [];
      for (const st of stuecke.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const letzte = zeilen[zeilen.length - 1];
        if (letzte && Math.abs(letzte[0].y - st.y) < 2.5) letzte.push(st);
        else zeilen.push([st]);
      }
      seiten.push(zeilen.map((z) => z.sort((a, b) => a.x - b.x).map((s) => s.text).join(" ")).join("\n"));
    }
    return seiten.join("\n");
  } catch {
    // Gescannte oder geschuetzte PDFs: kein Text, Beleg wird trotzdem abgelegt.
    return "";
  }
}

function geldText(cent: number): string {
  return `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, "0")}`;
}

/** Notiz am Beleg - die Nachzuordnung liest Betraege, Rechnungsnummer und Einzug daraus wieder. */
export function belegNotiz(quelle: string, betraege: number[], rechnungsnummer: string | null, einzug: Date | null): string {
  return [
    quelle,
    rechnungsnummer ? `Rechnungsnr. ${rechnungsnummer}.` : null,
    einzug ? `Einzug ${einzug.toISOString().slice(0, 10).split("-").reverse().join(".")}.` : null,
    betraege.length > 1 ? `Beträge: ${betraege.slice(0, 8).map(geldText).join(" / ")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// --- Abholen ----------------------------------------------------------------------

type Adresse = { address?: string; name?: string };
type AdressFeld = { value: Adresse[] } | Array<{ value: Adresse[] }> | undefined;

function adressen(feld: AdressFeld): Adresse[] {
  if (!feld) return [];
  return (Array.isArray(feld) ? feld : [feld]).flatMap((f) => f.value ?? []);
}

function adressListe(feld: AdressFeld): string {
  return adressen(feld)
    .map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : a.address ?? ""))
    .filter(Boolean)
    .join(", ");
}

type AnhangRoh = { dateiname: string; mimeType: string; daten: Buffer };

/**
 * Holt neue Mails aus dem Posteingang. Beim ersten Mal die letzten 30 Tage,
 * danach ab der juengsten bekannten Mail. Hoechstens `hoechstens` Mails pro
 * Lauf - der Rest kommt beim naechsten.
 */
export async function postfachAbrufen(
  ausgeloestVon: string,
  optionen: { hoechstens?: number; tage?: number } = {},
): Promise<PostfachErgebnis> {
  const hoechstens = optionen.hoechstens ?? 40;
  const ergebnis: PostfachErgebnis = {
    ok: false,
    zeitpunkt: new Date().toISOString(),
    neu: 0,
    belege: 0,
    belegeZugeordnet: 0,
    kuendigungen: 0,
    nachZugeordnet: 0,
  };

  const zugang = await postfachZugang();
  if (!zugang) {
    ergebnis.fehler = "Kein Postfach eingerichtet.";
    return ergebnis;
  }

  let client: Awaited<ReturnType<typeof imapVerbinden>> | null = null;
  try {
    client = await imapVerbinden(zugang);
    const lock = await client.getMailboxLock("INBOX");
    try {
      const juengste = await prisma.emailNachricht.findFirst({
        where: { richtung: "EIN" },
        orderBy: { datum: "desc" },
        select: { datum: true },
      });
      const seit = juengste
        ? new Date(juengste.datum.getTime() - 3 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() - (optionen.tage ?? 30) * 24 * 60 * 60 * 1000);

      const uids = (await client.search({ since: seit }, { uid: true })) || [];
      const kopfdaten: Array<{ uid: number; messageId: string }> = [];
      if (uids.length > 0) {
        const validitaet = String(client.mailbox && typeof client.mailbox === "object" ? client.mailbox.uidValidity : "0");
        for await (const m of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
          kopfdaten.push({ uid: m.uid, messageId: m.envelope?.messageId || `<uid-${validitaet}-${m.uid}@postfach>` });
        }
      }
      const bekannt = new Set(
        (
          await prisma.emailNachricht.findMany({
            where: { messageId: { in: kopfdaten.map((k) => k.messageId) } },
            select: { messageId: true },
          })
        ).map((n) => n.messageId),
      );
      const neu = kopfdaten.filter((k) => !bekannt.has(k.messageId)).sort((a, b) => a.uid - b.uid);
      ergebnis.weitere = neu.length > hoechstens;

      for (const kopf of neu.slice(0, hoechstens)) {
        const nachricht = await client.fetchOne(String(kopf.uid), { source: true }, { uid: true });
        if (!nachricht || !nachricht.source) continue;
        await rohnachrichtVerarbeiten(nachricht.source, kopf.messageId, kopf.uid, ergebnis);
        ergebnis.neu += 1;
      }
    } finally {
      lock.release();
    }
    ergebnis.ok = true;
  } catch (error) {
    ergebnis.fehler = error instanceof PostfachFehler ? error.message : fehlerText(error, "IMAP");
    console.error("[postfach] Abruf fehlgeschlagen:", error);
  } finally {
    await client?.logout().catch(() => undefined);
  }

  try {
    ergebnis.nachZugeordnet = await postfachBelegeNachZuordnen();
  } catch (error) {
    console.error("[postfach] Nachzuordnen fehlgeschlagen:", error);
  }

  await setzen(KEY.ergebnis, JSON.stringify(ergebnis));
  await audit(
    ausgeloestVon,
    "sync",
    "Postfach",
    null,
    ergebnis.ok
      ? `${ergebnis.neu} neue E-Mail(s), ${ergebnis.belege} Beleg(e), ${ergebnis.belegeZugeordnet + ergebnis.nachZugeordnet} zugeordnet`
      : `Fehler: ${ergebnis.fehler}`,
  );
  return ergebnis;
}

/**
 * Eine Mail im Rohformat (wie vom IMAP-Server) lesen, speichern und
 * einordnen. Eigene Funktion, damit sich die Verarbeitung auch ohne
 * Mailserver pruefen laesst.
 */
export async function rohnachrichtVerarbeiten(
  quelle: Buffer,
  messageId: string | null,
  uid: number | null,
  ergebnis: PostfachErgebnis,
): Promise<void> {
  const { simpleParser } = await import("mailparser");
  const mail = await simpleParser(quelle);
  const kennung = messageId ?? mail.messageId ?? `<${createHash("sha256").update(quelle).digest("hex").slice(0, 32)}@postfach>`;
  if (await prisma.emailNachricht.findUnique({ where: { messageId: kennung }, select: { id: true } })) return;

  const von = adressen(mail.from as AdressFeld)[0] ?? {};
  const anhaenge: AnhangRoh[] = [];
  for (const a of mail.attachments ?? []) {
    const dateiname = a.filename || `anhang.${(a.contentType ?? "").split("/")[1] ?? "bin"}`;
    if (
      !anhangBehalten({
        dateiname,
        mimeType: a.contentType,
        groesse: a.size ?? a.content?.length ?? 0,
        eingebettet: a.contentDisposition === "inline" || Boolean(a.related) || Boolean(a.cid && a.contentDisposition !== "attachment"),
      })
    ) {
      continue;
    }
    anhaenge.push({ dateiname, mimeType: anhangTyp(dateiname, a.contentType) ?? "application/octet-stream", daten: a.content });
  }

  await nachrichtSpeichern(
    {
      messageId: kennung,
      uid,
      vonAdresse: (von.address ?? "").toLowerCase(),
      vonName: von.name || null,
      an: adressListe(mail.to as AdressFeld),
      cc: adressListe(mail.cc as AdressFeld) || null,
      betreff: (mail.subject ?? "").trim() || "(ohne Betreff)",
      datum: mail.date ?? new Date(),
      text: (mail.text ?? "").slice(0, 200_000) || null,
    },
    anhaenge,
    ergebnis,
  );
}

type NachrichtKopf = {
  messageId: string;
  uid: number | null;
  vonAdresse: string;
  vonName: string | null;
  an: string;
  cc: string | null;
  betreff: string;
  datum: Date;
  text: string | null;
};

async function ablegen(anhang: AnhangRoh, datum: Date, ordner: string[], name?: string): Promise<StoredFile> {
  return uploadFile({
    fileName: name ?? `${datum.toISOString().slice(0, 10)} ${anhang.dateiname}`,
    mimeType: anhang.mimeType,
    data: anhang.daten,
    folderSegments: ordner,
  });
}

/** Eine Mail speichern und gleich einordnen: Mieter? Kuendigung? Rechnung? */
async function nachrichtSpeichern(kopf: NachrichtKopf, anhaenge: AnhangRoh[], ergebnis: PostfachErgebnis): Promise<void> {
  const mieter = kopf.vonAdresse
    ? await prisma.tenant.findFirst({
        where: { email: { equals: kopf.vonAdresse, mode: "insensitive" } },
        select: { id: true, firstName: true, lastName: true },
      })
    : null;

  const nachricht = await prisma.emailNachricht.create({
    data: { ...kopf, richtung: "EIN", tenantId: mieter?.id ?? null },
  });

  const jahr = kopf.datum.getUTCFullYear();
  const monat = kopf.datum.getUTCMonth() + 1;
  const gespeichert: Array<{ id: string; roh: AnhangRoh; datei: StoredFile }> = [];
  for (const roh of anhaenge) {
    try {
      const datei = await ablegen(roh, kopf.datum, ["Postfach", String(jahr), String(monat).padStart(2, "0")]);
      const zeile = await prisma.emailAnhang.create({
        data: {
          nachrichtId: nachricht.id,
          dateiname: roh.dateiname,
          mimeType: roh.mimeType,
          sizeBytes: roh.daten.byteLength,
          driveFileId: datei.fileId,
          driveUrl: datei.url,
          driveFolder: datei.folder,
          localPath: datei.localPath,
        },
      });
      gespeichert.push({ id: zeile.id, roh, datei });
    } catch (error) {
      console.error("[postfach] Anhang konnte nicht abgelegt werden:", error);
    }
  }

  const notizen: string[] = [];

  // Kuendigung eines Bewohners: zum Mieter unter Dokumente.
  if (mieter && istKuendigung(kopf.betreff, kopf.text)) {
    const name = `${mieter.firstName} ${mieter.lastName}`.trim();
    if (gespeichert.length > 0) {
      for (const g of gespeichert) {
        await prisma.document.create({
          data: {
            kind: "OTHER",
            title: `Kündigung ${name}`,
            fileName: g.roh.dateiname,
            mimeType: g.roh.mimeType,
            sizeBytes: g.roh.daten.byteLength,
            driveFileId: g.datei.fileId,
            driveUrl: g.datei.url,
            driveFolder: g.datei.folder,
            localPath: g.datei.localPath,
            documentDate: kopf.datum,
            category: "Kündigung",
            notes: `Per E-Mail von ${kopf.vonAdresse}: ${kopf.betreff}`,
            tenantId: mieter.id,
            emailAnhangId: g.id,
          },
        });
      }
    } else {
      // Kuendigung im Mailtext: die Mail selbst als PDF ablegen.
      const pdf = await mailAlsPdf(kopf);
      const datei = await uploadFile({
        fileName: `${kopf.datum.toISOString().slice(0, 10)} Kündigung per E-Mail.pdf`,
        mimeType: "application/pdf",
        data: pdf,
        folderSegments: [...FOLDER.tenants(), `${mieter.lastName} ${mieter.firstName}`],
      });
      await prisma.document.create({
        data: {
          kind: "OTHER",
          title: `Kündigung ${name} (E-Mail)`,
          fileName: "Kuendigung-per-E-Mail.pdf",
          mimeType: "application/pdf",
          sizeBytes: pdf.byteLength,
          driveFileId: datei.fileId,
          driveUrl: datei.url,
          driveFolder: datei.folder,
          localPath: datei.localPath,
          documentDate: kopf.datum,
          category: "Kündigung",
          notes: `Per E-Mail von ${kopf.vonAdresse}: ${kopf.betreff}`,
          tenantId: mieter.id,
        },
      });
    }
    ergebnis.kuendigungen += 1;
    notizen.push(`Kündigung von ${name} – beim Mieter unter Dokumente abgelegt.`);
  } else if (mieter) {
    notizen.push(`Von Mieter ${mieter.firstName} ${mieter.lastName}.`);
  }

  // Rechnungen: jeder PDF- oder Bild-Anhang wird Beleg, wenn Mail oder PDF danach aussehen.
  if (!mieter && gespeichert.length > 0) {
    for (const g of gespeichert) {
      if (!(g.roh.mimeType === "application/pdf" || g.roh.mimeType.startsWith("image/"))) continue;
      const text = g.roh.mimeType === "application/pdf" ? await pdfText(g.roh.daten) : "";
      if (!istRechnung(kopf.betreff, g.roh.dateiname, text, kopf.text?.slice(0, 4000))) continue;

      const betraege = betraegeAusText(`${text}\n${kopf.betreff}`);
      const belegDatum = datumAusText(text) ?? kopf.datum;
      const rechnungsnummer = rechnungsnummerAusText(text) ?? rechnungsnummerAusText(kopf.betreff);
      const einzug = einzugAusText(text);
      const lieferant = kopf.vonName || kopf.vonAdresse.split("@")[1] || kopf.vonAdresse;
      const dokument = await prisma.document.create({
        data: {
          kind: "RECEIPT",
          title: `${lieferant} – ${kopf.betreff}`.slice(0, 200),
          fileName: g.roh.dateiname,
          mimeType: g.roh.mimeType,
          sizeBytes: g.roh.daten.byteLength,
          driveFileId: g.datei.fileId,
          driveUrl: g.datei.url,
          driveFolder: g.datei.folder,
          localPath: g.datei.localPath,
          documentDate: belegDatum,
          amountCents: betraege[0] ?? null,
          supplier: lieferant.slice(0, 120),
          notes: belegNotiz(`Aus dem Postfach (${kopf.vonAdresse}).`, betraege, rechnungsnummer, einzug),
          emailAnhangId: g.id,
        },
      });
      ergebnis.belege += 1;

      const treffer = await ausgabeFuerBeleg({
        betraege,
        datum: belegDatum,
        absenderWoerter: absenderWoerter(kopf.vonAdresse, kopf.vonName),
        rechnungsnummer,
        einzug,
      });
      if (treffer) {
        // Der Beleg traegt den Betrag der Buchung - das ist der, der gezahlt wurde.
        await prisma.document.update({ where: { id: dokument.id }, data: { amountCents: Math.abs(treffer.amountCents) } });
        await belegAnBuchung(dokument.id, treffer.id);
        ergebnis.belegeZugeordnet += 1;
        notizen.push(
          `Beleg „${g.roh.dateiname}“ abgelegt und der Buchung vom ${treffer.bookingDate.toISOString().slice(0, 10).split("-").reverse().join(".")} (${geldText(Math.abs(treffer.amountCents))} €, ${treffer.counterpartyName ?? "–"}) zugeordnet.`,
        );
      } else {
        notizen.push(
          `Beleg „${g.roh.dateiname}“ abgelegt${betraege[0] ? ` (${geldText(betraege[0])} €)` : ""} – passende Abbuchung noch nicht gefunden, wird beim nächsten Abgleich erneut gesucht.`,
        );
      }
    }
  }

  if (notizen.length > 0) {
    await prisma.emailNachricht.update({ where: { id: nachricht.id }, data: { ergebnis: notizen.join("\n") } });
  }
}

// --- Mail als PDF ------------------------------------------------------------------

/** Zeichen, die die Standardschrift nicht kennt, werden ersetzt statt abzustuerzen. */
function druckbar(text: string): string {
  return [...text]
    .map((c) => {
      const code = c.codePointAt(0) ?? 0;
      if (c === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return c;
      if ("€–—„“”‚‘’…•".includes(c)) return c;
      return "?";
    })
    .join("");
}

export async function mailAlsPdf(kopf: Pick<NachrichtKopf, "vonAdresse" | "vonName" | "an" | "betreff" | "datum" | "text">): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const schrift = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const breite = 595;
  const hoehe = 842;
  const rand = 50;
  const groesse = 10;
  let seite = pdf.addPage([breite, hoehe]);
  let y = hoehe - rand;

  const zeile = (text: string, font = schrift, size = groesse) => {
    const woerter = druckbar(text).split(/(\s+)/);
    let aktuell = "";
    const ausgeben = (t: string) => {
      if (y < rand + size) {
        seite = pdf.addPage([breite, hoehe]);
        y = hoehe - rand;
      }
      seite.drawText(t, { x: rand, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size * 1.4;
    };
    for (const w of woerter) {
      const probe = aktuell + w;
      if (font.widthOfTextAtSize(probe, size) > breite - 2 * rand && aktuell.trim()) {
        ausgeben(aktuell.trimEnd());
        aktuell = w.trimStart();
      } else {
        aktuell = probe;
      }
    }
    ausgeben(aktuell.trimEnd());
  };

  zeile(kopf.betreff, fett, 13);
  y -= 4;
  zeile(`Von: ${kopf.vonName ? `${kopf.vonName} <${kopf.vonAdresse}>` : kopf.vonAdresse}`);
  zeile(`An: ${kopf.an}`);
  zeile(`Datum: ${kopf.datum.toISOString().slice(0, 16).replace("T", " ")} UTC`);
  y -= 8;
  for (const absatz of (kopf.text ?? "").split(/\r?\n/)) zeile(absatz || " ");

  return Buffer.from(await pdf.save());
}

// --- Senden --------------------------------------------------------------------------

export type SendeAnhang = { dateiname: string; mimeType: string; daten: Buffer };

/**
 * Sendet ueber den SMTP-Server des Postfachs, legt eine Kopie in "Gesendet"
 * und speichert die Mail in der App.
 */
export async function postfachSenden(params: {
  an: string[];
  cc?: string[];
  betreff: string;
  text: string;
  antwortAufId?: string | null;
  tenantId?: string | null;
  anhaenge?: SendeAnhang[];
  ausgeloestVon: string;
}): Promise<{ ok: boolean; fehler?: string; nachrichtId?: string }> {
  const zugang = await postfachZugang();
  if (!zugang) return { ok: false, fehler: "Kein Postfach eingerichtet." };
  if (params.an.length === 0) return { ok: false, fehler: "Bitte mindestens eine Empfänger-Adresse angeben." };

  const original = params.antwortAufId
    ? await prisma.emailNachricht.findUnique({ where: { id: params.antwortAufId }, select: { messageId: true, tenantId: true } })
    : null;

  const MailComposer = (await import("nodemailer/lib/mail-composer")).default;
  const von = { name: zugang.absenderName, address: zugang.benutzer };
  const nachrichtId = `<${randomBytes(12).toString("hex")}@${zugang.benutzer.split("@")[1] ?? "wohnwerk"}>`;
  const roh = await new MailComposer({
    from: von,
    to: params.an,
    cc: params.cc && params.cc.length > 0 ? params.cc : undefined,
    subject: params.betreff,
    text: params.text,
    messageId: nachrichtId,
    date: new Date(),
    ...(original && !original.messageId.includes("@postfach>") ? { inReplyTo: original.messageId, references: [original.messageId] } : {}),
    attachments: (params.anhaenge ?? []).map((a) => ({ filename: a.dateiname, content: a.daten, contentType: a.mimeType })),
  })
    .compile()
    .build();

  try {
    const transport = await smtpTransport(zugang);
    await transport.sendMail({ envelope: { from: zugang.benutzer, to: [...params.an, ...(params.cc ?? [])] }, raw: roh });
    transport.close();
  } catch (error) {
    return { ok: false, fehler: fehlerText(error, "SMTP") };
  }

  // Kopie in "Gesendet" - IONOS und Strato legen per SMTP Gesendetes nicht selbst ab.
  try {
    const client = await imapVerbinden(zugang);
    try {
      const ordner = await client.list();
      const gesendet = ordner.find((o) => o.specialUse === "\\Sent") ?? ordner.find((o) => /^(sent|gesendet|gesendete)/i.test(o.name));
      if (gesendet) await client.append(gesendet.path, roh, ["\\Seen"]);
    } finally {
      await client.logout().catch(() => undefined);
    }
  } catch (error) {
    console.error("[postfach] Kopie in Gesendet fehlgeschlagen:", error);
  }

  const gespeichert = await prisma.emailNachricht.create({
    data: {
      messageId: nachrichtId,
      richtung: "AUS",
      ordner: "Gesendet",
      vonAdresse: zugang.benutzer,
      vonName: zugang.absenderName,
      an: params.an.join(", "),
      cc: params.cc?.join(", ") || null,
      betreff: params.betreff,
      datum: new Date(),
      text: params.text,
      gelesen: true,
      tenantId: params.tenantId ?? original?.tenantId ?? null,
      antwortAufId: params.antwortAufId ?? null,
    },
  });
  if (params.antwortAufId) {
    await prisma.emailNachricht.update({ where: { id: params.antwortAufId }, data: { erledigt: true } }).catch(() => undefined);
  }
  await audit(params.ausgeloestVon, "send", "EmailNachricht", gespeichert.id, `${params.betreff} → ${params.an.join(", ")}`);
  return { ok: true, nachrichtId: gespeichert.id };
}

// --- Von Hand: Anhang als Beleg oder zum Mieter ----------------------------------------

async function anhangDaten(anhangId: string) {
  return prisma.emailAnhang.findUnique({
    where: { id: anhangId },
    include: { dokument: { select: { id: true } }, nachricht: true },
  });
}

/**
 * Anhang als Beleg ablegen. Mit Buchung: gleich dran. Ohne: die App sucht
 * selbst nach Betrag und Zeitraum - findet sie nichts, bleibt der Beleg
 * unzugeordnet in der Belegablage.
 */
export async function anhangAlsBeleg(
  anhangId: string,
  bankTransactionId: string | null,
): Promise<{ ok: boolean; meldung: string }> {
  const anhang = await anhangDaten(anhangId);
  if (!anhang) return { ok: false, meldung: "Anhang nicht gefunden." };
  if (anhang.dokument) return { ok: false, meldung: "Dieser Anhang ist schon abgelegt." };

  const n = anhang.nachricht;
  let text = "";
  if (anhang.mimeType === "application/pdf" && anhang.driveFileId) {
    const { readStoredFile } = await import("./storage");
    const datei = await readStoredFile(anhang.driveFileId).catch(() => null);
    if (datei) text = await pdfText(datei.data);
  }
  const betraege = betraegeAusText(`${text}\n${n.betreff}`);
  const belegDatum = datumAusText(text) ?? n.datum;
  const rechnungsnummer = rechnungsnummerAusText(text) ?? rechnungsnummerAusText(n.betreff);
  const einzug = einzugAusText(text);
  const lieferant = n.vonName || n.vonAdresse.split("@")[1] || n.vonAdresse;

  const dokument = await prisma.document.create({
    data: {
      kind: "RECEIPT",
      title: `${lieferant} – ${n.betreff}`.slice(0, 200),
      fileName: anhang.dateiname,
      mimeType: anhang.mimeType,
      sizeBytes: anhang.sizeBytes,
      driveFileId: anhang.driveFileId,
      driveUrl: anhang.driveUrl,
      driveFolder: anhang.driveFolder,
      localPath: anhang.localPath,
      documentDate: belegDatum,
      amountCents: betraege[0] ?? null,
      supplier: lieferant.slice(0, 120),
      notes: belegNotiz(`Aus dem Postfach (${n.vonAdresse}).`, betraege, rechnungsnummer, einzug),
      emailAnhangId: anhang.id,
      tenantId: n.tenantId,
    },
  });

  const ziel = bankTransactionId
    ? await prisma.bankTransaction.findUnique({ where: { id: bankTransactionId }, select: { id: true, amountCents: true, bookingDate: true } })
    : await ausgabeFuerBeleg({ betraege, datum: belegDatum, absenderWoerter: absenderWoerter(n.vonAdresse, n.vonName), rechnungsnummer, einzug });
  if (ziel) {
    await prisma.document.update({ where: { id: dokument.id }, data: { amountCents: Math.abs(ziel.amountCents) } });
    await belegAnBuchung(dokument.id, ziel.id);
    return {
      ok: true,
      meldung: `Beleg abgelegt und der Buchung vom ${ziel.bookingDate.toISOString().slice(0, 10).split("-").reverse().join(".")} (${geldText(Math.abs(ziel.amountCents))} €) zugeordnet.`,
    };
  }
  return { ok: true, meldung: "Beleg abgelegt – eine passende Buchung gibt es noch nicht, die App sucht beim nächsten Abgleich weiter." };
}

/** Anhang beim Mieter unter Dokumente ablegen (Kuendigung, Ausweis ...). */
export async function anhangZumMieter(
  anhangId: string,
  tenantId: string,
  art: string,
): Promise<{ ok: boolean; meldung: string }> {
  const anhang = await anhangDaten(anhangId);
  if (!anhang) return { ok: false, meldung: "Anhang nicht gefunden." };
  if (anhang.dokument) return { ok: false, meldung: "Dieser Anhang ist schon abgelegt." };
  const mieter = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, firstName: true, lastName: true } });
  if (!mieter) return { ok: false, meldung: "Mieter nicht gefunden." };

  await prisma.document.create({
    data: {
      kind: art === "Mietvertrag (unterschrieben)" ? "CONTRACT" : "OTHER",
      title: art === "Sonstiges" ? anhang.dateiname : `${art} ${mieter.firstName} ${mieter.lastName}`.trim(),
      fileName: anhang.dateiname,
      mimeType: anhang.mimeType,
      sizeBytes: anhang.sizeBytes,
      driveFileId: anhang.driveFileId,
      driveUrl: anhang.driveUrl,
      driveFolder: anhang.driveFolder,
      localPath: anhang.localPath,
      documentDate: anhang.nachricht.datum,
      category: art,
      notes: `Per E-Mail von ${anhang.nachricht.vonAdresse}: ${anhang.nachricht.betreff}`,
      tenantId: mieter.id,
      emailAnhangId: anhang.id,
    },
  });
  if (!anhang.nachricht.tenantId) {
    await prisma.emailNachricht.update({ where: { id: anhang.nachrichtId }, data: { tenantId: mieter.id } });
  }
  return { ok: true, meldung: `Beim Mieter ${mieter.firstName} ${mieter.lastName} als „${art}“ abgelegt.` };
}
