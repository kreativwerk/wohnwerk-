"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { SPRACHEN, SPRACH_COOKIE, type Sprache } from "@/lib/i18n";

/**
 * Merkt die Sprachwahl in einem Cookie. Kein Benutzerkonto noetig - die
 * Wahl gilt fuer dieses Geraet, auch vor der Anmeldung.
 */
export async function setzeSprache(formData: FormData) {
  const wert = String(formData.get("sprache") ?? "");
  const sprache = (SPRACHEN as readonly string[]).includes(wert) ? (wert as Sprache) : "de";

  (await cookies()).set(SPRACH_COOKIE, sprache, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Die Sprache faerbt jede Seite ein, deshalb das ganze Layout neu bauen.
  revalidatePath("/", "layout");
}
