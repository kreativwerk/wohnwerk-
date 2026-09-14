import type { Tone } from "@/components/ui";

/**
 * Kleine Regeln rund um Tickets, die Liste und Detailseite teilen.
 * Bewusst ohne Datenbankzugriff, damit sie sich auch testen lassen.
 */

/** Offen zuerst, Erledigtes zuletzt - alphabetisch waere genau verkehrt. */
const STATUS_RANG: Record<string, number> = { OFFEN: 0, IN_ARBEIT: 1, ERLEDIGT: 2 };
const PRIORITAET_RANG: Record<string, number> = { HOCH: 0, NORMAL: 1, NIEDRIG: 2 };

export function statusTon(status: string): Tone {
  if (status === "ERLEDIGT") return "success";
  if (status === "IN_ARBEIT") return "info";
  return "warning";
}

export function prioritaetsTon(prioritaet: string): Tone {
  if (prioritaet === "HOCH") return "danger";
  if (prioritaet === "NIEDRIG") return "neutral";
  return "accent";
}

/**
 * Der eine Schritt, den die Liste anbietet: Offen wird angefasst,
 * Angefasstes wird erledigt. Erledigtes bleibt liegen.
 */
export function naechsterStatus(status: string): string | null {
  if (status === "OFFEN") return "IN_ARBEIT";
  if (status === "IN_ARBEIT") return "ERLEDIGT";
  return null;
}

/**
 * Sortiert fuer die Liste: erst was offen ist, darin das Dringende,
 * darin das Neueste. Neue Tickets stehen so von selbst ganz oben.
 */
export function sortiereTickets<T extends { status: string; prioritaet: string; createdAt: Date }>(
  tickets: T[],
): T[] {
  return [...tickets].sort((a, b) => {
    const status = (STATUS_RANG[a.status] ?? 9) - (STATUS_RANG[b.status] ?? 9);
    if (status !== 0) return status;
    const prio = (PRIORITAET_RANG[a.prioritaet] ?? 9) - (PRIORITAET_RANG[b.prioritaet] ?? 9);
    if (prio !== 0) return prio;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/** Wie lange liegt das Ticket schon? Ganze Tage, ab heute gerechnet. */
export function liegtSeitTagen(createdAt: Date, jetzt = new Date()): number {
  return Math.max(0, Math.floor((jetzt.getTime() - createdAt.getTime()) / 86_400_000));
}

/**
 * Die Zeile, die einer Support-Meldung beiliegt: wo es passierte, in
 * welchem Fenster, mit welchem Browser.
 *
 * Was der Browser nicht hergibt, faellt weg statt als leeres "Seite: "
 * dazustehen. Gibt es gar nichts, ist die Zeile null - die Meldung geht
 * trotzdem raus, denn der Text ist das Wesentliche.
 */
export function kontextText(teile: {
  seite?: string | null;
  fenster?: string | null;
  browser?: string | null;
}): string | null {
  const zeilen = [
    teile.seite && `Seite: ${teile.seite}`,
    teile.fenster && `Fenster: ${teile.fenster}`,
    teile.browser && `Browser: ${teile.browser}`,
  ].filter(Boolean);
  return zeilen.length > 0 ? zeilen.join(" · ") : null;
}
