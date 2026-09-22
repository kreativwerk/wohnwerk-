"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bed as BedIcon, Lock, X } from "@phosphor-icons/react/dist/ssr";

import { planEntfernen, planVerschieben } from "@/app/actions/zimmerplan";
import { TENANCY_STATUS_LABEL } from "@/lib/enums";

import { useOberflaeche } from "./sprache-kontext";

export type PlanBewohner = {
  tenantId: string;
  tenancyId: string;
  name: string;
  status: string;
  seit: string;
  bis: string | null;
  kuenftig: boolean;
};
export type PlanBett = { id: string; label: string; gesperrt: boolean; bewohner: PlanBewohner | null };
export type PlanZimmer = { id: string; name: string; betten: PlanBett[] };
export type PlanStockwerk = { name: string; ohneAngabe: boolean; zimmer: PlanZimmer[] };
export type PlanWartender = { tenantId: string; name: string; hinweis: string | null };

type Auswahl = { tenantId: string; tenancyId: string | null; name: string };

/** Belegt / frei / gesamt fuer eine Menge Betten - Gesperrtes zaehlt nicht als frei. */
function zaehle(betten: PlanBett[]) {
  const gesamt = betten.length;
  const belegt = betten.filter((b) => b.bewohner).length;
  const gesperrt = betten.filter((b) => b.gesperrt && !b.bewohner).length;
  return { gesamt, belegt, frei: gesamt - belegt - gesperrt, gesperrt };
}

/**
 * Das Brett: Stockwerke untereinander, Zimmer nebeneinander, Betten im
 * Zimmer, rechts die Spalte "Ohne Bett".
 *
 * Zwei Wege, dieselbe Wirkung: Am Schreibtisch zieht man eine Person auf
 * ein Bett oder in die rechte Spalte. Am Handy, wo Ziehen nicht geht,
 * tippt man die Person an (sie wird markiert) und dann das Ziel. Die
 * Server-Aktion entscheidet, was der Zug bedeutet - Umzug, Tausch, neues
 * Mietverhaeltnis oder Ende - und sagt es in der Meldung.
 */
export function Zimmerplan({
  objektId,
  objektName,
  stockwerke,
  ohneBett,
}: {
  objektId: string;
  objektName: string;
  stockwerke: PlanStockwerk[];
  ohneBett: PlanWartender[];
}) {
  const { t } = useOberflaeche();
  const router = useRouter();
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  const [laufend, startTransition] = useTransition();

  useEffect(() => {
    if (!meldung || meldung.art !== "ok") return;
    const timer = setTimeout(() => setMeldung(null), 6000);
    return () => clearTimeout(timer);
  }, [meldung]);

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuswahl(null);
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, []);

  function ausfuehren(aktion: () => Promise<{ ok: true; meldung: string } | { ok: false; fehler: string }>) {
    startTransition(async () => {
      try {
        const antwort = await aktion();
        setMeldung(antwort.ok ? { art: "ok", text: antwort.meldung } : { art: "fehler", text: antwort.fehler });
        if (antwort.ok) router.refresh();
      } catch {
        setMeldung({ art: "fehler", text: t("Das hat nicht geklappt. Bitte Seite neu laden und noch einmal versuchen.") });
      } finally {
        setAuswahl(null);
        setUeber(null);
      }
    });
  }

  function aufBett(person: Auswahl, bett: PlanBett) {
    if (bett.bewohner?.tenantId === person.tenantId) {
      setAuswahl(null);
      return;
    }
    if (bett.bewohner && person.tenancyId) {
      if (!window.confirm(t("{a} und {b} tauschen die Betten?", { a: person.name, b: bett.bewohner.name }))) return;
    }
    ausfuehren(() => planVerschieben({ tenantId: person.tenantId, bedId: bett.id }));
  }

  function herausnehmen(person: Auswahl) {
    if (!person.tenancyId) {
      setAuswahl(null);
      return;
    }
    if (!window.confirm(t("{name} aus dem Zimmer nehmen? Das Mietverhältnis endet heute; wird die Person heute noch auf ein anderes Bett gesetzt, läuft es weiter.", { name: person.name }))) return;
    const tenancyId = person.tenancyId;
    ausfuehren(() => planEntfernen({ tenancyId }));
  }

  // Drag-and-drop: die Person reist als JSON im dataTransfer.
  function beimZiehen(e: React.DragEvent, person: Auswahl) {
    e.dataTransfer.setData("application/json", JSON.stringify(person));
    e.dataTransfer.effectAllowed = "move";
    setAuswahl(person);
  }
  function gezogenePerson(e: React.DragEvent): Auswahl | null {
    try {
      return JSON.parse(e.dataTransfer.getData("application/json")) as Auswahl;
    } catch {
      return auswahl;
    }
  }

  /**
   * Eine Person als Karte: Name in voller Breite, darunter klein der Status
   * oder ein Hinweis, rechts ggf. ein Knopf. Ziehbar und antippbar.
   */
  const chip = (person: Auswahl, meta?: React.ReactNode, aktion?: React.ReactNode, klasse = "") => {
    const aktiv = auswahl?.tenantId === person.tenantId;
    return (
      <div
        draggable={!laufend}
        onDragStart={(e) => beimZiehen(e, person)}
        onDragEnd={() => setUeber(null)}
        onClick={() => setAuswahl(aktiv ? null : person)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAuswahl(aktiv ? null : person);
          }
        }}
        aria-pressed={aktiv}
        title={aktiv ? t("Ausgewählt – jetzt Ziel antippen") : t("Ziehen oder antippen, dann Ziel wählen")}
        className={`group flex min-h-9 cursor-grab select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-inset transition-colors active:cursor-grabbing ${
          aktiv ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-ink-800 ring-ink-200 hover:ring-brand-400"
        } ${klasse}`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-tight">{person.name}</div>
          {meta && (
            <div className={`mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[0.7rem] leading-tight ${aktiv ? "text-white/80" : "text-ink-500"}`}>
              {meta}
            </div>
          )}
        </div>
        {aktion}
      </div>
    );
  };

  const dropKlasse = (id: string, basis: string) =>
    `${basis} ${ueber === id ? "ring-2 ring-brand-500 bg-brand-50" : ""}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-6">
        {meldung && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${
              meldung.art === "ok" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-red-50 text-red-800 ring-1 ring-red-200"
            }`}
          >
            {meldung.text}
          </div>
        )}
        {auswahl && !meldung && (
          <div role="status" className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-200">
            {t("{name} ausgewählt – ein Bett antippen zum Verschieben, „Ohne Bett“ zum Herausnehmen. Esc bricht ab.", { name: auswahl.name })}
          </div>
        )}

        {stockwerke.length === 0 && (
          <div className="card p-6 text-sm text-ink-600">
            {t("Dieses Objekt hat noch keine Zimmer. Zimmer und Betten legen Sie auf der Objektseite an.")}
          </div>
        )}

        {stockwerke.map((stockwerk) => {
          const z = zaehle(stockwerk.zimmer.flatMap((r) => r.betten));
          return (
            <section key={stockwerk.name} className="card p-4 sm:p-5">
              <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-[1.05rem] font-semibold text-ink-900">{stockwerk.name}</h2>
                <Zaehler {...z} />
              </header>
              {stockwerk.ohneAngabe && (
                <p className="mb-3 text-xs text-ink-500">
                  {t("Stockwerk fehlt – auf der Objektseite beim Zimmer unter „Etage“ eintragen, dann sortiert sich der Plan.")}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {stockwerk.zimmer.map((zimmer) => {
                  const zz = zaehle(zimmer.betten);
                  return (
                    <div key={zimmer.id} className="min-w-[15rem] flex-1 basis-[15rem] rounded-xl border border-ink-200/80 bg-ink-50/40 p-3">
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold text-ink-900">{zimmer.name}</h3>
                        <Zaehler {...zz} klein />
                      </div>
                      <ul className="space-y-1.5">
                        {zimmer.betten.map((bett) => {
                          const person = bett.bewohner
                            ? { tenantId: bett.bewohner.tenantId, tenancyId: bett.bewohner.tenancyId, name: bett.bewohner.name }
                            : null;
                          const zielbar = !bett.gesperrt && (!!auswahl || true);
                          return (
                            <li
                              key={bett.id}
                              onDragOver={(e) => {
                                if (bett.gesperrt) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setUeber(bett.id);
                              }}
                              onDragLeave={() => setUeber((u) => (u === bett.id ? null : u))}
                              onDrop={(e) => {
                                e.preventDefault();
                                setUeber(null);
                                const p = gezogenePerson(e);
                                if (p && !bett.gesperrt) aufBett(p, bett);
                              }}
                              onClick={() => {
                                if (auswahl && zielbar && auswahl.tenantId !== person?.tenantId) aufBett(auswahl, bett);
                              }}
                              className={dropKlasse(
                                bett.id,
                                `flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-inset transition-colors ${
                                  bett.gesperrt
                                    ? "bg-ink-100 ring-ink-200 text-ink-400"
                                    : person
                                      ? "bg-white ring-ink-200/70"
                                      : `border-dashed bg-emerald-50/60 ring-emerald-200 ${auswahl ? "cursor-pointer hover:bg-emerald-100" : ""}`
                                }`,
                              )}
                            >
                              <span className="flex w-20 shrink-0 items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-500">
                                {bett.gesperrt ? <Lock size={13} aria-hidden="true" /> : <BedIcon size={13} aria-hidden="true" />}
                                <span className="truncate">{bett.label}</span>
                              </span>
                              {person && bett.bewohner ? (
                                chip(
                                  person,
                                  bett.bewohner.status !== "ACTIVE" || bett.bewohner.bis || bett.bewohner.kuenftig ? (
                                    <>
                                      {bett.bewohner.status !== "ACTIVE" && <span>{t(TENANCY_STATUS_LABEL[bett.bewohner.status] ?? bett.bewohner.status)}</span>}
                                      {bett.bewohner.bis && <span className={auswahl?.tenantId === person.tenantId ? "" : "text-amber-700"}>{t("bis {datum}", { datum: bett.bewohner.bis })}</span>}
                                      {bett.bewohner.kuenftig && <span>{t("ab {datum}", { datum: bett.bewohner.seit })}</span>}
                                    </>
                                  ) : undefined,
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      herausnehmen(person);
                                    }}
                                    disabled={laufend}
                                    aria-label={t("{name} aus dem Zimmer nehmen", { name: person.name })}
                                    title={t("Aus dem Zimmer nehmen")}
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 opacity-60 transition-colors hover:bg-red-50 hover:text-red-700 hover:opacity-100 group-hover:opacity-100"
                                  >
                                    <X size={14} />
                                  </button>,
                                  "flex-1 min-w-0",
                                )
                              ) : (
                                <span className="text-sm text-ink-500">{bett.gesperrt ? t("gesperrt") : t("frei")}</span>
                              )}
                            </li>
                          );
                        })}
                        {zimmer.betten.length === 0 && (
                          <li className="text-xs text-ink-500">{t("Keine Betten in diesem Zimmer.")}</li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* --- Rechts: Ohne Bett -------------------------------------------- */}
      <aside
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setUeber("ohne-bett");
        }}
        onDragLeave={() => setUeber((u) => (u === "ohne-bett" ? null : u))}
        onDrop={(e) => {
          e.preventDefault();
          setUeber(null);
          const p = gezogenePerson(e);
          if (p) herausnehmen(p);
        }}
        onClick={() => {
          if (auswahl?.tenancyId) herausnehmen(auswahl);
        }}
        className={dropKlasse("ohne-bett", `card self-start p-4 lg:sticky lg:top-4 ${auswahl?.tenancyId ? "cursor-pointer" : ""}`)}
        aria-label={t("Ohne Bett")}
      >
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[1.05rem] font-semibold text-ink-900">{t("Ohne Bett")}</h2>
          <span className="text-sm tabular-nums text-ink-500">{ohneBett.length}</span>
        </header>
        <p className="mb-3 text-xs leading-relaxed text-ink-500">
          {t("Personen ohne Bett – über alle Objekte. Auf ein freies Bett ziehen, um sie in {objekt} einzuquartieren; jemanden hierher ziehen, um ihn aus dem Zimmer zu nehmen.", { objekt: objektName })}
        </p>
        <ul className="space-y-1.5">
          {ohneBett.map((w) => (
            <li key={w.tenantId}>
              {chip({ tenantId: w.tenantId, tenancyId: null, name: w.name }, w.hinweis ? <span>{w.hinweis}</span> : undefined)}
            </li>
          ))}
          {ohneBett.length === 0 && <li className="text-sm text-ink-500">{t("Alle haben ein Bett.")}</li>}
        </ul>
      </aside>
    </div>
  );
}

function Zaehler({ belegt, frei, gesamt, klein = false }: { belegt: number; frei: number; gesamt: number; gesperrt: number; klein?: boolean }) {
  const { t } = useOberflaeche();
  return (
    <span className={`flex shrink-0 items-center gap-1.5 tabular-nums ${klein ? "text-[0.7rem]" : "text-xs"}`}>
      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-800">{t("{n} belegt", { n: belegt })}</span>
      <span className={`rounded-full px-2 py-0.5 font-semibold ${frei > 0 ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-500"}`}>{t("{n} frei", { n: frei })}</span>
      <span className="text-ink-500">{t("{n} gesamt", { n: gesamt })}</span>
    </span>
  );
}
