import { redirect } from "next/navigation";

import { createSession, getSessionUser, login } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Alert } from "@/components/ui";
import { LogoNavbar } from "@/components/logo";
import { PasswortFeld } from "@/components/passwort-feld";
import { Sprachwahl } from "@/components/sprachwahl";
import { uebersetzer } from "@/lib/i18n";

export const metadata = { title: "Anmelden" };
export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await login(email, password);
  if (!user) redirect("/login?fehler=1");

  await createSession(user);
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  if (await getSessionUser()) redirect("/");

  const params = await searchParams;
  const [userCount, t] = await Promise.all([
    prisma.user.count().catch(() => -1),
    uebersetzer(),
  ]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-brand-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <LogoNavbar className="h-10 w-auto" />
            <p className="mt-3 text-[0.8rem] text-brand-300">
              {t("Verwaltung für Monteurunterkünfte")}
            </p>
          </div>
          <Sprachwahl hell />
        </div>

        <div className="card p-6">
          <h1 className="text-base font-semibold text-ink-900">{t("Anmelden")}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("Bitte mit den Zugangsdaten der Hausverwaltung anmelden.")}
          </p>

          {params.fehler && (
            <div className="mt-4">
              <Alert tone="danger">{t("E-Mail-Adresse oder Passwort ist nicht korrekt.")}</Alert>
            </div>
          )}

          {userCount === 0 && (
            <div className="mt-4">
              <Alert tone="info" title={t("Erste Anmeldung")}>
                Es gibt noch kein Konto. Melden Sie sich mit den Werten aus <code>ADMIN_EMAIL</code>{" "}
                und <code>ADMIN_PASSWORD</code> an – das Konto wird dabei angelegt.
              </Alert>
            </div>
          )}

          {userCount === -1 && (
            <div className="mt-4">
              <Alert tone="danger" title={t("Keine Datenbankverbindung")}>
                Bitte <code>DATABASE_URL</code> prüfen und <code>npm run db:migrate</code> ausführen.
              </Alert>
            </div>
          )}

          <form action={signIn} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email">{t("E-Mail")}</label>
              <input id="email" name="email" type="email" required autoComplete="username" autoFocus />
            </div>
            <PasswortFeld label={t("Passwort")} anzeigenLabel={t("Passwort anzeigen")} verbergenLabel={t("Passwort verbergen")} />
            <button type="submit" className="btn btn-primary w-full">
              {t("Anmelden")}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-ink-500">
          {t("Mieter benötigen keinen Zugang – sie erhalten einen persönlichen Vertragslink.")}
        </p>
      </div>
    </div>
  );
}
