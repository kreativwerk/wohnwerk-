import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { finalizeSignedContract } from "@/app/actions/contracts";
import { ContractView } from "@/components/contract-view";
import { SignaturePad } from "@/components/signature-pad";
import { Alert } from "@/components/ui";
import { buildContractData, loadContract } from "@/lib/contract";
import { prisma } from "@/lib/db";
import { formatDate, fromDateInput } from "@/lib/dates";
import { flash, optionalStr, str } from "@/lib/form";

export const metadata = { title: "Mietvertrag" };
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
  const back = `/vertrag/${token}`;

  const contract = await loadContract({ token });
  if (!contract) redirect(flash(back, "fehler", "Der Vertrag wurde nicht gefunden."));
  if (contract.status === "SIGNED") redirect(back);
  if (contract.status === "CANCELLED") {
    redirect(flash(back, "fehler", "Dieser Vertrag wurde storniert."));
  }
  if (contract.tokenExpiresAt && contract.tokenExpiresAt < new Date()) {
    redirect(flash(back, "fehler", "Der Link ist abgelaufen. Bitte fordern Sie einen neuen an."));
  }

  const signerName = str(formData, "signerName");
  const signature = str(formData, "signature");
  const confirmed = formData.get("confirm") === "on";

  if (!signerName) {
    redirect(flash(back, "fehler", "Bitte tragen Sie Ihren vollständigen Namen ein."));
  }
  if (!signature.startsWith("data:image/png;base64,")) {
    redirect(flash(back, "fehler", "Bitte unterschreiben Sie im dafür vorgesehenen Feld."));
  }
  if (!confirmed) {
    redirect(flash(back, "fehler", "Bitte bestätigen Sie, dass Sie den Vertrag gelesen haben."));
  }

  // Vom Mieter ergaenzte Stammdaten uebernehmen – sie gehoeren in den Vertrag.
  await prisma.tenant.update({
    where: { id: contract.tenancy.tenantId },
    data: {
      phone: optionalStr(formData, "phone") ?? contract.tenancy.tenant.phone,
      birthDate: fromDateInput(str(formData, "birthDate")) ?? contract.tenancy.tenant.birthDate,
      nationality: optionalStr(formData, "nationality") ?? contract.tenancy.tenant.nationality,
      idNumber: optionalStr(formData, "idNumber") ?? contract.tenancy.tenant.idNumber,
      street: optionalStr(formData, "street") ?? contract.tenancy.tenant.street,
      zip: optionalStr(formData, "zip") ?? contract.tenancy.tenant.zip,
      city: optionalStr(formData, "city") ?? contract.tenancy.tenant.city,
      country: optionalStr(formData, "country") ?? contract.tenancy.tenant.country,
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
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { token } = await params;
  const { fehler } = await searchParams;

  const contract = await loadContract({ token });

  if (!contract) {
    return (
      <Shell>
        <Alert tone="danger" title="Vertrag nicht gefunden">
          Der Link ist ungültig. Bitte wenden Sie sich an Ihre Hausverwaltung.
        </Alert>
      </Shell>
    );
  }

  if (contract.status === "CANCELLED") {
    return (
      <Shell>
        <Alert tone="warning" title="Vertrag storniert">
          Dieser Mietvertrag wurde storniert und kann nicht mehr unterschrieben werden.
        </Alert>
      </Shell>
    );
  }

  if (contract.status === "DRAFT") {
    return (
      <Shell>
        <Alert tone="warning" title="Noch nicht freigegeben">
          Der Vertrag wird gerade vorbereitet. Bitte versuchen Sie es später erneut.
        </Alert>
      </Shell>
    );
  }

  const expired = Boolean(contract.tokenExpiresAt && contract.tokenExpiresAt < new Date());
  const signed = contract.status === "SIGNED";

  if (!signed && !contract.viewedAt) {
    await prisma.contract.update({
      where: { id: contract.id },
      data: { viewedAt: new Date(), status: "VIEWED" },
    });
  }

  const data = await buildContractData(contract, { includeSignature: true });
  const tenant = contract.tenancy.tenant;

  return (
    <Shell>
      {signed ? (
        <div className="mb-6">
          <Alert tone="success" title="Vertrag unterschrieben">
            Vielen Dank. Ihr Mietvertrag ist gültig abgeschlossen – Sie können ihn hier jederzeit
            als PDF herunterladen.
          </Alert>
          <a
            href={`/api/vertrag/${token}/pdf`}
            className="btn btn-primary no-print mt-3"
            target="_blank"
            rel="noreferrer"
          >
            Vertrag als PDF herunterladen
          </a>
        </div>
      ) : expired ? (
        <div className="mb-6">
          <Alert tone="warning" title="Link abgelaufen">
            Dieser Link ist nicht mehr gültig. Bitte fordern Sie bei der Hausverwaltung einen neuen an.
          </Alert>
        </div>
      ) : (
        <div className="mb-6">
          <Alert tone="info" title={`Willkommen, ${tenant.firstName}`}>
            Bitte prüfen Sie Ihre Angaben, ergänzen Sie fehlende Felder und unterschreiben Sie den
            Vertrag unten. Mietbeginn ist der {formatDate(contract.tenancy.startDate)}.
          </Alert>
        </div>
      )}

      {fehler && (
        <div className="mb-5">
          <Alert tone="danger">{fehler}</Alert>
        </div>
      )}

      <div className="card p-6 sm:p-8">
        <ContractView data={data} />
      </div>

      {!signed && !expired && (
        <form action={signContract} className="no-print card mt-6 p-6 sm:p-8">
          <input type="hidden" name="token" value={token} />

          <h2 className="text-base font-semibold text-ink-900">Ihre Angaben vervollständigen</h2>
          <p className="mt-1 text-sm text-ink-500">
            Diese Angaben brauchen wir für den Vertrag und die Meldepflicht.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="birthDate">Geburtsdatum</label>
              <input
                id="birthDate"
                name="birthDate"
                type="date"
                defaultValue={tenant.birthDate ? tenant.birthDate.toISOString().slice(0, 10) : ""}
              />
            </div>
            <div>
              <label htmlFor="nationality">Staatsangehörigkeit</label>
              <input id="nationality" name="nationality" defaultValue={tenant.nationality ?? ""} />
            </div>
            <div>
              <label htmlFor="idNumber">Ausweis-/Passnummer</label>
              <input id="idNumber" name="idNumber" defaultValue={tenant.idNumber ?? ""} />
            </div>
            <div>
              <label htmlFor="phone">Telefon</label>
              <input id="phone" name="phone" type="tel" defaultValue={tenant.phone ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="street">Meldeanschrift (Heimatadresse)</label>
              <input id="street" name="street" defaultValue={tenant.street ?? ""} />
            </div>
            <div>
              <label htmlFor="zip">PLZ</label>
              <input id="zip" name="zip" defaultValue={tenant.zip ?? ""} />
            </div>
            <div>
              <label htmlFor="city">Ort</label>
              <input id="city" name="city" defaultValue={tenant.city ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="country">Land</label>
              <input id="country" name="country" defaultValue={tenant.country ?? "Deutschland"} />
            </div>
          </div>

          <h2 className="mt-8 text-base font-semibold text-ink-900">Unterschrift</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="signerName">Vollständiger Name</label>
              <input
                id="signerName"
                name="signerName"
                required
                defaultValue={`${tenant.firstName} ${tenant.lastName}`.trim()}
              />
            </div>
            <div>
              <label htmlFor="signDate">Datum</label>
              <input id="signDate" value={formatDate(new Date())} disabled />
            </div>
          </div>

          <div className="mt-4">
            <SignaturePad />
          </div>

          <label className="mt-5 flex items-start gap-2.5 text-sm font-normal text-ink-700">
            <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 shrink-0" required />
            <span>
              Ich habe den Mietvertrag und die Hausordnung gelesen und erkenne beide an. Mir ist
              bekannt, dass die elektronische Unterschrift der Textform nach § 126b BGB entspricht.
            </span>
          </label>

          <button type="submit" className="btn btn-primary mt-6 w-full sm:w-auto">
            Vertrag rechtsverbindlich unterschreiben
          </button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-100 py-8">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="no-print mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-base font-bold text-white">
            W
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink-900">Wohnwerk</p>
            <p className="text-[0.7rem] text-ink-500">Ihr Mietvertrag</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
