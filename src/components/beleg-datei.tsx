"use client";

import { useRef, useState } from "react";

/**
 * Dateiauswahl fuer Belege - unterwegs mit der Kamera.
 *
 * Auf dem Handy oeffnet "Foto aufnehmen" direkt die Kamera; am Rechner
 * bleibt die gewohnte Dateiauswahl. Fotos aus Handykameras sind oft
 * 5-12 MB gross und landen sonst unveraendert in der Datenbank - deshalb
 * werden sie vor dem Hochladen auf eine lesbare Groesse gebracht. Geht
 * dabei etwas schief, wird das Original genommen: lieber gross als gar
 * nicht.
 *
 * Das Eingabefeld bleibt sichtbar, damit das Formular auch ohne
 * JavaScript benutzbar ist.
 */

const ALLE_ARTEN = ".pdf,.png,.jpg,.jpeg,.webp,.heic";
const MAX_KANTE = 2200; // reicht, um Kleingedrucktes auf einem Bon zu lesen
const QUALITAET = 0.82;

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function verkleinern(datei: File): Promise<File> {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
  // Kleine Bilder bleiben unangetastet - erneutes Kodieren macht sie nur schlechter.
  if (faktor === 1 && datei.size < 1_500_000) {
    bild.close();
    return datei;
  }

  const breite = Math.round(bild.width * faktor);
  const hoehe = Math.round(bild.height * faktor);
  const leinwand = document.createElement("canvas");
  leinwand.width = breite;
  leinwand.height = hoehe;
  const stift = leinwand.getContext("2d");
  if (!stift) {
    bild.close();
    return datei;
  }
  stift.drawImage(bild, 0, 0, breite, hoehe);
  bild.close();

  const blob = await new Promise<Blob | null>((fertig) =>
    leinwand.toBlob(fertig, "image/jpeg", QUALITAET),
  );
  if (!blob || blob.size >= datei.size) return datei;

  const name = datei.name.replace(/\.[^.]+$/, "") || "beleg";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export function BelegDatei({ name = "file", required = true }: { name?: string; required?: boolean }) {
  const feld = useRef<HTMLInputElement>(null);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  function oeffnen(mitKamera: boolean) {
    const el = feld.current;
    if (!el) return;
    if (mitKamera) {
      el.setAttribute("capture", "environment");
      el.setAttribute("accept", "image/*");
    } else {
      el.removeAttribute("capture");
      el.setAttribute("accept", ALLE_ARTEN);
    }
    el.click();
  }

  async function beiAuswahl() {
    const el = feld.current;
    const datei = el?.files?.[0];
    if (!el || !datei) {
      setVorschau(null);
      setHinweis(null);
      return;
    }

    if (!datei.type.startsWith("image/")) {
      setVorschau(null);
      setHinweis(`${datei.name} · ${mb(datei.size)}`);
      return;
    }

    setLaeuft(true);
    try {
      const klein = await verkleinern(datei);
      if (klein !== datei) {
        const behaelter = new DataTransfer();
        behaelter.items.add(klein);
        el.files = behaelter.files;
      }
      setVorschau(URL.createObjectURL(klein));
      setHinweis(
        klein === datei
          ? `Foto · ${mb(datei.size)}`
          : `Foto verkleinert · ${mb(datei.size)} → ${mb(klein.size)}`,
      );
    } catch {
      // Ohne Verkleinerung geht es auch - nur eben groesser.
      setVorschau(URL.createObjectURL(datei));
      setHinweis(`Foto · ${mb(datei.size)}`);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => oeffnen(true)}>
          Foto aufnehmen
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => oeffnen(false)}>
          Datei wählen
        </button>
      </div>

      <input
        ref={feld}
        id={name}
        name={name}
        type="file"
        required={required}
        accept={ALLE_ARTEN}
        onChange={beiAuswahl}
        className="mt-2"
      />

      {laeuft && <p className="field-hint">Foto wird vorbereitet …</p>}

      {vorschau && (
        <div className="mt-2 overflow-hidden rounded-lg border border-ink-200">
          {/* Ortsbezogene Vorschau aus dem Browser - kein externes Bild. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={vorschau} alt="Vorschau des aufgenommenen Belegs" className="max-h-56 w-full object-contain" />
        </div>
      )}

      {hinweis && <p className="field-hint">{hinweis}</p>}
    </div>
  );
}
