"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import { useOberflaeche } from "./sprache-kontext";

type Treffer = { id: string; titel: string; untertitel: string; href: string };
type Gruppe = { art: string; treffer: Treffer[] };

/**
 * Das Suchfeld oben auf jeder Seite. Tippen genuegt: Nach zwei
 * Buchstaben kommen Vorschlaege - Mieter, Objekte, Zimmer, Vertraege,
 * Tickets - ohne Enter. Pfeiltasten waehlen, Enter oeffnet, Esc schliesst.
 * Die Taste "/" springt von ueberall ins Feld.
 */
export function Suche() {
  const { t } = useOberflaeche();
  const router = useRouter();
  const listeId = useId();
  const feld = useRef<HTMLInputElement>(null);
  const [wert, setWert] = useState("");
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const [laedt, setLaedt] = useState(false);
  const anfrage = useRef(0);

  // Nachschlagen mit kurzer Pause, damit nicht jeder Buchstabe eine Anfrage wird.
  useEffect(() => {
    const q = wert.trim();
    if (q.length < 2) {
      setGruppen([]);
      setLaedt(false);
      return;
    }
    const nummer = ++anfrage.current;
    setLaedt(true);
    const timer = setTimeout(async () => {
      try {
        const antwort = await fetch(`/api/suche?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (!antwort.ok) throw new Error(String(antwort.status));
        const daten = (await antwort.json()) as { gruppen: Gruppe[] };
        if (nummer !== anfrage.current) return; // eine neuere Anfrage laeuft schon
        setGruppen(daten.gruppen);
        setAktiv(daten.gruppen.length > 0 ? 0 : -1);
        setOffen(true);
      } catch {
        if (nummer === anfrage.current) setGruppen([]);
      } finally {
        if (nummer === anfrage.current) setLaedt(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [wert]);

  // "/" von ueberall ins Suchfeld - ausser man tippt gerade woanders.
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      const tippt = ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || ziel.tagName === "SELECT" || ziel.isContentEditable);
      if (e.key === "/" && !tippt && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        feld.current?.focus();
      }
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, []);

  const flach = gruppen.flatMap((g) => g.treffer);

  function oeffne(treffer: Treffer) {
    setOffen(false);
    setWert("");
    setGruppen([]);
    router.push(treffer.href);
  }

  function beiTaste(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOffen(false);
      feld.current?.blur();
      return;
    }
    if (!offen || flach.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAktiv((i) => (i + 1) % flach.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktiv((i) => (i - 1 + flach.length) % flach.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const treffer = flach[aktiv] ?? flach[0];
      if (treffer) oeffne(treffer);
    }
  }

  const zeigeListe = offen && wert.trim().length >= 2;
  let laufindex = -1;

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          ref={feld}
          type="search"
          role="combobox"
          aria-expanded={zeigeListe}
          aria-controls={listeId}
          aria-autocomplete="list"
          aria-label={t("Suche")}
          value={wert}
          onChange={(e) => {
            setWert(e.target.value);
            setOffen(true);
          }}
          onFocus={() => setOffen(true)}
          onBlur={() => setTimeout(() => setOffen(false), 150)}
          onKeyDown={beiTaste}
          placeholder={t("Suchen: Mieter, Objekt, Zimmer, Vertrag, Ticket …")}
          autoComplete="off"
          className="!pl-9 !pr-10"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-ink-200 bg-ink-50 px-1.5 text-[0.65rem] font-semibold text-ink-500 sm:block" aria-hidden="true">
          /
        </kbd>
      </div>

      {zeigeListe && (
        <div
          id={listeId}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-ink-200 bg-white p-1.5 shadow-[0_12px_40px_rgb(20_39_38/0.16)]"
        >
          {flach.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-500">{laedt ? t("Suche …") : t("Nichts gefunden.")}</p>
          ) : (
            gruppen.map((gruppe) => (
              <div key={gruppe.art} className="mb-1 last:mb-0">
                <p className="px-3 pb-0.5 pt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-ink-500">{gruppe.art}</p>
                {gruppe.treffer.map((treffer) => {
                  laufindex += 1;
                  const index = laufindex;
                  const istAktiv = index === aktiv;
                  return (
                    <button
                      key={treffer.id}
                      type="button"
                      role="option"
                      aria-selected={istAktiv}
                      onMouseEnter={() => setAktiv(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => oeffne(treffer)}
                      className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                        istAktiv ? "bg-brand-50 text-brand-900" : "text-ink-800 hover:bg-ink-50"
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium">{treffer.titel}</span>
                      <span className="min-w-0 shrink truncate text-xs text-ink-500">{treffer.untertitel}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
