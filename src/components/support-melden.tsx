"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { X } from "@phosphor-icons/react/dist/ssr";

import { createSupportTicket } from "@/app/actions/tickets";
import { BelegDatei } from "@/components/beleg-datei";
import { uebersetzeIn, type Sprache } from "@/lib/i18n-gemeinsam";

/**
 * "Stimmt was nicht?" - Meldung an die IT, von jeder Seite aus.
 *
 * Ein Fehler faellt dort auf, wo er passiert. Wer erst irgendwohin
 * navigieren muss, meldet ihn nicht mehr oder weiss nicht mehr genau, wo
 * er war. Deshalb oeffnet sich das Formular ueber der aktuellen Seite und
 * schickt still mit, welche Seite das war, wie gross das Fenster ist und
 * welcher Browser laeuft.
 *
 * Der Ausloeser ist trotzdem ein echter Link auf /tickets/support: dort
 * steht dasselbe Formular als eigene Seite, die man im neuen Tab oeffnen,
 * verschicken und als Lesezeichen behalten kann.
 */

/** Ausloeser und Blatt reden ueber dieses Ereignis miteinander. */
export const SUPPORT_EREIGNIS = "wohnwerk:support-melden";

function browserKurz(): string {
  const ua = navigator.userAgent;
  const treffer = /(Firefox|Edg|OPR|Chrome|Safari)\/([\d.]+)/.exec(ua);
  const name = treffer ? treffer[1].replace("Edg", "Edge").replace("OPR", "Opera") : "unbekannt";
  const version = treffer ? treffer[2].split(".")[0] : "";
  const system = /Android|iPhone|iPad|Macintosh|Windows|Linux/.exec(ua)?.[0] ?? "";
  return [`${name} ${version}`.trim(), system].filter(Boolean).join(" · ");
}

/**
 * Das Meldeformular. Steht einmal im Layout und liegt still, bis ein
 * Ausloeser es ruft.
 */
export function SupportBlatt({ sprache }: { sprache: Sprache }) {
  const pathname = usePathname();
  const t = uebersetzeIn(sprache);
  const [offen, setOffen] = useState(false);
  const [umgebung, setUmgebung] = useState({ seite: "", fenster: "", browser: "" });
  const erstesFeld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const auf = () => setOffen(true);
    window.addEventListener(SUPPORT_EREIGNIS, auf);
    return () => window.removeEventListener(SUPPORT_EREIGNIS, auf);
  }, []);

  // Beim Seitenwechsel schliesst sich das Blatt von selbst.
  useEffect(() => setOffen(false), [pathname]);

  // Esc schliesst, der Hintergrund scrollt nicht mit, und die Umgebung
  // wird erst beim Oeffnen gelesen - dann stimmt sie auch.
  useEffect(() => {
    if (!offen) return;
    setUmgebung({
      seite: window.location.pathname + window.location.search,
      fenster: `${window.innerWidth}×${window.innerHeight}`,
      browser: browserKurz(),
    });

    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOffen(false);
    };
    document.addEventListener("keydown", beiTaste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    erstesFeld.current?.focus();
    return () => {
      document.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [offen]);

  if (!offen) return null;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label={t("Problem melden")}
    >
      <button
        type="button"
        aria-label={t("Schließen")}
        onClick={() => setOffen(false)}
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px] motion-safe:animate-[einblenden_150ms_ease-out]"
      />

      {/* Am Handy von unten, am Schreibtisch mittig. */}
      <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-[0_-8px_40px_rgb(20_39_38/0.2)] motion-safe:animate-[hochschieben_200ms_cubic-bezier(0.16,1,0.3,1)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink-300 sm:hidden" aria-hidden="true" />

        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.98rem] font-semibold text-ink-900">{t("Problem melden")}</p>
            <p className="mt-0.5 text-[0.8rem] leading-relaxed text-ink-500">
              {t("Stimmt etwas in dieser Anwendung nicht? Die Meldung geht an die IT.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOffen(false)}
            aria-label={t("Schließen")}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
          >
            <X size={18} />
          </button>
        </div>

        <form action={createSupportTicket} encType="multipart/form-data" className="grid gap-3">
          <input type="hidden" name="back" value={pathname} />
          <input type="hidden" name="seite" value={umgebung.seite} />
          <input type="hidden" name="fenster" value={umgebung.fenster} />
          <input type="hidden" name="browser" value={umgebung.browser} />

          <div className="min-w-0">
            <label htmlFor="support-titel">{t("Was stimmt nicht?")}</label>
            <input
              ref={erstesFeld}
              id="support-titel"
              name="titel"
              required
              placeholder={t("z. B. Beleg lässt sich nicht speichern")}
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="support-text">{t("Was haben Sie gemacht?")}</label>
            <textarea
              id="support-text"
              name="beschreibung"
              rows={4}
              placeholder={t("Welcher Schritt, was war erwartet, was kam stattdessen?")}
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="support-prioritaet">{t("Dringlichkeit")}</label>
            <select id="support-prioritaet" name="prioritaet" defaultValue="NORMAL">
              <option value="NIEDRIG">{t("Niedrig")}</option>
              <option value="NORMAL">{t("Normal")}</option>
              <option value="HOCH">{t("Hoch")}</option>
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="datei">{t("Bildschirmfoto")}</label>
            <BelegDatei name="datei" required={false} />
          </div>

          {/* Offenlegen, was mitgeht - niemand soll raten muessen. */}
          {umgebung.seite && (
            <p className="text-[0.72rem] leading-relaxed text-ink-500">
              {t("Mitgeschickt wird:")} {umgebung.seite} · {umgebung.fenster} · {umgebung.browser}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary">
              {t("Meldung senden")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOffen(false)}>
              {t("Abbrechen")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Der Knopf, der das Blatt oeffnet. Darf mehrfach vorkommen - in der
 * Seitenleiste und im Plus-Menue am Handy. Als Link gebaut, damit
 * Strg-Klick und "in neuem Tab oeffnen" auf der Seite landen statt ins
 * Leere zu greifen.
 */
export function SupportAusloeser({
  children,
  className,
  onNavigate,
}: {
  children: React.ReactNode;
  className?: string;
  /** Wird zusaetzlich aufgerufen, damit sich z. B. das Plus-Menue schliesst. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <Link
      href={`/tickets/support?von=${encodeURIComponent(pathname)}`}
      onClick={(event) => {
        // Mit JavaScript bleibt man auf der Seite, um die es geht.
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        onNavigate?.();
        window.dispatchEvent(new Event(SUPPORT_EREIGNIS));
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
