"use client";

import { useRef, useState } from "react";

import { unterschriebenenVertragHochladen } from "@/app/actions/contracts";
import { useOberflaeche } from "./sprache-kontext";

/** Grenze des Servers fuer eine Anfrage - mit etwas Luft. */
const GRENZE = 4 * 1024 * 1024;

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
export function VertragHochladen({ tenancyId, zurueck }: { tenancyId: string; zurueck: string }) {
  const { t } = useOberflaeche();
  const eingabe = useRef<HTMLInputElement>(null);
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
    if (groesse > GRENZE) {
      setLaeuft(false);
      setFehler(t("Zusammen zu groß ({mb} MB). Bitte weniger Seiten auf einmal oder ein kleineres PDF.", { mb: (groesse / 1024 / 1024).toFixed(1) }));
      return;
    }
    formData.delete("files");
    for (const d of dateien) formData.append("files", d);
    await unterschriebenenVertragHochladen(formData);
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
