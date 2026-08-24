/**
 * Namensvergleich fuer die Vertragsablage.
 *
 * Eingescannte Vertraege tragen den Namen so, wie er im Vertrag steht -
 * in den Listen steht er manchmal anders: "Jurgin Hajdinaj" gegen
 * "Jurgin Haradinaj". Der Trigramm-Vergleich (wie ihn auch Postgres
 * benutzt) liefert einen Vorschlag, den ein Mensch bestaetigt. Er darf
 * grosszuegig vorschlagen, aber niemals selbst zuordnen: "Dian Bucolli"
 * und "Drilon Bucolli" sind zwei verschiedene Menschen.
 */

/** Der im Vertrag gedruckte Name, aus dem Dokumenttitel zurueckgewonnen. */
export function nameAusTitel(titel: string): string {
  return titel
    .replace(/^Mietvertrag\s+/i, "")
    .replace(/\s*\(.*$/, "")
    .trim();
}

function trigramme(text: string): Set<string> {
  const sauber = ` ${text.toLowerCase().replace(/[^a-zäöüß]+/g, " ").trim()} `;
  const menge = new Set<string>();
  for (let i = 0; i < sauber.length - 2; i += 1) menge.add(sauber.slice(i, i + 3));
  return menge;
}

/** 0 = nichts gemeinsam, 1 = gleich. */
export function namensAehnlichkeit(a: string, b: string): number {
  const A = trigramme(a);
  const B = trigramme(b);
  if (A.size === 0 || B.size === 0) return 0;
  let gemeinsam = 0;
  for (const t of A) if (B.has(t)) gemeinsam += 1;
  return gemeinsam / (A.size + B.size - gemeinsam);
}

export type Vorschlag = { tenantId: string; name: string; guete: number };

/**
 * Vor- und Nachname zaehlen einzeln.
 *
 * Ein Vergleich ueber den ganzen Namen laesst sich vom Nachnamen
 * ueberstimmen: "Dian Bucolli" und "Albin Bucolli" kaemen auf 47 Prozent,
 * obwohl es zwei verschiedene Menschen sind. Deshalb muss jeder Teil fuer
 * sich passen (nichts darf voellig danebenliegen) und der Schnitt beider
 * Teile ordentlich sein. Ein Tippfehler in einem der beiden Teile ueberlebt
 * das, zwei verschiedene Personen nicht.
 */
const MINDESTENS_JE_TEIL = 0.3;
const MINDESTENS_IM_SCHNITT = 0.5;
/** Ohne getrennten Nachnamen bleibt nur der Gesamtvergleich - dann strenger. */
const MINDESTENS_GESAMT = 0.6;

function teile(name: string): { vorname: string; nachname: string } {
  const stuecke = name.trim().split(/\s+/);
  return { vorname: stuecke[0] ?? "", nachname: stuecke.slice(1).join(" ") };
}

/** Guete des Vergleichs zweier Personennamen; 0, wenn sie nicht zueinander passen. */
export function personenAehnlichkeit(a: string, b: string): number {
  const A = teile(a);
  const B = teile(b);

  if (!A.nachname || !B.nachname) {
    const gesamt = namensAehnlichkeit(a, b);
    return gesamt >= MINDESTENS_GESAMT ? gesamt : 0;
  }

  const vorne = namensAehnlichkeit(A.vorname, B.vorname);
  const hinten = namensAehnlichkeit(A.nachname, B.nachname);
  if (Math.min(vorne, hinten) < MINDESTENS_JE_TEIL) return 0;

  const schnitt = (vorne + hinten) / 2;
  return schnitt >= MINDESTENS_IM_SCHNITT ? schnitt : 0;
}

/** Bester Namenstreffer unter den Mietern - oder null, wenn nichts passt. */
export function besterTreffer(
  gesucht: string,
  mieter: Array<{ id: string; firstName: string; lastName: string }>,
): Vorschlag | null {
  let bester: Vorschlag | null = null;
  for (const m of mieter) {
    const name = `${m.firstName} ${m.lastName}`.trim();
    const guete = personenAehnlichkeit(gesucht, name);
    if (guete > 0 && (!bester || guete > bester.guete)) {
      bester = { tenantId: m.id, name, guete };
    }
  }
  return bester;
}
