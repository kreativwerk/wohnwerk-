/**
 * Einladung zum Mietvertrag: der Text, der mit dem persoenlichen Link per
 * WhatsApp rausgeht - in der Sprache des Mieters. Ueber den Link traegt er
 * seine Daten selbst ein und unterschreibt.
 *
 * Reine Funktion, damit sie sich testen laesst.
 */

import { KAUTION_SPRACHE_NAME, type KautionSprache } from "./mahnung";

/** Deutsch zuerst, dann die Sprachen unserer Bewohner. */
export const EINLADUNG_SPRACHEN: readonly KautionSprache[] = ["de", "sq", "bg", "ro", "hu", "en"];
export const EINLADUNG_SPRACHE_NAME = KAUTION_SPRACHE_NAME;

export type EinladungAngaben = {
  vorname: string;
  objekt: string;
  /** "Erdgeschoss, Bett 7" */
  lage: string;
  /** schon formatiert: 01.12.2026 */
  einzug: string;
  /** schon formatiert: 470,00 € */
  miete: string;
  link: string;
  vermieter: string;
};

type Text = (a: EinladungAngaben) => string;

const TEXTE: Record<KautionSprache, Text> = {
  de: (a) =>
    `Hallo ${a.vorname},\n\n` +
    `hier ist dein Mietvertrag für ${a.objekt} (${a.lage}), Einzug am ${a.einzug}, Miete ${a.miete} pauschal inkl. Nebenkosten.\n\n` +
    `Bitte öffne den Link, trag deine Daten ein (Name, E-Mail, Geburtsdatum, Heimatadresse) und unterschreib direkt am Handy:\n${a.link}\n\n` +
    `Der Link ist nur für dich.\n\nViele Grüße\n${a.vermieter}`,
  sq: (a) =>
    `Përshëndetje ${a.vorname},\n\n` +
    `këtu është kontrata jote e qirasë për ${a.objekt} (${a.lage}), hyrja më ${a.einzug}, qiraja ${a.miete} në total me të gjitha shpenzimet.\n\n` +
    `Të lutem hap linkun, plotëso të dhënat e tua (emri, e-mail, datëlindja, adresa në vendlindje) dhe nënshkruaj direkt në telefon:\n${a.link}\n\n` +
    `Linku është vetëm për ty.\n\nMe respekt\n${a.vermieter}`,
  bg: (a) =>
    `Здравей, ${a.vorname},\n\n` +
    `ето твоят договор за наем за ${a.objekt} (${a.lage}), настаняване на ${a.einzug}, наем ${a.miete} всичко включено.\n\n` +
    `Моля, отвори линка, попълни данните си (име, имейл, дата на раждане, постоянен адрес) и подпиши директно на телефона:\n${a.link}\n\n` +
    `Линкът е само за теб.\n\nПоздрави\n${a.vermieter}`,
  ro: (a) =>
    `Bună, ${a.vorname},\n\n` +
    `iată contractul tău de închiriere pentru ${a.objekt} (${a.lage}), mutarea pe ${a.einzug}, chirie ${a.miete} cu toate utilitățile incluse.\n\n` +
    `Te rog deschide linkul, completează datele tale (nume, e-mail, data nașterii, adresa de domiciliu) și semnează direct pe telefon:\n${a.link}\n\n` +
    `Linkul este doar pentru tine.\n\nCu stimă\n${a.vermieter}`,
  hu: (a) =>
    `Szia ${a.vorname}!\n\n` +
    `Itt a bérleti szerződésed: ${a.objekt} (${a.lage}), beköltözés: ${a.einzug}, bérleti díj ${a.miete}, minden rezsivel együtt.\n\n` +
    `Kérlek, nyisd meg a linket, add meg az adataidat (név, e-mail, születési dátum, állandó lakcím), és írd alá közvetlenül a telefonon:\n${a.link}\n\n` +
    `A link csak neked szól.\n\nÜdvözlettel\n${a.vermieter}`,
  en: (a) =>
    `Hi ${a.vorname},\n\n` +
    `here is your rental contract for ${a.objekt} (${a.lage}), move-in on ${a.einzug}, rent ${a.miete} flat rate incl. all utilities.\n\n` +
    `Please open the link, enter your details (name, email, date of birth, home address) and sign directly on your phone:\n${a.link}\n\n` +
    `The link is just for you.\n\nBest regards\n${a.vermieter}`,
};

export function einladungText(sprache: KautionSprache, a: EinladungAngaben): string {
  return (TEXTE[sprache] ?? TEXTE.de)(a);
}

/**
 * Sprache aus der Staatsangehoerigkeit raten - nur ein Vorschlag fuer die
 * Reihenfolge der Knoepfe. Ohne Treffer: Deutsch.
 */
export function spracheAusNationalitaet(nationalitaet: string | null | undefined): KautionSprache {
  const n = (nationalitaet ?? "").toLowerCase();
  if (/alban|kosov|shqip|nordmaz|mazedon/.test(n)) return "sq";
  if (/bulgar/.test(n)) return "bg";
  if (/rumän|rumaen|roman|moldau|moldov/.test(n)) return "ro";
  if (/ungar|hungar|magyar/.test(n)) return "hu";
  return "de";
}
