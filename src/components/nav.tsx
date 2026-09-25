"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Bell,
  Buildings,
  CalendarBlank,
  CurrencyEur,
  Gear,
  List,
  ListChecks,
  PencilSimpleLine,
  Lifebuoy,
  Receipt,
  SquaresFour,
  TrayArrowDown,
  TrayArrowUp,
  User,
  Vault,
  WarningCircle,
  Wrench,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { LogoMark, LogoNavbar } from "./logo";
import { SupportAusloeser } from "./support-melden";
import { uebersetzeIn, type Sprache } from "@/lib/i18n-gemeinsam";

const NAV: Array<{ group: string; items: Array<{ href: string; label: string; icon: PhosphorIcon }> }> = [
  {
    group: "Übersicht",
    items: [
      { href: "/", label: "Dashboard", icon: SquaresFour },
      { href: "/belegung", label: "Belegungsplan", icon: CalendarBlank },
    ],
  },
  {
    group: "Vermietung",
    items: [
      { href: "/objekte", label: "Objekte", icon: Buildings },
      { href: "/mieter", label: "Mieter", icon: User },
      { href: "/vertraege", label: "Mietverträge", icon: PencilSimpleLine },
      { href: "/tickets", label: "Tickets", icon: Wrench },
    ],
  },
  {
    group: "Buchhaltung",
    items: [
      { href: "/buchhaltung", label: "Buchungen", icon: CurrencyEur },
      { href: "/buchhaltung/kontoauszuege", label: "Kontoauszüge", icon: TrayArrowUp },
      { href: "/buchhaltung/mieteingaenge", label: "Mieteingänge", icon: ListChecks },
      { href: "/buchhaltung/kautionen", label: "Kautionen", icon: Vault },
      { href: "/buchhaltung/belege", label: "Belege", icon: Receipt },
      { href: "/buchhaltung/rueckstaende", label: "Rückstände", icon: WarningCircle },
      { href: "/buchhaltung/offene-posten", label: "Offene Posten", icon: Bell },
      { href: "/buchhaltung/export", label: "Steuerberater", icon: TrayArrowDown },
    ],
  },
  {
    group: "System",
    items: [{ href: "/einstellungen", label: "Einstellungen", icon: Gear }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/buchhaltung") return pathname === "/buchhaltung";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  user,
  sprache,
  sprachwahl,
}: {
  user: { name: string; email: string; role: string };
  sprache: Sprache;
  /** Der Sprachschalter ist eine Server-Komponente und wird hereingereicht. */
  sprachwahl?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Client-Komponente: die Sprache kommt vom Layout, uebersetzt wird hier.
  const t = uebersetzeIn(sprache);

  // Ein Steuerberater-Konto sieht nur die Buchhaltung; die Startseite ist
  // dann die Buchungsuebersicht statt des Dashboards.
  const sections =
    user.role === "steuerberater"
      ? NAV.filter((section) => section.group === "Buchhaltung")
      : NAV;

  // Beim Seitenwechsel schliesst sich das mobile Menue von selbst.
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <Link href="/" aria-label={t("Zum Dashboard")}>
          <LogoNavbar className="h-9 w-auto" />
        </Link>
        <p className="mt-2.5 text-[0.7rem] tracking-wide text-brand-300">{t("Monteurunterkünfte")}</p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.group}>
            <p className="px-3 pb-2 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-brand-400">
              {t(section.group)}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-[0.6rem] px-3 py-2 text-[0.875rem] transition-colors duration-150 ${
                        active
                          ? "bg-white/[0.09] font-medium text-white"
                          : "text-brand-200/80 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      {/* Der orange Strich markiert die aktive Seite, ohne
                          eine zweite Flaeche einzufuehren. */}
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500 transition-opacity duration-150 ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <item.icon
                        size={19}
                        weight={active ? "fill" : "regular"}
                        className={active ? "text-accent-400" : "text-brand-400 group-hover:text-brand-200"}
                      />
                      {t(item.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.08] px-5 py-4">
        {sprachwahl && <div className="mb-3">{sprachwahl}</div>}
        <p className="truncate text-[0.82rem] font-medium text-white">{user.name}</p>
        <p className="truncate text-[0.72rem] text-brand-400">{user.email}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-[0.76rem] font-medium text-brand-300 transition-colors hover:text-white"
            >
              {t("Abmelden")}
            </button>
          </form>
          {/* Stimmt etwas an der Anwendung nicht, geht die Meldung von hier
              aus direkt an die IT - ohne die Seite zu verlassen. Tickets
              sind der Verwaltung vorbehalten, der Knopf deshalb auch. */}
          {user.role !== "steuerberater" && (
          <SupportAusloeser className="inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-brand-300 transition-colors hover:text-white">
            <Lifebuoy size={15} />
            {t("Problem melden")}
          </SupportAusloeser>
          )}
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobil: Kopfzeile, die beim Scrollen stehen bleibt. */}
      <div className="glass-dark sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5" aria-label={t("Zum Dashboard")}>
          <LogoMark className="h-6 w-auto" />
          <span className="text-sm font-semibold tracking-tight text-white">Wohnwerk</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={t("Menü umschalten")}
          className="flex h-9 w-9 items-center justify-center rounded-[0.6rem] text-brand-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          {open ? <X size={20} /> : <List size={20} />}
        </button>
      </div>

      {open && <div className="bg-brand-950 lg:hidden">{nav}</div>}

      <aside className="hidden w-[15.5rem] shrink-0 bg-brand-950 lg:block">
        <div className="sticky top-0 h-screen">{nav}</div>
      </aside>
    </>
  );
}
