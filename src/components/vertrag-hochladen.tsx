"use client";

import { useRef, useState } from "react";

import { unterschriebenenVertragHochladen } from "@/app/actions/contracts";
import { useOberflaeche } from "./sprache-kontext";

/** Bis hierhin geht alles in einer Anfrage (Vercel: 4,5 MB) - darueber in Stuecken. */
const GRENZE = 3.5 * 1024 * 1024;
const STUECK = 3 * 1024 * 1024;
/** Obergrenze fuer einen Vertrag insgesamt. */
const MAXIMAL = 40 * 1024 * 1024;

/** Fotos auf hoechstens 2000 px verkleinern (JPEG) - Handyfotos sind sonst zu gross. */
async function verkleinern(datei: File): Promise<File> {
  if (!datei.type.startsWith("image/") || datei.size < 700 * 1024) return datei;
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, 2000 / Math.max(bild.width, bild.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bild.width * faktor);
  canvas.height = Math.round(bild.height * faktor);
  canvas.getContext("2d")!.drawImage(bild, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
  return blob ? new File([blob], datei.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : datei;
}

/**
 * Unterschriebenen Papiervertrag hochladen: PDF oder Fotos (mehrere Seiten
 * moeglich). Der Server fuegt alles zu einem PDF zusammen.
 */
export function VertragHochladen({
  tenancyId,
  zurueck,
  kompakt = false,
}: {
  tenancyId: string;
  zurueck: string;
  /** Nur ein Button: Dateien waehlen, sofort hochladen (fuer Tabellenzeilen). */
  kompakt?: boolean;
}) {
  const { t } = useOberflaeche();
  const eingabe = useRef<HTMLInputElement>(null);
  const formular = useRef<HTMLFormElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function absenden(formData: FormData) {
    setFehler(null);
    const original = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (original.length === 0) {
      setFehler(t("Bitte eine Datei auswählen."));
      return;
    }
    setLaeuft(true);
    const dateien = await Promise.all(original.map(verkleinern));
    const groesse = dateien.reduce((s, d) => s + d.size, 0);
    if (groesse > MAXIMAL) {
      setLaeuft(false);
      setFehler(t("Zusammen zu groß ({mb} MB). Bitte weniger Seiten auf einmal oder ein kleineres PDF.", { mb: (groesse / 1024 / 1024).toFixed(1) }));
      return;
    }
    formData.delete("files");
    if (groesse <= GRENZE) {
      for (const d of dateien) formData.append("files", d);
    } else {
      // Gross: in Stuecken vorab hochladen, dann nur die Liste mitschicken.
      try {
        const teile: Array<{ id: string; name: string; typ: string }> = [];
        for (const d of dateien) {
          const id = crypto.randomUUID();
          for (let nr = 0, start = 0; start < d.size; nr += 1, start += STUECK) {
            const antwort = await fetch(`/api/vertraege/upload-teil?id=${id}&nr=${nr}`, {
              method: "POST",
              body: d.slice(start, start + STUECK),
              credentials: "same-origin",
            });
            if (!antwort.ok) throw new Error(`Teil ${nr}: ${antwort.status}`);
          }
          teile.push({ id, name: d.name, typ: d.type });
        }
        formData.set("teile", JSON.stringify(teile));
      } catch (error) {
        console.error(error);
        setLaeuft(false);
        setFehler(t("Hochladen fehlgeschlagen. Bitte erneut versuchen – bei großen PDFs weniger Seiten auf einmal."));
        return;
      }
    }
    try {
      await unterschriebenenVertragHochladen(formData);
    } catch (error) {
      // Die Weiterleitung nach dem Erfolg ist kein Fehler.
      if (String((error as { digest?: string })?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
      console.error(error);
      setFehler(t("Hochladen fehlgeschlagen. Bitte erneut versuchen – bei großen PDFs weniger Seiten auf einmal."));
    }
    setLaeuft(false);
  }

  if (kompakt) {
    return (
      <form ref={formular} action={absenden} className="inline-block text-left">
        <input type="hidden" name="tenancyId" value={tenancyId} />
        <input type="hidden" name="zurueck" value={zurueck} />
        <label className={`btn btn-secondary btn-sm cursor-pointer ${laeuft ? "pointer-events-none opacity-60" : ""}`}>
          {laeuft ? t("Lädt hoch …") : t("Unterschrieben hochladen")}
          <input
            name="files"
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => {
              if (e.currentTarget.files?.length) formular.current?.requestSubmit();
            }}
          />
        </label>
        {fehler && <p className="mt-1 max-w-56 text-xs text-rose-700">{fehler}</p>}
      </form>
    );
  }

  return (
    <form action={absenden} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input type="hidden" name="zurueck" value={zurueck} />
      <div>
        <label className="text-xs">{t("Scan oder Fotos (mehrere Seiten möglich)")}</label>
        <input ref={eingabe} name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png" />
      </div>
      <div>
        <label className="text-xs">{t("Unterschrieben am")}</label>
        <input name="signedAt" type="date" />
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={laeuft}>
        {laeuft ? t("Lädt hoch …") : t("Hochladen")}
      </button>
      {fehler && <p className="text-xs text-rose-700 sm:col-span-3">{fehler}</p>}
    </form>
  );
}
