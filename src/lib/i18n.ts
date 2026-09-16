import "server-only";

import { cookies } from "next/headers";

import {
  SPRACH_COOKIE,
  istSprache,
  oberflaecheIn,
  uebersetzeIn,
  type Oberflaeche,
  type Sprache,
  type Uebersetzen,
} from "./i18n-gemeinsam";

export {
  LOCALE,
  SPRACHEN,
  SPRACH_COOKIE,
  SPRACH_NAME,
  oberflaecheIn,
  uebersetzeIn,
  type Oberflaeche,
  type Sprache,
  type Uebersetzen,
} from "./i18n-gemeinsam";

/** Die gewaehlte Sprache; ohne Auswahl Deutsch. */
export async function aktuelleSprache(): Promise<Sprache> {
  const wert = (await cookies()).get(SPRACH_COOKIE)?.value;
  return istSprache(wert) ? wert : "de";
}

/**
 * Uebersetzer fuer Server-Komponenten:
 *
 *   const t = await uebersetzer();
 *   <h1>{t("Mieteingänge")}</h1>
 */
export async function uebersetzer(): Promise<Uebersetzen> {
  return uebersetzeIn(await aktuelleSprache());
}

/**
 * Texte und Formate fuer Server-Komponenten und Server Actions:
 *
 *   const { t, datum, geld } = await oberflaeche();
 */
export async function oberflaeche(): Promise<Oberflaeche> {
  return oberflaecheIn(await aktuelleSprache());
}
