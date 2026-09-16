"use client";

import { createContext, useContext, useMemo } from "react";

import { oberflaecheIn, type Oberflaeche, type Sprache } from "@/lib/i18n-gemeinsam";

/**
 * Die gewaehlte Sprache fuer Client-Komponenten.
 *
 * Server-Komponenten holen sie sich mit `await oberflaeche()` aus dem
 * Cookie. Im Browser geht das nicht, und die Sprache durch jede Ebene zu
 * reichen wuerde hiesse, jede Schaltflaeche mit einer Eigenschaft zu
 * belasten, die nichts mit ihr zu tun hat. Deshalb steht sie einmal im
 * Wurzel-Layout und ist ueberall abrufbar.
 */

const Kontext = createContext<Oberflaeche>(oberflaecheIn("de"));

export function SprachProvider({
  sprache,
  children,
}: {
  sprache: Sprache;
  children: React.ReactNode;
}) {
  // oberflaecheIn baut Intl-Formatierer; einmal je Sprache genuegt.
  const wert = useMemo(() => oberflaecheIn(sprache), [sprache]);
  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

/** Texte und Formate im Browser: `const { t, datum } = useOberflaeche();` */
export function useOberflaeche(): Oberflaeche {
  return useContext(Kontext);
}
