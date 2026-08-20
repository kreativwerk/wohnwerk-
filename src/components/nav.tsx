"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV: Array<{ group: string; items: Array<{ href: string; label: string; icon: string }> }> = [
  {
    group: "Übersicht",
    items: [
      { href: "/", label: "Dashboard", icon: "▦" },
      { href: "/belegung", label: "Belegungsplan", icon: "▤" },
    ],
  },
  {
    group: "Vermietung",
    items: [
      { href: "/objekte", label: "Objekte", icon: "▣" },
      { href: "/mieter", label: "Mieter", icon: "☺" },
      { href: "/vertraege", label: "Mietverträge", icon: "✎" },
    ],
  },
  {
    group: "Buchhaltung",
    items: [
      { href: "/buchhaltung", label: "Buchungen", icon: "€" },
      { href: "/buchhaltung/kontoauszuege", label: "Kontoauszüge", icon: "↥" },
      { href: "/buchhaltung/belege", label: "Belege", icon: "▢" },
      { href: "/buchhaltung/offene-posten", label: "Offene Posten", icon: "!" },
      { href: "/buchhaltung/export", label: "Steuerberater", icon: "↧" },
    ],
  },
  {
    group: "System",
    items: [{ href: "/einstellungen", label: "Einstellungen", icon: "⚙" }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/buchhaltung") return pathname === "/buchhaltung";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-base font-bold text-white">
          W
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Wohnwerk</p>
          <p className="text-[0.7rem] text-ink-400">Monteurunterkünfte</p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((section) => (
          <div key={section.group}>
            <p className="px-2 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500">
              {section.group}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                        active
                          ? "bg-brand-600 font-semibold text-white"
                          : "text-ink-300 hover:bg-ink-800 hover:text-white"
                      }`}
                    >
                      <span className="w-4 text-center text-xs opacity-80">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-ink-800 px-4 py-3">
        <p className="truncate text-xs font-semibold text-white">{user.name}</p>
        <p className="truncate text-[0.7rem] text-ink-400">{user.email}</p>
        <form action="/api/auth/logout" method="post" className="mt-2">
          <button type="submit" className="text-xs font-semibold text-ink-400 hover:text-white">
            Abmelden
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobil: Kopfzeile mit Schalter */}
      <div className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-xs font-bold text-white">
            W
          </span>
          Wohnwerk
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Menü umschalten"
        >
          {open ? "Schließen" : "Menü"}
        </button>
      </div>

      {open && (
        <div className="border-b border-ink-800 bg-ink-900 lg:hidden">{nav}</div>
      )}

      <aside className="hidden w-60 shrink-0 bg-ink-900 lg:block">
        <div className="sticky top-0 h-screen">{nav}</div>
      </aside>
    </>
  );
}
