"use client";

import { useState } from "react";
import { zipSync } from "fflate";

import { useOberflaeche } from "./sprache-kontext";

type Datei = { url: string; zipPfad: string };

/**
 * Laedt alle abgelegten Mietvertraege einzeln aus der Ablage und packt sie im
 * Browser zu einer ZIP-Datei - so gibt es keine Groessengrenze am Server.
 * Optional kommt die Fehlliste als PDF mit hinein.
 */
export function VertraegeZip({ dateien, fehllisteUrl, dateiname }: { dateien: Datei[]; fehllisteUrl: string; dateiname: string }) {
  const { t } = useOberflaeche();
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);

  async function herunterladen() {
    setFehler([]);
    const inhalt: Record<string, Uint8Array> = {};
    const fehlgeschlagen: string[] = [];
    const gesamt = dateien.length + 1;
    let fertig = 0;
    setFortschritt({ fertig, gesamt });

    // Mehrere gleichzeitig, aber nicht alle auf einmal.
    const warteschlange = [...dateien];
    async function arbeiter() {
      for (let d = warteschlange.shift(); d; d = warteschlange.shift()) {
        try {
          const antwort = await fetch(d.url, { credentials: "same-origin" });
          if (!antwort.ok) throw new Error(String(antwort.status));
          inhalt[d.zipPfad] = new Uint8Array(await antwort.arrayBuffer());
        } catch {
          fehlgeschlagen.push(d.zipPfad);
        }
        fertig += 1;
        setFortschritt({ fertig, gesamt });
      }
    }
    await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);

    try {
      const liste = await fetch(fehllisteUrl, { credentials: "same-origin" });
      if (liste.ok) inhalt["Fehlende Mietverträge.pdf"] = new Uint8Array(await liste.arrayBuffer());
    } catch {
      // Die Liste gibt es auch einzeln - die ZIP soll daran nicht scheitern.
    }
    setFortschritt({ fertig: gesamt, gesamt });

    // PDFs sind schon komprimiert: nur ablegen, nicht noch einmal packen.
    const zip = zipSync(inhalt, { level: 0 });
    const blob = new Blob([zip as BlobPart], { type: "application/zip" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = dateiname;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    setFehler(fehlgeschlagen);
    setFortschritt(null);
  }

  const laeuft = fortschritt !== null;
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={laeuft || dateien.length === 0} onClick={herunterladen}>
        {laeuft
          ? t("Lädt … {fertig} von {gesamt}", { fertig: fortschritt.fertig, gesamt: fortschritt.gesamt })
          : t("Alle Mietverträge herunterladen (ZIP)")}
      </button>
      {laeuft && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round((fortschritt.fertig / fortschritt.gesamt) * 100)}%` }} />
        </div>
      )}
      {fehler.length > 0 && (
        <p className="text-xs text-rose-700">
          {t("{anzahl} Datei(en) konnten nicht geladen werden:", { anzahl: fehler.length })} {fehler.join(", ")}
        </p>
      )}
    </div>
  );
}
