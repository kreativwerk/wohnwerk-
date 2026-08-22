import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "./db";

const COOKIE_NAME = "ww_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 Stunden

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/**
 * Rollen. "admin" darf alles; "steuerberater" sieht ausschliesslich die
 * Buchhaltung und auch die nur lesend - Zahlen pruefen und Exporte
 * herunterladen ja, Daten veraendern nein.
 */
export const ROLES = {
  ADMIN: "admin",
  STEUERBERATER: "steuerberater",
} as const;

export const ROLE_LABEL: Record<string, string> = {
  admin: "Verwaltung",
  steuerberater: "Steuerberater (nur Buchhaltung, nur lesend)",
};

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === ROLES.ADMIN;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET fehlt oder ist zu kurz (mindestens 16 Zeichen).");
    }
    return "dev-only-insecure-secret-change-me";
  }
  return value;
}

// --- Passwoerter: scrypt aus node:crypto, keine externe Abhaengigkeit ------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// --- Session-Cookie: signiertes JSON (HMAC-SHA256) -------------------------

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function serialize(user: SessionUser): string {
  const body = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + MAX_AGE_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

function deserialize(raw: string | undefined): SessionUser | null {
  if (!raw) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { id: data.id, email: data.email, name: data.name, role: data.role };
  } catch {
    return null;
  }
}

export async function createSession(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, serialize(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return deserialize(store.get(COOKIE_NAME)?.value);
}

/** Fuer Server Components / Layouts: leitet auf /login um, wenn nicht angemeldet. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Fuer Server Actions und Seiten, die Daten veraendern oder ausserhalb der
 * Buchhaltung liegen: verlangt die Verwaltungsrolle. Ein Steuerberater-Konto
 * landet wieder auf seiner Startseite statt auf einer Fehlerseite.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/buchhaltung");
  return user;
}

/** Fuer Route Handler: wirft eine 401-Response, wenn nicht angemeldet. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Nicht angemeldet" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}

/**
 * Meldet einen Benutzer an. Legt beim allerersten Login den Admin aus den
 * Umgebungsvariablen an, damit das System ohne manuelles Seeding startklar ist.
 */
export async function login(email: string, password: string): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();

  const count = await prisma.user.count();
  if (count === 0) {
    const bootstrapEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const bootstrapPassword = process.env.ADMIN_PASSWORD ?? "";
    if (bootstrapEmail && bootstrapPassword && normalized === bootstrapEmail && password === bootstrapPassword) {
      const created = await prisma.user.create({
        data: {
          email: bootstrapEmail,
          name: process.env.ADMIN_NAME ?? "Administrator",
          passwordHash: hashPassword(bootstrapPassword),
          role: "admin",
          lastLoginAt: new Date(),
        },
      });
      return { id: created.id, email: created.email, name: created.name, role: created.role };
    }
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
