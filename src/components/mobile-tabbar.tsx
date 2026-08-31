"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  CalendarBlank,
  Camera,
  CurrencyEur,
  ListChecks,
  Plus,
  Receipt,
  SquaresFour,
  TrayArrowUp,
  UserPlus,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

/**
 * Schwebende Menueleiste fuer das Handy.
 *
 * Am Schreibtisch fuehrt die Seitenleiste durch die Anwendung; unterwegs
 * braucht es den Daumen. Vier Ziele links und rechts, in der Mitte das
 * groessere Plus fuer das, was man unterwegs tatsaechlich tut: einen Beleg
 * fotografieren, eine Miete abhaken, einen Mieter anlegen.
 *
 * Die Leiste schwebt ueber dem Inhalt, haelt Abstand zur Home-Anzeige des
 * Geraets (safe-area) und erscheint nur unterhalb von lg.
 */

type Ziel = { href: string; label: string; icon: PhosphorIcon };

const LINKS: Ziel[] = [
  { href: "/", label: "Übersicht", icon: SquaresFour },
  { href: "/belegung", label: "Belegung", icon: CalendarBlank },
];

const RECHTS: Ziel[] = [
  { href: "/buchhaltung/mieteingaenge", label: "Mieten", icon: ListChecks },
  { href: "/buchhaltung/belege", label: "Belege", icon: Receipt },
];

/** Fuer den Steuerberater: nur Buchhaltung, kein Plus. */
const KANZLEI: Ziel[] = [
  { href: "/buchhaltung", label: "Buchungen", icon: CurrencyEur },
  { href: "/buchhaltung/belege", label: "Belege", icon: Receipt },
  { href: "/buchhaltung/offene-posten", label: "Offene Posten", icon: ListChecks },
  { href: "/buchhaltung/export", label: "Export", icon: TrayArrowUp },
];

const AKTIONEN = [
  {
    href: "/buchhaltung/belege#beleg-hochladen",
    label: "Beleg fotografieren",
    hinweis: "Quittung direkt mit der Kamera erfassen",
    icon: Camera,
  },
  {
    href: "/buchhaltung/mieteingaenge",
    label: "Miete abhaken",
    hinweis: "Eingegangene Mieten des Monats bestätigen",
    icon: ListChecks,
  },
  {
    href: "/mieter/neu",
    label: "Mieter anlegen",
    hinweis: "Neuer Monteur mit Bett und Vertrag",
    icon: UserPlus,
  },
  {
    href: "/buchhaltung/kontoauszuege",
    label: "Kontoauszug einlesen",
    hinweis: "PDF oder CSV der Bank hochladen",
    icon: TrayArrowUp,
  },
];

function istAktiv(pathname: string, href: string): boolean {
  const ziel = href.split("#")[0];
  if (ziel === "/") return pathname === "/";
  if (ziel === "/buchhaltung") return pathname === "/buchhaltung";
  return pathname === ziel || pathname.startsWith(`${ziel}/`);
}

function Tab({ ziel, aktiv }: { ziel: Ziel; aktiv: boolean }) {
  return (
    <Link
      href={ziel.href}
      aria-current={aktiv ? "page" : undefined}
      className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${
        aktiv ? "text-accent-600" : "text-ink-500 active:bg-ink-100"
      }`}
    >
      <ziel.icon size={22} weight={aktiv ? "fill" : "regular"} />
      <span className="w-full truncate text-center text-[0.63rem] font-medium leading-tight">
        {ziel.label}
      </span>
    </Link>
  );
}

export function MobileTabBar({ role }: { role: string }) {
  const pathname = usePathname();
  const [offen, setOffen] = useState(false);
  const ersterEintrag = useRef<HTMLAnchorElement>(null);

  // Beim Seitenwechsel schliesst sich das Aktionsblatt von selbst.
  useEffect(() => setOffen(false), [pathname]);

  // Esc schliesst, und der Hintergrund scrollt nicht mit.
  useEffect(() => {
    if (!offen) return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOffen(false);
    };
    document.addEventListener("keydown", beiTaste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ersterEintrag.current?.focus();
    return () => {
      document.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [offen]);

  const kanzlei = role === "steuerberater";

  return (
    <>
      {offen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Schnellaktionen">
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => setOffen(false)}
            className="absolute inset-0 bg-ink-900/45 backdrop-blur-[2px] motion-safe:animate-[einblenden_150ms_ease-out]"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[calc(6.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgb(20_39_38/0.18)] motion-safe:animate-[hochschieben_200ms_cubic-bezier(0.16,1,0.3,1)]">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink-300" aria-hidden="true" />
            <p className="px-1 pb-2 text-[0.82rem] font-semibold text-ink-900">Schnell erledigen</p>
            <ul className="space-y-1">
              {AKTIONEN.map((aktion, index) => (
                <li key={aktion.href}>
                  <Link
                    ref={index === 0 ? ersterEintrag : undefined}
                    href={aktion.href}
                    onClick={() => setOffen(false)}
                    className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-ink-100"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                      <aktion.icon size={21} weight="regular" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.9rem] font-medium text-ink-900">{aktion.label}</span>
                      <span className="block truncate text-[0.75rem] text-ink-500">{aktion.hinweis}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="Schnellzugriff"
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-center gap-0.5 rounded-2xl border border-ink-200/80 bg-white/95 px-1.5 py-1.5 shadow-[0_6px_28px_rgb(20_39_38/0.18)] backdrop-blur-xl backdrop-saturate-150">
          {kanzlei ? (
            KANZLEI.map((ziel) => <Tab key={ziel.href} ziel={ziel} aktiv={istAktiv(pathname, ziel.href)} />)
          ) : (
            <>
              {LINKS.map((ziel) => (
                <Tab key={ziel.href} ziel={ziel} aktiv={istAktiv(pathname, ziel.href)} />
              ))}

              {/* Das Plus ist bewusst groesser: es ist der Grund, warum man
                  die Anwendung unterwegs ueberhaupt oeffnet. */}
              <button
                type="button"
                onClick={() => setOffen((wert) => !wert)}
                aria-expanded={offen}
                aria-label={offen ? "Schnellaktionen schließen" : "Schnellaktionen öffnen"}
                className="-mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-500 text-white shadow-[0_6px_20px_rgb(238_86_39/0.42)] ring-4 ring-white transition-transform active:scale-95"
              >
                {offen ? <X size={26} weight="bold" /> : <Plus size={26} weight="bold" />}
              </button>

              {RECHTS.map((ziel) => (
                <Tab key={ziel.href} ziel={ziel} aktiv={istAktiv(pathname, ziel.href)} />
              ))}
            </>
          )}
        </div>
      </nav>
    </>
  );
}
