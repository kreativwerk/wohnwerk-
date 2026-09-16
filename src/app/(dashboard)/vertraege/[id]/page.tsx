import Link from "next/link";
import { notFound } from "next/navigation";

import {
  cancelContract,
  markContractSignedManually,
  regenerateContractPdf,
  renewContractToken,
  sendContract,
} from "@/app/actions/contracts";
import { ConfirmButton, CopyField, Disclosure } from "@/components/interactive";
import { ContractView } from "@/components/contract-view";
import { ContractBadge } from "@/components/status";
import { Alert, Card, Flash, PageHeader } from "@/components/ui";
import { buildContractData, contractLink, loadContract } from "@/lib/contract";
import { getAppUrl } from "@/lib/settings";

import { requireAdmin } from "@/lib/auth";
import { oberflaeche } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await loadContract({ id });
  return { title: contract ? `Vertrag ${contract.contractNumber}` : "Vertrag" };
}

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { t, datum, datumZeit } = await oberflaeche();
  await requireAdmin();
  const { id } = await params;
  const flash = await searchParams;

  const contract = await loadContract({ id });
  if (!contract) notFound();

  const data = await buildContractData(contract, { includeSignature: true });
  const appUrl = await getAppUrl();
  const link = contractLink(appUrl, contract.token);
  const tenant = contract.tenancy.tenant;

  const isDraft = contract.status === "DRAFT";
  const isSigned = contract.status === "SIGNED";
  const isCancelled = contract.status === "CANCELLED";
  const expired = Boolean(contract.tokenExpiresAt && contract.tokenExpiresAt < new Date());

  const mailtoBody = encodeURIComponent(
    `Hallo ${tenant.firstName},\n\n` +
      `anbei der Link zu Ihrem Mietvertrag für ${data.propertyName}, ${data.roomName}, ${data.bedLabel}.\n` +
      `Bitte prüfen Sie Ihre Daten und unterschreiben Sie direkt im Browser:\n\n${link}\n\n` +
      `Mietbeginn: ${datum(contract.tenancy.startDate)}\n\n` +
      `Viele Grüße\n${data.landlordName}`,
  );

  return (
    <>
      <PageHeader
        title={`Mietvertrag ${contract.contractNumber}`}
        description={`${tenant.firstName} ${tenant.lastName} · ${data.propertyName}, ${data.roomName}, ${data.bedLabel}`}
        breadcrumb={[
          { label: t("Mietverträge"), href: "/vertraege" },
          { label: contract.contractNumber },
        ]}
        actions={
          <>
            <ContractBadge status={contract.status} />
            <a
              href={`/api/vertraege/${contract.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              {t("PDF ansehen")}
            </a>
            <Link href={`/mieter/${tenant.id}`} className="btn btn-secondary">
              {t("Zum Mieter")}
            </Link>
          </>
        }
      />

      <Flash ok={flash.ok} fehler={flash.fehler} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title={t("Vertragsinhalt")} description={t("Genau dieser Text erscheint im PDF und beim Mieter.")}>
            <ContractView data={data} />
          </Card>
        </div>

        <div className="space-y-6">
          {/* --- Ablauf ---------------------------------------------------- */}
          <Card title={t("Status")}>
            <ol className="space-y-3 text-sm">
              <Step done label={t("Angelegt")} detail={datumZeit(contract.createdAt)} />
              <Step
                done={Boolean(contract.sentAt)}
                label={t("Freigegeben und Link erzeugt")}
                detail={contract.sentAt ? datumZeit(contract.sentAt) : t("noch offen")}
              />
              <Step
                done={Boolean(contract.viewedAt)}
                label={t("Vom Mieter geöffnet")}
                detail={contract.viewedAt ? datumZeit(contract.viewedAt) : t("noch offen")}
              />
              <Step
                done={Boolean(contract.signedAt)}
                label={t("Unterschrieben")}
                detail={contract.signedAt ? datumZeit(contract.signedAt) : t("noch offen")}
              />
            </ol>

            {contract.signedAt && (
              <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                {t("Unterschrieben von")} <strong>{contract.signerName}</strong>
                {contract.signerIp ? ` · IP ${contract.signerIp}` : ""}
                <br />
                {contract.pdfUrl ? (
                  <a href={contract.pdfUrl} target="_blank" rel="noreferrer" className="underline">
                    {t("Abgelegtes PDF öffnen")}
                  </a>
                ) : (
                  t("PDF wurde noch nicht abgelegt.")
                )}
              </div>
            )}
          </Card>

          {/* --- Link ------------------------------------------------------ */}
          {!isCancelled && !isSigned && (
            <Card
              title={t("Link für den Mieter")}
              description={
                isDraft
                  ? t("Der Link wird erst nach der Freigabe gültig.")
                  : expired
                    ? t("Der Link ist abgelaufen – bitte einen neuen erzeugen.")
                    : t("Gültig bis {datum}", { datum: datum(contract.tokenExpiresAt) })
              }
            >
              {isDraft ? (
                <form action={sendContract} className="space-y-3">
                  <input type="hidden" name="id" value={contract.id} />
                  <Alert tone="info">
                    {t("Mit der Freigabe wird der Vertragstext eingefroren und der Link aktiviert. Ist ein E-Mail-Versand eingerichtet, geht die Nachricht direkt an {email}.", { email: tenant.email })}
                  </Alert>
                  <button type="submit" className="btn btn-primary w-full">
                    {t("Vertrag freigeben und versenden")}
                  </button>
                </form>
              ) : (
                <div className="space-y-3">
                  <CopyField value={link} />
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`mailto:${tenant.email}?subject=${encodeURIComponent(
                        `Ihr Mietvertrag ${contract.contractNumber}`,
                      )}&body=${mailtoBody}`}
                      className="btn btn-secondary"
                    >
                      {t("Per E-Mail-Programm senden")}
                    </a>
                    <form action={sendContract}>
                      <input type="hidden" name="id" value={contract.id} />
                      <button type="submit" className="btn btn-secondary">
                        {t("Erneut versenden")}
                      </button>
                    </form>
                    <form action={renewContractToken}>
                      <input type="hidden" name="id" value={contract.id} />
                      <ConfirmButton
                        className="btn btn-ghost"
                        message={t("Neuen Link erzeugen? Der bisherige Link wird sofort ungültig.")}
                      >
                        {t("Neuen Link erzeugen")}
                      </ConfirmButton>
                    </form>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* --- Weitere Schritte ------------------------------------------ */}
          <Card title={t("Weitere Schritte")}>
            <div className="space-y-3">
              <form action={regenerateContractPdf}>
                <input type="hidden" name="id" value={contract.id} />
                <button type="submit" className="btn btn-secondary w-full">
                  {t("PDF neu erzeugen und ablegen")}
                </button>
                <p className="field-hint">
                  {t("Legt das PDF in der Dokumentenablage unter „Mietverträge“ ab.")}
                </p>
              </form>

              {!isSigned && !isCancelled && (
                <Disclosure summary={t("Vor Ort unterschrieben erfassen")}>
                  <form action={markContractSignedManually} className="space-y-3">
                    <input type="hidden" name="id" value={contract.id} />
                    <div>
                      <label htmlFor="signerName">{t("Name der unterschreibenden Person")}</label>
                      <input
                        id="signerName"
                        name="signerName"
                        required
                        defaultValue={`${tenant.firstName} ${tenant.lastName}`.trim()}
                      />
                    </div>
                    <button type="submit" className="btn btn-secondary w-full">
                      {t("Als unterschrieben markieren")}
                    </button>
                    <p className="field-hint">
                      {t("Für Verträge, die auf Papier unterschrieben wurden. Es wird kein Unterschriftsbild hinterlegt.")}
                    </p>
                  </form>
                </Disclosure>
              )}

              {!isCancelled && !isSigned && (
                <form action={cancelContract}>
                  <input type="hidden" name="id" value={contract.id} />
                  <ConfirmButton
                    className="btn btn-danger w-full"
                    message={t("Vertrag stornieren? Das Bett wird wieder als frei geführt.")}
                  >
                    {t("Vertrag stornieren")}
                  </ConfirmButton>
                </form>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Step({ done, label, detail }: { done?: boolean; label: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${
          done ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-500"
        }`}
      >
        {done ? "✓" : "·"}
      </span>
      <span>
        <span className={done ? "font-medium text-ink-900" : "text-ink-500"}>{label}</span>
        <br />
        <span className="text-xs text-ink-500">{detail}</span>
      </span>
    </li>
  );
}
