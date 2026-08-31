import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/nav";
import { MobileTabBar } from "@/components/mobile-tabbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      <Sidebar user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="min-w-0 flex-1">
        {/* Unten Platz fuer die schwebende Menueleiste, damit sie nie den
            letzten Knopf einer Seite verdeckt. */}
        <div className="mx-auto w-full max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </div>
      </main>
      <MobileTabBar role={user.role} />
    </div>
  );
}
