"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import { useOberflaeche } from "./sprache-kontext";

/**
 * Suchfeld ueber einer Liste, das beim Tippen filtert - ohne Enter, ohne
 * Server. Die Liste kommt fertig vom Server als Kind; hier werden nur
 * Zeilen ein- und ausgeblendet, deren Text nicht zur Eingabe passt.
 * Jedes Wort der Eingabe muss vorkommen, Gross-/Kleinschreibung und
 * Akzente sind egal ("muller" findet "Müller"). Gruppen ohne sichtbare
 * Zeile (z. B. ein Objekt bei den Mieteingaengen) verschwinden mit.
 */
export function ListenFilter({
  children,
  placeholder,
  zeilen = "tbody tr",
  gruppen,
  className = "",
}: {
  children: React.ReactNode;
  placeholder?: string;
  /** CSS-Selektor der Zeilen innerhalb des Bereichs. */
  zeilen?: string;
  /** CSS-Selektor der Gruppen, die ohne sichtbare Zeile ausgeblendet werden. */
  gruppen?: string;
  className?: string;
}) {
  const { t } = useOberflaeche();
  const id = useId();
  const bereich = useRef<HTMLDivElement>(null);
  const [wert, setWert] = useState("");
  const [stand, setStand] = useState<{ sichtbar: number; gesamt: number } | null>(null);

  useEffect(() => {
    const wurzel = bereich.current;
    if (!wurzel) return;
    const woerter = normalisiere(wert).split(/\s+/).filter(Boolean);

    const alle = Array.from(wurzel.querySelectorAll<HTMLElement>(zeilen));
    // Nur die aeussersten Treffer zaehlen - eine Liste in einer Zeile ist keine eigene Zeile.
    const reihen = alle.filter((el) => !alle.some((anderes) => anderes !== el && anderes.contains(el)));

    let sichtbar = 0;
    for (const reihe of reihen) {
      const text = normalisiere(reihe.textContent ?? "");
      const passt = woerter.every((w) => text.includes(w));
      reihe.style.display = passt ? "" : "none";
      if (passt) sichtbar += 1;
    }

    if (gruppen) {
      for (const gruppe of Array.from(wurzel.querySelectorAll<HTMLElement>(gruppen))) {
        const eigene = reihen.filter((r) => gruppe.contains(r));
        if (eigene.length === 0) continue;
        gruppe.style.display = eigene.some((r) => r.style.display !== "none") ? "" : "none";
      }
    }

    setStand(woerter.length > 0 ? { sichtbar, gesamt: reihen.length } : null);
  }, [wert, zeilen, gruppen, children]);

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input
            id={id}
            type="search"
            value={wert}
            onChange={(e) => setWert(e.target.value)}
            placeholder={placeholder ?? t("Liste filtern – tippen genügt")}
            aria-label={placeholder ?? t("Liste filtern")}
            autoComplete="off"
            className="!pl-9"
          />
        </div>
        {stand && (
          <span className="text-sm tabular-nums text-ink-500" role="status">
            {stand.sichtbar === 0
              ? t("Kein Eintrag passt zu „{text}“.", { text: wert.trim() })
              : t("{sichtbar} von {gesamt}", { sichtbar: stand.sichtbar, gesamt: stand.gesamt })}
          </span>
        )}
      </div>
      <div ref={bereich}>{children}</div>
    </div>
  );
}

function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}
