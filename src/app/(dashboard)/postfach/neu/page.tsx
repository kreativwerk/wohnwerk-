import Link from "next/link";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";

import { emailSenden } from "@/app/actions/postfach";
import { AdminOnly } from "@/components/admin-only";
import { Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { oberflaeche, uebersetzer } from "@/lib/i18n";
import { postfachStatus } from "@/lib/postfach";

export async function generateMetadata() {
  const t = await uebersetzer();
  return { title: t("Neue E-Mail") };
}
export const dynamic = "force-dynamic";

/** Neue E-Mail - auch aus dem Mieterprofil mit ?mieter=... (Adresse steht dann schon drin). */
export default async function NeueEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ mieter?: string; an?: string; betreff?: string; ok?: string; fehler?: string }>;
}) {
  await requireAdmin();
  const { t } = await oberflaeche();
  const params = await searchParams;
  const status = await postfachStatus();
  const mieter = params.mieter
    ? await prisma.tenant.findUnique({ where: { id: params.mieter }, select: { id: true, firstName: true, email: true } })
    : null;

  return (
    <>
      <PageHeader title={t("Neue E-Mail")} breadcrumb={[{ label: t("E-Mail Postfach"), href: "/postfach" }, { label: t("Neue E-Mail") }]} />
      <Flash ok={params.ok} fehler={params.fehler} />
      {!status.eingerichtet ? (
        <Card>
          <EmptyState
            title={t("Noch kein Postfach verbunden")}
            description={t("In den Einstellungen das Postfach eintragen – dann geht der Versand über eure eigene Adresse.")}
            action={
              <Link href="/einstellungen#postfach" className="btn btn-primary">
                {t("Postfach einrichten")}
              </Link>
            }
          />
        </Card>
      ) : (
        <AdminOnly>
          <Card>
            <form action={emailSenden} encType="multipart/form-data" className="grid max-w-2xl gap-3">
              {mieter && <input type="hidden" name="tenantId" value={mieter.id} />}
              <p className="text-xs text-ink-500">{t("Von: {adresse}", { adresse: `${status.absenderName ?? ""} <${status.benutzer ?? ""}>` })}</p>
              <div>
                <label htmlFor="an">{t("An")}</label>
                <input id="an" name="an" defaultValue={params.an ?? mieter?.email ?? ""} placeholder="name@beispiel.de" required />
              </div>
              <div>
                <label htmlFor="cc">{t("Kopie (optional)")}</label>
                <input id="cc" name="cc" />
              </div>
              <div>
                <label htmlFor="betreff">{t("Betreff")}</label>
                <input id="betreff" name="betreff" defaultValue={params.betreff ?? ""} required />
              </div>
              <div>
                <label htmlFor="text">{t("Nachricht")}</label>
                <textarea id="text" name="text" rows={12} defaultValue={mieter ? `Hallo ${mieter.firstName},\n\n\n\nViele Grüße\nWohnwerk` : ""} />
              </div>
              <div>
                <label htmlFor="dateien">{t("Anhänge")}</label>
                <input id="dateien" name="dateien" type="file" multiple />
              </div>
              <div>
                <button type="submit" className="btn btn-primary">
                  <PaperPlaneTilt size={16} className="mr-1 inline-block align-[-3px]" aria-hidden="true" />
                  {t("Senden")}
                </button>
              </div>
            </form>
          </Card>
        </AdminOnly>
      )}
    </>
  );
}
