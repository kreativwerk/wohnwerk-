"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Zeile = { name: string; zustand: "wartet" | "laeuft" | "ok" | "doppelt" | "fehler"; text?: string };

/**
 * Viele Belege auf einmal: alle Dateien auswaehlen, die Seite schickt sie
 * nacheinander - jede einzeln, damit keine an der Groessengrenze scheitert.
 */
export function SammelUpload({ texte }: { texte: Record<string, string> }) {
  const router = useRouter();
  const feld = useRef<HTMLInputElement>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laeuft, setLaeuft] = useState(false);

  async function hochladen() {
    const dateien = Array.from(feld.current?.files ?? []);
    if (dateien.length === 0) return;
    setLaeuft(true);
    setZeilen(dateien.map((d) => ({ name: d.name, zustand: "wartet" })));
    for (let i = 0; i < dateien.length; i += 1) {
      setZeilen((z) => z.map((zeile, j) => (j === i ? { ...zeile, zustand: "laeuft" } : zeile)));
      const form = new FormData();
      form.append("datei", dateien[i]);
      let neu: Zeile;
      try {
        const antwort = await fetch("/api/belege/sammel", { method: "POST", body: form });
        const daten = (await antwort.json().catch(() => ({}))) as { ok?: boolean; doppelt?: boolean; meldung?: string };
        neu = {
          name: dateien[i].name,
          zustand: !antwort.ok || !daten.ok ? "fehler" : daten.doppelt ? "doppelt" : "ok",
          text: daten.meldung ?? (antwort.ok ? "" : `Fehler ${antwort.status}`),
        };
      } catch {
        neu = { name: dateien[i].name, zustand: "fehler", text: texte.netz };
      }
      setZeilen((z) => z.map((zeile, j) => (j === i ? neu : zeile)));
    }
    setLaeuft(false);
    if (feld.current) feld.current.value = "";
    router.refresh();
  }

  const fertig = zeilen.filter((z) => z.zustand === "ok" || z.zustand === "doppelt").length;

  return (
    <div className="space-y-3">
      <input ref={feld} type="file" multiple accept="application/pdf,image/*" aria-label={texte.auswahl} disabled={laeuft} />
      <button type="button" className="btn btn-primary w-full" onClick={() => void hochladen()} disabled={laeuft}>
        {laeuft ? `${texte.laeuft} (${fertig}/${zeilen.length})` : texte.knopf}
      </button>
      {zeilen.length > 0 && (
        <ul className="max-h-72 divide-y divide-ink-200/70 overflow-y-auto rounded-lg border border-ink-200 text-xs">
          {zeilen.map((z, i) => (
            <li key={`${z.name}-${i}`} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0 truncate">{z.name}</span>
              <span
                className={`shrink-0 ${
                  z.zustand === "ok" ? "text-emerald-700" : z.zustand === "fehler" ? "text-rose-700" : z.zustand === "doppelt" ? "text-ink-500" : "text-ink-400"
                }`}
              >
                {z.zustand === "wartet" ? "…" : z.zustand === "laeuft" ? "⇡" : z.zustand === "ok" ? `✓ ${z.text ?? ""}` : z.zustand === "doppelt" ? texte.doppelt : `✗ ${z.text ?? ""}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
