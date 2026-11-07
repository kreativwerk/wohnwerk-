import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { finalizeSignedContract } from "@/app/actions/contracts";
import { ContractView } from "@/components/contract-view";
import { LogoHell } from "@/components/logo";
import { SignaturePad } from "@/components/signature-pad";
import { Alert } from "@/components/ui";
import { buildContractData, loadContract } from "@/lib/contract";
import { prisma } from "@/lib/db";
import { formatDate, fromDateInput } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { flash, optionalStr, str } from "@/lib/form";
import {
  VERTRAG_SPRACHEN,
  VERTRAG_SPRACHE_EIGENNAME,
  istVertragSprache,
  vertragText,
  type VertragText,
} from "@/lib/vertrag-sprache";

export async function generateMetadata() {
  return { title: "Mietvertrag · Wohnwerk" };
}
export const dynamic = "force-dynamic";

function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip");
}

/** Unterschrift des Mieters entgegennehmen. */
async function signContract(formData: FormData) {
  "use server";

  const token = str(formData, "token");
  const sprache = istVertragSprache(str(formData, "sprache")) ? str(formData, "sprache") : "de";
  const v = vertragText(sprache);
  const back = `/vertrag/${token}?sprache=${sprache}`;

  const contract = await loadContract({ token });
  if (!contract) redirect(flash(back, "fehler", v("nichtGefundenText")));
  if (contract.status === "SIGNED") redirect(back);
  if (contract.status === "CANCELLED") redirect(flash(back, "fehler", v("storniertText")));
  if (contract.tokenExpiresAt && contract.tokenExpiresAt < new Date()) {
    redirect(flash(back, "fehler", v("abgelaufenText")));
  }

  const signerName = str(formData, "signerName");
  const signature = str(formData, "signature");
  const confirmed = formData.get("confirm") === "on";

  // Das Noetigste fuer Vertrag und Meldebescheinigung - mehr fragen wir nicht.
  const vorname = str(formData, "firstName") || contract.tenancy.tenant.firstName;
  const nachname = str(formData, "lastName") || contract.tenancy.tenant.lastName;
  const pflicht: Array<[string, string]> = [
    [vorname, v("vorname")],
    [nachname, v("nachname")],
    [str(formData, "birthDate"), v("geburtsdatum")],
    [str(formData, "nationality"), v("staatsangehoerigkeit")],
    [str(formData, "phone"), v("telefon")],
    [str(formData, "email"), v("email")],
    [str(formData, "street"), v("strasse")],
    [str(formData, "city"), v("ort")],
  ];
  const fehlt = pflicht.filter(([wert]) => !wert.trim()).map(([, name]) => name);
  if (fehlt.length > 0) redirect(flash(back, "fehler", v("fehltNoch", { felder: fehlt.join(", ") })));

  const email = (optionalStr(formData, "email") ?? "").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(flash(back, "fehler", v("fehlerEmail")));
  if (!signerName) redirect(flash(back, "fehler", v("fehlerName")));
  if (!signature.startsWith("data:image/png;base64,")) redirect(flash(back, "fehler", v("fehlerUnterschrift")));
  if (!confirmed) redirect(flash(back, "fehler", v("fehlerBestaetigung")));

  const tenant = contract.tenancy.tenant;
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      firstName: vorname,
      lastName: nachname,
      email,
      phone: optionalStr(formData, "phone") ?? tenant.phone,
      birthDate: fromDateInput(str(formData, "birthDate")) ?? tenant.birthDate,
      nationality: optionalStr(formData, "nationality") ?? tenant.nationality,
      gender: ["M", "W", "D"].includes(str(formData, "gender").toUpperCase())
        ? str(formData, "gender").toUpperCase()
        : tenant.gender,
      idNumber: optionalStr(formData, "idNumber") ?? tenant.idNumber,
      street: optionalStr(formData, "street") ?? tenant.street,
      zip: optionalStr(formData, "zip") ?? tenant.zip,
      city: optionalStr(formData, "city") ?? tenant.city,
      country: optionalStr(formData, "country") ?? tenant.country,
    },
  });

  // Snapshot mit den ergaenzten Daten neu aufbauen, damit der Vertrag stimmt.
  const refreshed = (await loadContract({ token }))!;
  const data = await buildContractData({ ...refreshed, snapshot: null });

  const headerList = await headers();
  await prisma.$transaction([
    prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
        signerName,
        signerIp: clientIp(headerList),
        signerUserAgent: headerList.get("user-agent")?.slice(0, 300) ?? null,
        signatureData: signature.slice(0, 400_000),
        snapshot: JSON.stringify(data),
      },
    }),
    prisma.tenancy.update({ where: { id: contract.tenancyId }, data: { status: "ACTIVE" } }),
  ]);

  await finalizeSignedContract(contract.id);
  redirect(back);
}

export default async function PublicContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fehler?: string; sprache?: string }>;
}) {
  const { token } = await params;
  const { fehler, sprache: roh } = await searchParams;
  const sprache = istVertragSprache(roh) ? roh : "de";
  const v = vertragText(sprache);

  const contract = await loadContract({ token });

  if (!contract) {
    return (
      <Shell v={v} token={token} sprache={sprache}>
        <Alert tone="danger" title={v("nichtGefundenTitel")}>{v("nichtGefundenText")}</Alert>
      </Shell>
    );
  }
  if (contract.status === "CANCELLED") {
    return (
      <Shell v={v} token={token} sprache={sprache}>
        <Alert tone="warning" title={v("storniertTitel")}>{v("storniertText")}</Alert>
      </Shell>
    );
  }
  if (contract.status === "DRAFT") {
    return (
      <Shell v={v} token={token} sprache={sprache}>
        <Alert tone="warning" title={v("entwurfTitel")}>{v("entwurfText")}</Alert>
      </Shell>
    );
  }

  const expired = Boolean(contract.tokenExpiresAt && contract.tokenExpiresAt < new Date());
  const signed = contract.status === "SIGNED";

  if (!signed && !contract.viewedAt) {
    await prisma.contract.update({ where: { id: contract.id }, data: { viewedAt: new Date(), status: "VIEWED" } });
  }

  const data = await buildContractData(contract, { includeSignature: true });
  const tenant = contract.tenancy.tenant;
  const pflicht = <span className="text-rose-600"> *</span>;
  const optional = <span className="font-normal text-ink-500"> ({v("optional")})</span>;

  return (
    <Shell v={v} token={token} sprache={sprache}>
      {signed ? (
        <div className="mb-6">
          <Alert tone="success" title={v("fertigTitel")}>{v("fertigText")}</Alert>
          <a href={`/api/vertrag/${token}/pdf`} className="btn btn-primary no-print mt-3 w-full sm:w-auto" target="_blank" rel="noreferrer">
            {v("pdf")}
          </a>
        </div>
      ) : expired ? (
        <div className="mb-6">
          <Alert tone="warning" title={v("abgelaufenTitel")}>{v("abgelaufenText")}</Alert>
        </div>
      ) : (
        <div className="mb-6">
          <Alert tone="info" title={v("willkommen", { name: tenant.firstName })}>
            {v("einleitung", { datum: formatDate(contract.tenancy.startDate) })}
          </Alert>
        </div>
      )}

      {!signed && (
        <section className="mb-6 rounded-xl border-2 border-accent-500 bg-accent-50 p-4 sm:p-5">
          <h2 className="text-base font-bold text-accent-700">⚠ {v("hinweisTitel")}</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-snug text-ink-900">
            <li>• <strong>{v("hinweisKuendigung")}</strong></li>
            <li>• {v("hinweisKuendigungForm")}</li>
            {contract.tenancy.depositCents > 0 && (
              <li>• {v("hinweisKaution", { kaution: formatCents(contract.tenancy.depositCents) })}</li>
            )}
            <li>• <strong>{v("hinweisPuenktlich")}</strong></li>
            <li>• {v("hinweisVorschuss")}</li>
          </ul>
        </section>
      )}

      {fehler && (
        <div className="mb-5">
          <Alert tone="danger">{fehler}</Alert>
        </div>
      )}

      <p className="no-print mb-3 text-xs text-ink-500">{v("fassung")}</p>
      <div className="card p-5 sm:p-8">
        <ContractView data={data} />
      </div>
      {!signed && !expired && (
        <form action={signContract} className="no-print card mt-6 p-5 sm:p-8">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="sprache" value={sprache} />

          <h2 className="text-lg font-bold text-brand-700">{v("angaben")}</h2>
          <p className="mt-1 text-sm text-ink-500">{v("angabenHinweis")}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName">{v("vorname")}{pflicht}</label>
              <input id="firstName" name="firstName" required autoComplete="given-name" defaultValue={tenant.firstName} />
            </div>
            <div>
              <label htmlFor="lastName">{v("nachname")}{pflicht}</label>
              <input id="lastName" name="lastName" required autoComplete="family-name" defaultValue={tenant.lastName} />
            </div>
            <div>
              <label htmlFor="birthDate">{v("geburtsdatum")}{pflicht}</label>
              <input id="birthDate" name="birthDate" type="date" required defaultValue={tenant.birthDate ? tenant.birthDate.toISOString().slice(0, 10) : ""} />
            </div>
            <div>
              <label htmlFor="nationality">{v("staatsangehoerigkeit")}{pflicht}</label>
              <input id="nationality" name="nationality" required defaultValue={tenant.nationality ?? ""} />
            </div>
            <div>
              <label htmlFor="phone">{v("telefon")}{pflicht}</label>
              <input id="phone" name="phone" type="tel" required autoComplete="tel" defaultValue={tenant.phone ?? ""} />
            </div>
            <div>
              <label htmlFor="email">{v("email")}{pflicht}</label>
              <input id="email" name="email" type="email" required autoComplete="email" defaultValue={tenant.email ?? ""} />
            </div>
            <div>
              <label htmlFor="gender">{v("geschlecht")}{optional}</label>
              <select id="gender" name="gender" defaultValue={tenant.gender ?? ""}>
                <option value="">{v("keineAngabe")}</option>
                <option value="M">{v("maennlich")}</option>
                <option value="W">{v("weiblich")}</option>
                <option value="D">{v("divers")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="idNumber">{v("ausweis")}{optional}</label>
              <input id="idNumber" name="idNumber" defaultValue={tenant.idNumber ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="street">{v("meldeanschrift")}: {v("strasse")}{pflicht}</label>
              <input id="street" name="street" required autoComplete="address-line1" defaultValue={tenant.street ?? ""} />
            </div>
            <div>
              <label htmlFor="zip">{v("plz")}</label>
              <input id="zip" name="zip" autoComplete="postal-code" defaultValue={tenant.zip ?? ""} />
            </div>
            <div>
              <label htmlFor="city">{v("ort")}{pflicht}</label>
              <input id="city" name="city" required autoComplete="address-level2" defaultValue={tenant.city ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="country">{v("land")}</label>
              <input id="country" name="country" autoComplete="country-name" defaultValue={tenant.country && tenant.country !== "Deutschland" ? tenant.country : ""} />
            </div>
          </div>

          <h2 className="mt-8 border-t border-ink-200 pt-6 text-lg font-bold text-brand-700">{v("unterschrift")}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="signerName">{v("vollerName")}{pflicht}</label>
              <input id="signerName" name="signerName" required defaultValue={`${tenant.firstName} ${tenant.lastName}`.trim()} />
            </div>
            <div>
              <label htmlFor="signDate">{v("datum")}</label>
              <input id="signDate" value={formatDate(new Date())} disabled />
            </div>
          </div>

          <div className="mt-4">
            <SignaturePad
              texte={{ feld: v("feld"), hinweis: v("feldHinweis"), erfasst: v("erfasst"), keine: v("keine"), loeschen: v("loeschen") }}
            />
          </div>

          <label className="mt-5 flex items-start gap-2.5 text-sm font-normal text-ink-700">
            <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 shrink-0" required />
            <span>{v("bestaetigung")}</span>
          </label>

          <button type="submit" className="btn btn-primary mt-6 w-full sm:w-auto">{v("absenden")}</button>
        </form>
      )}

    </Shell>
  );
}

function Shell({
  children,
  v,
  token,
  sprache,
}: {
  children: React.ReactNode;
  v: VertragText;
  token: string;
  sprache: string;
}) {
  return (
    <div className="min-h-screen bg-ink-100 pb-10">
      <header className="no-print border-b-4 border-brand-600 bg-white">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <LogoHell className="h-9 w-auto" />
          <p className="text-sm font-bold text-brand-700">{v("kopf")}</p>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4">
        <nav className="no-print my-4 flex flex-wrap gap-1.5" aria-label="Sprache">
          {VERTRAG_SPRACHEN.map((s) => (
            <Link
              key={s}
              href={`/vertrag/${token}?sprache=${s}`}
              aria-current={s === sprache ? "true" : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                s === sprache ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-700 ring-ink-200"
              }`}
            >
              {VERTRAG_SPRACHE_EIGENNAME[s]}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
