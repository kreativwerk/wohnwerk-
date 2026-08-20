"use client";

import { useEffect, useState } from "react";

/** Absenden mit Rückfrage – für Löschvorgänge und andere endgültige Schritte. */
export function ConfirmButton({
  children,
  message,
  className = "btn btn-danger",
  name,
  value,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Link mit Kopierschaltfläche – für den persönlichen Vertragslink. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Ohne Zwischenablage-Rechte bleibt das Feld zum manuellen Markieren.
      setCopied(false);
    }
  }

  return (
    <div>
      {label && <label>{label}</label>}
      <div className="flex gap-2">
        <input readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="btn btn-secondary shrink-0" onClick={copy}>
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
    </div>
  );
}

/**
 * Auswahl Objekt -> Zimmer -> Bett. Die Listen kommen fertig vom Server,
 * gefiltert wird im Browser, damit die Auswahl ohne Nachladen funktioniert.
 */
export type BedOption = {
  id: string;
  label: string;
  roomId: string;
  roomName: string;
  propertyId: string;
  propertyName: string;
  monthlyRentCents: number;
  occupied: boolean;
  blocked: boolean;
};

export function BedPicker({
  beds,
  defaultBedId,
  rentFieldId = "monthlyRentCents",
  required = false,
}: {
  beds: BedOption[];
  defaultBedId?: string;
  rentFieldId?: string;
  required?: boolean;
}) {
  const initial = beds.find((bed) => bed.id === defaultBedId);
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? "");
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [bedId, setBedId] = useState(initial?.id ?? "");

  const properties = Array.from(
    new Map(beds.map((bed) => [bed.propertyId, bed.propertyName])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "de"));

  const rooms = Array.from(
    new Map(
      beds.filter((bed) => bed.propertyId === propertyId).map((bed) => [bed.roomId, bed.roomName]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "de"));

  const roomBeds = beds.filter((bed) => bed.roomId === roomId);

  function selectBed(id: string) {
    setBedId(id);
    const bed = beds.find((entry) => entry.id === id);
    if (!bed) return;
    // Mietpreis des Bettes als Vorschlag in das Betragsfeld übernehmen
    const field = document.getElementById(rentFieldId) as HTMLInputElement | null;
    if (field && (!field.value || field.dataset.autofilled === "true")) {
      field.value = (bed.monthlyRentCents / 100).toFixed(2).replace(".", ",");
      field.dataset.autofilled = "true";
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor="propertyPicker">Objekt</label>
        <select
          id="propertyPicker"
          value={propertyId}
          required={required}
          onChange={(event) => {
            setPropertyId(event.target.value);
            setRoomId("");
            setBedId("");
          }}
        >
          <option value="">– bitte wählen –</option>
          {properties.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="roomPicker">Zimmer</label>
        <select
          id="roomPicker"
          value={roomId}
          required={required}
          disabled={!propertyId}
          onChange={(event) => {
            setRoomId(event.target.value);
            setBedId("");
          }}
        >
          <option value="">– bitte wählen –</option>
          {rooms.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="bedId">Bett</label>
        <select
          id="bedId"
          name="bedId"
          value={bedId}
          required={required}
          disabled={!roomId}
          onChange={(event) => selectBed(event.target.value)}
        >
          <option value="">– bitte wählen –</option>
          {roomBeds.map((bed) => (
            <option key={bed.id} value={bed.id} disabled={bed.occupied || bed.blocked}>
              {bed.label}
              {bed.occupied ? " (belegt)" : bed.blocked ? " (gesperrt)" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Aufklappbarer Bereich für Formulare, die nicht ständig sichtbar sein müssen. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-brand-700 hover:underline">
        <span className="inline-block w-4 transition group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
