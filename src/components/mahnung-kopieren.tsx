"use client";

import { useEffect, useState } from "react";
import { Copy } from "@phosphor-icons/react/dist/ssr";

import { useOberflaeche } from "./sprache-kontext";

/**
 * Ein Knopf, der einen fertigen Text in die Zwischenablage legt.
 *
 * Der Text kommt fertig vom Server; hier passiert nur das Kopieren. Wo
 * der Browser die Zwischenablage verweigert (http, alte WebViews), klappt
 * darunter ein Feld mit dem Text auf - zum Markieren und Kopieren von
 * Hand. Lieber ein Umweg als ein stummer Knopf.
 */
export function TextKopieren({
  text,
  label,
  className = "btn btn-ghost btn-sm",
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { t } = useOberflaeche();
  const [zustand, setZustand] = useState<"bereit" | "kopiert" | "manuell">("bereit");

  useEffect(() => {
    if (zustand !== "kopiert") return;
    const timer = setTimeout(() => setZustand("bereit"), 2200);
    return () => clearTimeout(timer);
  }, [zustand]);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setZustand("kopiert");
    } catch {
      setZustand("manuell");
    }
  }

  return (
    <div className="inline-block text-left">
      <button type="button" className={className} onClick={kopieren} title={label}>
        <Copy size={15} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
        {zustand === "kopiert" ? t("Kopiert") : label}
      </button>
      {zustand === "manuell" && (
        <textarea
          readOnly
          value={text}
          rows={6}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 w-64 text-xs"
          aria-label={label}
        />
      )}
    </div>
  );
}
