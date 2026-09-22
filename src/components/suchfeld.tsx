"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Suchfeld fuer Listen, das ohne Enter filtert: Beim Tippen wandert der
 * Text nach kurzer Pause in die Adresse (?q=...), die Seite laedt neu
 * gefiltert, das Feld behaelt den Fokus. Die Seitenzahl faellt dabei
 * weg - eine neue Suche beginnt auf Seite 1.
 */
export function SuchFeld({
  id = "q",
  name = "q",
  defaultValue = "",
  placeholder,
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [wert, setWert] = useState(defaultValue);
  const zuletzt = useRef(defaultValue);

  useEffect(() => {
    if (wert === zuletzt.current) return;
    const timer = setTimeout(() => {
      zuletzt.current = wert;
      const neu = new URLSearchParams(params.toString());
      if (wert.trim()) neu.set(name, wert.trim());
      else neu.delete(name);
      neu.delete("seite");
      neu.delete("page");
      const query = neu.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [wert, name, params, pathname, router]);

  return (
    <input
      id={id}
      name={name}
      type="search"
      value={wert}
      onChange={(e) => setWert(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
