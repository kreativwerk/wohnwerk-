"use client";

import { useEffect, useState } from "react";

/**
 * Laufender Countdown bis zu einem Zeitpunkt: "3 Tage 14 Std 22 Min".
 * Die Einheiten kommen uebersetzt vom Server.
 */
export function Countdown({
  ziel,
  einheiten,
  faelligText,
}: {
  ziel: string;
  einheiten: { tage: string; tag: string; std: string; min: string };
  faelligText: string;
}) {
  const [jetzt, setJetzt] = useState<number | null>(null);

  useEffect(() => {
    setJetzt(Date.now());
    const timer = setInterval(() => setJetzt(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const rest = (jetzt === null ? 0 : new Date(ziel).getTime() - jetzt) / 60_000;
  if (jetzt !== null && rest <= 0) {
    return <span className="text-2xl font-semibold text-emerald-700">{faelligText}</span>;
  }
  const tage = Math.floor(rest / (60 * 24));
  const stunden = Math.floor((rest % (60 * 24)) / 60);
  const minuten = Math.floor(rest % 60);

  const teil = (zahl: number, einheit: string) => (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-3xl font-semibold tabular-nums text-ink-900 sm:text-4xl">{jetzt === null ? "–" : zahl}</span>
      <span className="text-sm text-ink-500">{einheit}</span>
    </span>
  );

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
      {teil(tage, tage === 1 ? einheiten.tag : einheiten.tage)}
      {teil(stunden, einheiten.std)}
      {teil(minuten, einheiten.min)}
    </span>
  );
}
