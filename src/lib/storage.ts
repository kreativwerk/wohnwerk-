import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { prisma } from "@/lib/db";

/**
 * Ablage fuer Mietvertraege, Belege und Kontoauszuege.
 *
 * Reihenfolge: Supabase Storage (wenn konfiguriert), sonst Google Drive
 * (wenn konfiguriert), sonst die Datenbank selbst -- die ist immer da und
 * braucht keine einzige zusaetzliche Umgebungsvariable. Ein lokales
 * Verzeichnis bleibt letzte Rueckfallebene, damit nie ein Dokument
 * verloren geht. Der Rest der Anwendung kennt nur dieses Interface.
 */

export type StoredFile = {
  backend: "supabase" | "db" | "drive" | "local";
  fileId: string | null;
  url: string | null;
  folder: string;
  localPath: string | null;
};

export type DriveStatus = {
  configured: boolean;
  mode: "supabase" | "datenbank" | "service-account" | "oauth" | "none";
  rootFolderId: string | null;
  sharedDrive: boolean;
  ok: boolean;
  message: string;
};

/** Menschlicher Name der Ablage fuer Statusmeldungen ("wurde in ... abgelegt"). */
export function backendLabel(backend: StoredFile["backend"]): string {
  switch (backend) {
    case "supabase":
      return "Supabase Storage";
    case "db":
      return "der Dokumentenablage";
    case "drive":
      return "Google Drive";
    default:
      return "der lokalen Ablage";
  }
}

// --- Supabase Storage ------------------------------------------------------
// Die bevorzugte Ablage: liegt beim selben Anbieter wie die Datenbank,
// braucht nur zwei Umgebungsvariablen und keinen Google-Papierkram.

const SUPABASE_BUCKET = "dokumente";

function supabaseConfig(): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return { url, key };
}

async function uploadToSupabase(
  fileName: string,
  mimeType: string,
  data: Buffer,
  folderSegments: string[],
): Promise<StoredFile> {
  const config = supabaseConfig()!;
  const ordner = folderSegments.map(safeName).join("/");

  // Kollisionen vermeiden wie bei der lokalen Ablage: nummerierter Anhang.
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);

  for (let versuch = 0; versuch < 50; versuch += 1) {
    const name = versuch === 0 ? fileName : `${base}-${versuch}${ext}`;
    const objektPfad = `${ordner}/${name}`;

    const antwort = await fetch(
      `${config.url}/storage/v1/object/${SUPABASE_BUCKET}/${objektPfad
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.key}`,
          "content-type": mimeType || "application/octet-stream",
          "x-upsert": "false",
        },
        body: new Uint8Array(data),
      },
    );

    if (antwort.ok) {
      return {
        backend: "supabase",
        fileId: objektPfad,
        url: `/api/ablage/${objektPfad.split("/").map(encodeURIComponent).join("/")}`,
        folder: ordner,
        localPath: null,
      };
    }
    // 409: Name schon vergeben - naechster Versuch mit Anhang.
    if (antwort.status !== 409) {
      throw new Error(
        `Supabase-Ablage antwortete mit ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`,
      );
    }
  }
  throw new Error("Supabase-Ablage: kein freier Dateiname nach 50 Versuchen.");
}

/** Liest eine Datei aus der Supabase-Ablage; null, wenn nicht konfiguriert oder nicht da. */
export async function readSupabaseFile(
  objektPfad: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const antwort = await fetch(
    `${config.url}/storage/v1/object/${SUPABASE_BUCKET}/${objektPfad
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    { headers: { authorization: `Bearer ${config.key}` } },
  );
  if (!antwort.ok) return null;
  return {
    data: Buffer.from(await antwort.arrayBuffer()),
    contentType: antwort.headers.get("content-type") ?? "application/octet-stream",
  };
}

// --- Datenbank-Ablage ------------------------------------------------------
// Immer verfuegbar: nutzt die bestehende Datenbankverbindung, keine weitere
// Einrichtung noetig. Der "pfad" folgt denselben Ordnerkonventionen.

async function uploadToDatabase(
  fileName: string,
  mimeType: string,
  data: Buffer,
  folderSegments: string[],
): Promise<StoredFile> {
  const ordner = folderSegments.map(safeName).join("/");
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);

  for (let versuch = 0; versuch < 50; versuch += 1) {
    const name = versuch === 0 ? fileName : `${base}-${versuch}${ext}`;
    const pfad = `${ordner}/${name}`;
    try {
      await prisma.ablageDatei.create({
        data: {
          pfad,
          mimeType: mimeType || "application/octet-stream",
          sizeBytes: data.byteLength,
          daten: new Uint8Array(data),
        },
      });
      return {
        backend: "db",
        fileId: pfad,
        url: `/api/ablage/${pfad.split("/").map(encodeURIComponent).join("/")}`,
        folder: ordner,
        localPath: null,
      };
    } catch (error) {
      // P2002: Pfad schon vergeben - naechster Versuch mit Nummernanhang.
      if ((error as { code?: string }).code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Datenbank-Ablage: kein freier Dateiname nach 50 Versuchen.");
}

/**
 * Liest ein abgelegtes Dokument anhand seines Pfads - erst aus Supabase
 * Storage (falls konfiguriert), sonst aus der Datenbank-Ablage.
 */
export async function readStoredFile(
  pfad: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const ausSupabase = await readSupabaseFile(pfad);
  if (ausSupabase) return ausSupabase;

  const zeile = await prisma.ablageDatei.findUnique({ where: { pfad } });
  if (!zeile) return null;
  return { data: Buffer.from(zeile.daten), contentType: zeile.mimeType };
}

const LOCAL_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(process.cwd(), "storage");

// --- Ordnerkonventionen ----------------------------------------------------
// Der Baum ist so aufgebaut, dass er einer Steuerberaterin ohne Erklaerung
// verstaendlich ist: Jahr, dann Monat, dann Belegart.

export const FOLDER = {
  contracts: (year: number) => ["Mietvertraege", String(year)],
  receipts: (year: number, month: number) => [
    "Buchhaltung",
    String(year),
    `${String(month).padStart(2, "0")} Belege`,
  ],
  statements: (year: number) => ["Buchhaltung", String(year), "Kontoauszuege"],
  exports: (year: number) => ["Buchhaltung", String(year), "Steuerberater-Export"],
  tenants: () => ["Mieterunterlagen"],
  other: () => ["Sonstiges"],
};

// --- Google-Drive-Client ---------------------------------------------------

type DriveClient = import("googleapis").drive_v3.Drive;

let cachedDrive: DriveClient | null | undefined;
const folderCache = new Map<string, string>();

function serviceAccountCredentials(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: String(parsed.private_key).split("\\n").join("\n"),
    };
  } catch {
    return null;
  }
}

function driveMode(): DriveStatus["mode"] {
  if (serviceAccountCredentials()) return "service-account";
  if (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  ) {
    return "oauth";
  }
  return "none";
}

async function getDrive(): Promise<DriveClient | null> {
  if (cachedDrive !== undefined) return cachedDrive;

  const mode = driveMode();
  if (mode === "none" || !process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    cachedDrive = null;
    return null;
  }

  try {
    const { google } = await import("googleapis");
    const scopes = ["https://www.googleapis.com/auth/drive"];

    if (mode === "service-account") {
      const creds = serviceAccountCredentials()!;
      const auth = new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes,
        // Optional: domainweite Delegation auf ein echtes Nutzerkonto
        subject: process.env.GOOGLE_IMPERSONATE_USER || undefined,
      });
      cachedDrive = google.drive({ version: "v3", auth });
    } else {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );
      auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
      cachedDrive = google.drive({ version: "v3", auth });
    }
    return cachedDrive;
  } catch (error) {
    console.error("[storage] Google Drive konnte nicht initialisiert werden:", error);
    cachedDrive = null;
    return null;
  }
}

const SHARED_DRIVE_OPTS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

/** Legt die Ordnerkette unterhalb des Root-Ordners an (idempotent) und liefert die Ordner-ID. */
async function ensureFolder(drive: DriveClient, segments: string[]): Promise<string> {
  let parent = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID as string;
  let cacheKey = parent;

  for (const segment of segments) {
    cacheKey = `${cacheKey}/${segment}`;
    const cached = folderCache.get(cacheKey);
    if (cached) {
      parent = cached;
      continue;
    }

    const escaped = segment.split("'").join("\\'");
    const list = await drive.files.list({
      q:
        `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' ` +
        `and '${parent}' in parents and trashed = false`,
      fields: "files(id, name)",
      pageSize: 1,
      ...SHARED_DRIVE_OPTS,
    });

    let id = list.data.files?.[0]?.id ?? null;
    if (!id) {
      const created = await drive.files.create({
        requestBody: {
          name: segment,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parent],
        },
        fields: "id",
        supportsAllDrives: true,
      });
      id = created.data.id!;
    }

    folderCache.set(cacheKey, id);
    parent = id;
  }

  return parent;
}

// --- Oeffentliches Interface ----------------------------------------------

function safeName(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "datei";
}

export async function uploadFile(params: {
  fileName: string;
  mimeType: string;
  data: Buffer;
  folderSegments: string[];
}): Promise<StoredFile> {
  const fileName = safeName(params.fileName);
  const folder = params.folderSegments.join("/");

  if (supabaseConfig()) {
    try {
      return await uploadToSupabase(fileName, params.mimeType, params.data, params.folderSegments);
    } catch (error) {
      console.error("[storage] Supabase-Upload fehlgeschlagen, nutze Datenbank-Ablage:", error);
    }
  }

  const drive = await getDrive();

  if (drive) {
    try {
      const { Readable } = await import("node:stream");
      const folderId = await ensureFolder(drive, params.folderSegments);
      const created = await drive.files.create({
        requestBody: { name: fileName, parents: [folderId] },
        media: { mimeType: params.mimeType, body: Readable.from(params.data) },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      });
      return {
        backend: "drive",
        fileId: created.data.id ?? null,
        url: created.data.webViewLink ?? null,
        folder,
        localPath: null,
      };
    } catch (error) {
      console.error("[storage] Drive-Upload fehlgeschlagen, nutze Datenbank-Ablage:", error);
    }
  }

  try {
    return await uploadToDatabase(fileName, params.mimeType, params.data, params.folderSegments);
  } catch (error) {
    console.error("[storage] Datenbank-Ablage fehlgeschlagen, nutze lokale Ablage:", error);
  }

  return writeLocal(fileName, params.data, params.folderSegments, "nicht-eingerichtet");
}

/**
 * Rueckfallebene ohne Drive. Auf Vercel und aehnlichen Umgebungen ist das
 * Dateisystem schreibgeschuetzt und ueberlebt das naechste Deployment nicht --
 * dort darf ein Beleg nicht stillschweigend im Nirgendwo landen.
 */
async function writeLocal(
  fileName: string,
  data: Buffer,
  folderSegments: string[],
  reason: "nicht-eingerichtet" | "drive-fehler",
): Promise<StoredFile> {
  const dir = path.join(LOCAL_ROOT, ...folderSegments.map(safeName));
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    throw new Error(localFallbackMessage(reason), { cause: error });
  }

  // Kollisionen vermeiden, ohne bestehende Dateien zu ueberschreiben
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let target = path.join(dir, fileName);
  let attempt = 0;
  while (attempt < 50) {
    try {
      await fs.access(target);
      attempt += 1;
      target = path.join(dir, `${base}-${attempt}${ext}`);
    } catch {
      break;
    }
  }

  try {
    await fs.writeFile(target, data);
  } catch (error) {
    throw new Error(localFallbackMessage(reason), { cause: error });
  }

  const relative = path.relative(LOCAL_ROOT, target).split(path.sep).join("/");
  return {
    backend: "local",
    fileId: null,
    url: `/api/dateien/${relative.split("/").map(encodeURIComponent).join("/")}`,
    folder: folderSegments.join("/"),
    localPath: relative,
  };
}

function localFallbackMessage(reason: "nicht-eingerichtet" | "drive-fehler"): string {
  void reason;
  return (
    "Die Datei konnte nicht gespeichert werden: die Dokumentenablage in der " +
    "Datenbank ist gerade nicht erreichbar, und die lokale Ablage steht auf " +
    "diesem Server nicht zur Verfügung. Bitte in ein paar Minuten erneut " +
    "versuchen; der Status ist unter Einstellungen → Systemstatus sichtbar."
  );
}

/** Liest eine lokal abgelegte Datei; verhindert Pfad-Ausbrueche. */
export async function readLocalFile(relativePath: string): Promise<Buffer | null> {
  const target = path.resolve(LOCAL_ROOT, relativePath);
  if (target !== LOCAL_ROOT && !target.startsWith(LOCAL_ROOT + path.sep)) return null;
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

export async function deleteFile(file: {
  driveFileId?: string | null;
  localPath?: string | null;
}): Promise<void> {
  if (file.driveFileId) {
    // Supabase- und Datenbank-Ablage nutzen den Objektpfad als Kennung.
    try {
      await prisma.ablageDatei.deleteMany({ where: { pfad: file.driveFileId } });
    } catch (error) {
      console.error("[storage] Datenbank-Datei konnte nicht gelöscht werden:", error);
    }
    const supabase = supabaseConfig();
    if (supabase && file.driveFileId.includes("/")) {
      try {
        await fetch(
          `${supabase.url}/storage/v1/object/${SUPABASE_BUCKET}/${file.driveFileId
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          { method: "DELETE", headers: { authorization: `Bearer ${supabase.key}` } },
        );
      } catch (error) {
        console.error("[storage] Supabase-Datei konnte nicht gelöscht werden:", error);
      }
    }
    // Echte Drive-IDs enthalten nie einen Schraegstrich - Ablagepfade schon.
    if (!file.driveFileId.includes("/")) {
      const drive = await getDrive();
      if (drive) {
        try {
          await drive.files.update({
            fileId: file.driveFileId,
            requestBody: { trashed: true },
            supportsAllDrives: true,
          });
        } catch (error) {
          console.error("[storage] Drive-Datei konnte nicht in den Papierkorb wandern:", error);
        }
      }
    }
  }
  if (file.localPath) {
    const target = path.resolve(LOCAL_ROOT, file.localPath);
    if (target.startsWith(LOCAL_ROOT + path.sep)) {
      await fs.rm(target, { force: true });
    }
  }
}

/**
 * Gibt einen Drive-Ordner fuer eine E-Mail-Adresse frei (Leserechte).
 * Wird fuer die Steuerberater-Freigabe genutzt.
 */
export async function shareFolderWith(
  folderSegments: string[],
  email: string,
  role: "reader" | "writer" = "reader",
): Promise<{ ok: boolean; message: string; folderId?: string }> {
  const drive = await getDrive();
  if (!drive) {
    return { ok: false, message: "Google Drive ist nicht konfiguriert." };
  }
  try {
    const folderId = await ensureFolder(drive, folderSegments);
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { type: "user", role, emailAddress: email },
      sendNotificationEmail: true,
      supportsAllDrives: true,
    });
    return { ok: true, message: `Ordner wurde fuer ${email} freigegeben.`, folderId };
  } catch (error) {
    return { ok: false, message: `Freigabe fehlgeschlagen: ${(error as Error).message}` };
  }
}

/** Weblink auf einen Ordner, damit die Oberflaeche direkt nach Drive verlinken kann. */
export async function folderLink(folderSegments: string[]): Promise<string | null> {
  const drive = await getDrive();
  if (!drive) return null;
  try {
    const folderId = await ensureFolder(drive, folderSegments);
    return `https://drive.google.com/drive/folders/${folderId}`;
  } catch {
    return null;
  }
}

/** Statusanzeige fuer die Einstellungsseite. */
export async function checkDriveStatus(): Promise<DriveStatus> {
  // Supabase-Ablage hat Vorrang: gleiche Plattform wie die Datenbank.
  const supabase = supabaseConfig();
  if (supabase) {
    try {
      const antwort = await fetch(`${supabase.url}/storage/v1/bucket/${SUPABASE_BUCKET}`, {
        headers: { authorization: `Bearer ${supabase.key}` },
      });
      if (antwort.ok) {
        return {
          configured: true,
          mode: "supabase",
          rootFolderId: null,
          sharedDrive: false,
          ok: true,
          message: `Dokumente werden in Supabase Storage abgelegt (Bucket „${SUPABASE_BUCKET}“).`,
        };
      }
      return {
        configured: true,
        mode: "supabase",
        rootFolderId: null,
        sharedDrive: false,
        ok: false,
        message: `Supabase Storage antwortet mit ${antwort.status} – Bucket „${SUPABASE_BUCKET}“ vorhanden und SUPABASE_SECRET_KEY gültig?`,
      };
    } catch (error) {
      return {
        configured: true,
        mode: "supabase",
        rootFolderId: null,
        sharedDrive: false,
        ok: false,
        message: `Supabase Storage nicht erreichbar: ${(error as Error).message}`,
      };
    }
  }

  const mode = driveMode();
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? null;

  if (mode === "none" || !rootFolderId) {
    // Standardfall ohne weitere Einrichtung: die Datenbank selbst ist die Ablage.
    try {
      const anzahl = await prisma.ablageDatei.count();
      return {
        configured: true,
        mode: "datenbank",
        rootFolderId: null,
        sharedDrive: false,
        ok: true,
        message:
          `Dokumente werden in der Supabase-Datenbank abgelegt (${anzahl} Datei${anzahl === 1 ? "" : "en"}) – keine Einrichtung nötig.`,
      };
    } catch (error) {
      return {
        configured: true,
        mode: "datenbank",
        rootFolderId: null,
        sharedDrive: false,
        ok: false,
        message: `Datenbank-Ablage nicht erreichbar: ${(error as Error).message}`,
      };
    }
  }

  const drive = await getDrive();
  if (!drive) {
    return {
      configured: true,
      mode,
      rootFolderId,
      sharedDrive: false,
      ok: false,
      message: "Zugangsdaten vorhanden, aber der Drive-Client liess sich nicht initialisieren.",
    };
  }

  try {
    const info = await drive.files.get({
      fileId: rootFolderId,
      fields: "id, name, mimeType, driveId",
      supportsAllDrives: true,
    });
    return {
      configured: true,
      mode,
      rootFolderId,
      sharedDrive: Boolean(info.data.driveId),
      ok: true,
      message: `Verbunden mit Ordner "${info.data.name}".`,
    };
  } catch (error) {
    return {
      configured: true,
      mode,
      rootFolderId,
      sharedDrive: false,
      ok: false,
      message: `Drive-Zugriff fehlgeschlagen: ${(error as Error).message}`,
    };
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export { LOCAL_ROOT };
