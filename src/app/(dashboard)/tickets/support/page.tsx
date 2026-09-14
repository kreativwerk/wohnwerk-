import Link from "next/link";

import { createSupportTicket } from "@/app/actions/tickets";
import { BelegDatei } from "@/components/beleg-datei";
import { Card, Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { uebersetzer } from "@/lib/i18n";

export const metadata = { title: "Problem melden" };
export const dynamic = "force-dynamic";

/**
 * Dasselbe Formular wie im Blatt, nur als eigene Seite.
 *
 * Wer den Ausloeser in einem neuen Tab oeffnet oder die Adresse weitergibt,
 * landet hier. Fenster und Browser haelt diese Seite nicht fest - dafuer
 * reicht der Ausloeser die Herkunftsseite ueber `?von=` herein.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string; von?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const t = await uebersetzer();

  return (
    <>
      <PageHeader
        title={t("Problem melden")}
        description={t("Stimmt etwas in dieser Anwendung nicht? Die Meldung geht an die IT.")}
        breadcrumb={[{ label: t("Tickets"), href: "/tickets" }, { label: t("Problem melden") }]}
      />

      <Flash ok={params.ok} fehler={params.fehler} />

      <div className="max-w-xl">
        <Card>
          <form
            id="support-melden"
            action={createSupportTicket}
            encType="multipart/form-data"
            className="grid gap-3"
          >
            <input type="hidden" name="back" value="/tickets?art=SUPPORT" />
            {/* Nur gefuellt, wenn der Ausloeser die Herkunftsseite mitgegeben hat. */}
            <input type="hidden" name="seite" value={params.von ?? ""} />

            <div>
              <label htmlFor="titel">{t("Was stimmt nicht?")}</label>
              <input
                id="titel"
                name="titel"
                required
                autoFocus
                placeholder={t("z. B. Beleg lässt sich nicht speichern")}
              />
            </div>

            <div>
              <label htmlFor="beschreibung">{t("Was haben Sie gemacht?")}</label>
              <textarea
                id="beschreibung"
                name="beschreibung"
                rows={5}
                placeholder={t("Welcher Schritt, was war erwartet, was kam stattdessen?")}
              />
            </div>

            <div className="min-w-0">
              <label htmlFor="prioritaet">{t("Dringlichkeit")}</label>
              <select id="prioritaet" name="prioritaet" defaultValue="NORMAL">
                <option value="NIEDRIG">{t("Niedrig")}</option>
                <option value="NORMAL">{t("Normal")}</option>
                <option value="HOCH">{t("Hoch")}</option>
              </select>
            </div>

            <div className="min-w-0">
              <label htmlFor="datei">{t("Bildschirmfoto")}</label>
              <BelegDatei name="datei" required={false} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary">
                {t("Meldung senden")}
              </button>
              <Link href="/tickets" className="btn btn-ghost">
                {t("Abbrechen")}
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
