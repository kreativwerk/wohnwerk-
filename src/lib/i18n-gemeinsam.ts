import { WOERTERBUCH_EN } from "./woerterbuch-en";

/**
 * Der Teil der Zweisprachigkeit, den auch Client-Komponenten brauchen
 * (Navigation, Menueleiste). Ohne "server-only", sonst laesst er sich
 * dort nicht einbinden. Alles, was Cookies liest, steht in i18n.ts.
 *
 * Als Schluessel dient der deutsche Text selbst: der Aufrufort bleibt
 * lesbar, und eine fehlende Uebersetzung faellt still auf das Deutsche
 * zurueck statt einen Schluessel anzuzeigen.
 */

export const SPRACHEN = ["de", "en"] as const;
export type Sprache = (typeof SPRACHEN)[number];

export const SPRACH_COOKIE = "ww_sprache";

export const SPRACH_NAME: Record<Sprache, string> = {
  de: "Deutsch",
  en: "English",
};

export function istSprache(wert: string | undefined | null): wert is Sprache {
  return wert === "de" || wert === "en";
}

export type Uebersetzen = (text: string) => string;

/** Uebersetzt einen deutschen Text in die angegebene Sprache. */
export function uebersetzeIn(sprache: Sprache): Uebersetzen {
  if (sprache === "de") return (text) => text;
  return (text) => WOERTERBUCH_EN[text] ?? text;
}
