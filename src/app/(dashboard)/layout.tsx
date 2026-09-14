import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/nav";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { aktuelleSprache } from "@/lib/i18n";
import { Sprachwahl } from "@/components/sprachwahl";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, sprache] = await Promise.all([requireUser(), aktuelleSprache()]);

  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      {/* Navigation und Menueleiste sind Client-Komponenten; die Sprache
          kommt deshalb von hier als Eigenschaft. */}
      <Sidebar
        user={{ name: user.name, email: user.email, role: user.role }}
        sprache={sprache}
        sprachwahl={<Sprachwahl hell />}
      />
      <main className="min-w-0 flex-1">
        {/* Unten Platz fuer die schwebende Menueleiste, damit sie nie den
            letzten Knopf einer Seite verdeckt. */}
        <div className="mx-auto w-full max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </div>
      </main>
      <MobileTabBar role={user.role} sprache={sprache} />
    </div>
  );
}
