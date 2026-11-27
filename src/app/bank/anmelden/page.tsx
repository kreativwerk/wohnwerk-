import { redirect } from "next/navigation";

import { LogoHell } from "@/components/logo";
import { Alert } from "@/components/ui";
import { audit } from "@/lib/audit";
import { createSession, getSessionUser } from "@/lib/auth";
import { CODE_GUELTIG_MINUTEN, codeAnfordern, codePruefen } from "@/lib/login-code";
import { getSettings } from "@/lib/settings";

export async function generateMetadata() {
  return { title: "Anmeldung · Mietverträge · Wohnwerk" };
}
export const dynamic = "force-dynamic";

function adresse(formData: FormData): string {
  return String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
}

async function codeSenden(formData: FormData) {
  "use server";
  const email = adresse(formData);
  if (!email.includes("@")) redirect("/bank/anmelden?fehler=email");
  const ergebnis = await codeAnfordern(email);
  if (ergebnis !== "unbekannt") await audit(email, "login-code", "User", null, `Bank-Zugang: Code angefordert (${ergebnis})`);
  // Fuer jede Adresse dieselbe Antwort - niemand soll ausprobieren koennen,
  // welche Adressen freigeschaltet sind.
  redirect(`/bank/anmelden?schritt=code&email=${encodeURIComponent(email)}`);
}

async function codeEinloesen(formData: FormData) {
  "use server";
  const email = adresse(formData);
  const user = await codePruefen(email, String(formData.get("code") ?? ""));
  if (!user) redirect(`/bank/anmelden?schritt=code&fehler=code&email=${encodeURIComponent(email)}`);
  await createSession(user);
  await audit(user.email, "login", "User", user.id, "Bank-Zugang per E-Mail-Code");
  redirect("/bank");
}

/**
 * Anmeldung fuer den Bank-Zugang: E-Mail-Adresse eingeben, Code aus der
 * E-Mail eintippen - ohne Passwort.
 */
export default async function BankAnmeldenPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; schritt?: string; fehler?: string }>;
}) {
  const angemeldet = await getSessionUser();
  if (angemeldet) redirect(angemeldet.role === "bank" || angemeldet.role === "admin" ? "/bank" : "/");

  const [p, settings] = await Promise.all([searchParams, getSettings()]);
  const email = (p.email ?? "").slice(0, 200);
  const codeSchritt = p.schritt === "code" && email.includes("@");

  return (
    <div className="min-h-[100dvh] bg-ink-100">
      <header className="border-b-4 border-brand-600 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-4">
          <LogoHell className="h-9 w-auto" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-10">
        <div className="card p-6">
          <h1 className="text-xl font-bold text-brand-800">Laufende aktive Mietverträge</h1>
          <p className="mt-1 text-sm text-ink-600">Anmeldung mit Code per E-Mail – ohne Passwort.</p>

          {!codeSchritt ? (
            <form action={codeSenden} className="mt-6 space-y-4">
              {p.fehler === "email" && <Alert tone="danger">Bitte eine gültige E-Mail-Adresse eingeben.</Alert>}
              <div>
                <label htmlFor="email">E-Mail-Adresse</label>
                <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} autoFocus={!email} />
                <p className="field-hint">Die Adresse, an die Ihre Einladung ging.</p>
              </div>
              <button type="submit" className="btn btn-primary w-full">Code anfordern</button>
            </form>
          ) : (
            <form action={codeEinloesen} className="mt-6 space-y-4">
              {p.fehler === "code" ? (
                <Alert tone="danger">
                  Der Code stimmt nicht oder ist abgelaufen. Bitte noch einmal eingeben oder einen neuen Code anfordern.
                </Alert>
              ) : (
                <Alert tone="info">
                  Wenn <strong>{email}</strong> freigeschaltet ist, kommt in wenigen Sekunden eine E-Mail mit einem
                  sechsstelligen Code. Er ist {CODE_GUELTIG_MINUTEN} Minuten gültig. Bitte auch im Spam-Ordner nachsehen.
                </Alert>
              )}
              <input type="hidden" name="email" value={email} />
              <div>
                <label htmlFor="code">Code aus der E-Mail</label>
                <input
                  id="code"
                  name="code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  maxLength={7}
                  placeholder="123456"
                  autoFocus
                  className="text-center text-2xl tracking-[0.4em]"
                />
              </div>
              <button type="submit" className="btn btn-primary w-full">Anmelden</button>
            </form>
          )}

          {codeSchritt && (
            <form action={codeSenden} className="mt-3">
              <input type="hidden" name="email" value={email} />
              <button type="submit" className="btn btn-ghost w-full">Neuen Code anfordern</button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-ink-500">
          Kein Code angekommen? Bitte an die Hausverwaltung wenden{settings.companyEmail ? `: ${settings.companyEmail}` : "."}
        </p>
        <p className="mt-2 text-center text-xs text-ink-500">
          <a href="/login?weiter=/bank" className="underline">Verwaltung: mit Passwort anmelden</a>
        </p>
      </main>
    </div>
  );
}
