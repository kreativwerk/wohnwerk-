import type { ReactNode } from "react";

import { getSessionUser, isAdmin } from "@/lib/auth";

/**
 * Zeigt seinen Inhalt nur der Verwaltung. Ein Steuerberater-Konto sieht die
 * Buchhaltung lesend: Zahlen, Tabellen und Downloads ja, Formulare und
 * Schaltflaechen, die Daten veraendern, nicht. Die Server-Aktionen sind
 * zusaetzlich serverseitig gesperrt - das hier ist die aufgeraeumte
 * Oberflaeche dazu, nicht die Sicherheitsgrenze.
 */
export async function AdminOnly({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return null;
  return <>{children}</>;
}
