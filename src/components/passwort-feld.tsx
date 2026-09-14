"use client";

import { useId, useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react/dist/ssr";

/**
 * Passwortfeld mit Auge-Schalter.
 *
 * Auf dem Handy vertippt man sich in einem Feld, das nur Punkte zeigt,
 * schnell - und merkt es erst an der Fehlermeldung. Der Schalter blendet
 * das Passwort ein, solange man hinsieht.
 *
 * Ohne JavaScript bleibt das Feld ein normales Passwortfeld: der Schalter
 * ist dann wirkungslos, die Anmeldung funktioniert trotzdem.
 */
export function PasswortFeld({
  name = "password",
  label = "Passwort",
  anzeigenLabel = "Passwort anzeigen",
  verbergenLabel = "Passwort verbergen",
  autoComplete = "current-password",
  required = true,
  autoFocus = false,
}: {
  name?: string;
  label?: string;
  /** Beschriftungen kommen von aussen, damit das Feld zweisprachig ist. */
  anzeigenLabel?: string;
  verbergenLabel?: string;
  autoComplete?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [sichtbar, setSichtbar] = useState(false);

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={sichtbar ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          // Platz fuer den Schalter, damit lange Passwoerter nicht darunter
          // laufen. Das Ausrufezeichen ist noetig: die Eingabefeld-Regel in
          // globals.css setzt padding ueber acht :not()-Bedingungen und ist
          // damit staerker als eine einzelne Utility-Klasse.
          className="pr-12!"
        />
        <button
          type="button"
          onClick={() => setSichtbar((wert) => !wert)}
          aria-pressed={sichtbar}
          aria-label={sichtbar ? verbergenLabel : anzeigenLabel}
          title={sichtbar ? verbergenLabel : anzeigenLabel}
          // -translate-y-1/2 statt inset-y-0: der Schalter bleibt mittig,
          // auch wenn das Feld am Handy hoeher ist.
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {sichtbar ? <EyeSlash size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </div>
  );
}
