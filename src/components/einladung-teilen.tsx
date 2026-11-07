"use client";

import { useState } from "react";

import { useOberflaeche } from "./sprache-kontext";

/**
 * Einladung mit dem persoenlichen Vertragslink teilen: Sprache waehlen, dann
 * per WhatsApp schicken oder den fertigen Text kopieren.
 */
export function EinladungTeilen({
  texte,
  sprachen,
  start,
  telefon,
  link,
}: {
  /** fertiger Text je Sprache (Link schon enthalten) */
  texte: Record<string, string>;
  /** [Code, Name] in der gewuenschten Reihenfolge */
  sprachen: Array<[string, string]>;
  start: string;
  /** nur Ziffern mit Laendervorwahl, z. B. 4917612345678 - oder null */
  telefon: string | null;
  link: string;
}) {
  const { t } = useOberflaeche();
  const [sprache, setSprache] = useState(start);
  const [kopiert, setKopiert] = useState<"text" | "link" | null>(null);
  const text = texte[sprache] ?? "";

  async function kopieren(wert: string, was: "text" | "link") {
    try {
      await navigator.clipboard.writeText(wert);
      setKopiert(was);
      setTimeout(() => setKopiert(null), 1800);
    } catch {
      setKopiert(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Sprache")}>
        {sprachen.map(([code, name]) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={code === sprache}
            onClick={() => setSprache(code)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
              code === sprache ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-50"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 font-sans text-xs leading-relaxed text-ink-800 ring-1 ring-inset ring-ink-200">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2">
        {telefon ? (
          <a
            href={`https://wa.me/${telefon}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            {t("Per WhatsApp senden")}
          </a>
        ) : (
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn btn-primary">
            {t("In WhatsApp öffnen")}
          </a>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => kopieren(text, "text")}>
          {kopiert === "text" ? t("Kopiert") : t("Text kopieren")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => kopieren(link, "link")}>
          {kopiert === "link" ? t("Kopiert") : t("Nur Link kopieren")}
        </button>
      </div>
    </div>
  );
}
