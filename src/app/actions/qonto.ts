"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { flash, str } from "@/lib/form";
import { qontoAbgleich, qontoZugangEntfernen, qontoZugangSpeichern } from "@/lib/qonto";
import { uebersetzer } from "@/lib/i18n";

function erlaubterRuecksprung(back: string, vorgabe: string): string {
  return back.startsWith("/") && !back.startsWith("//") ? back : vorgabe;
}

function auffrischen() {
  revalidatePath("/buchhaltung");
  revalidatePath("/buchhaltung/mieteingaenge");
  revalidatePath("/buchhaltung/rueckstaende");
  revalidatePath("/buchhaltung/kautionen");
  revalidatePath("/buchhaltung/offene-posten");
  revalidatePath("/einstellungen");
  revalidatePath("/");
}

/** Knopf "Mit Qonto abgleichen". */
export async function qontoJetztAbgleichen(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const back = erlaubterRuecksprung(str(formData, "back"), "/buchhaltung/mieteingaenge");

  const ergebnis = await qontoAbgleich(user.email);
  auffrischen();
  if (!ergebnis.ok) redirect(flash(back, "fehler", t(ergebnis.fehler ?? "Der Qonto-Abgleich ist fehlgeschlagen.")));
  redirect(
    flash(
      back,
      "ok",
      t("Qonto abgeglichen: {neu} neue Buchung(en), {zugeordnet} Zahlung(en) automatisch zugeordnet, {belege} Beleg(e) abgelegt.", {
        neu: ergebnis.neu,
        zugeordnet: ergebnis.zugeordnet,
        belege: ergebnis.belege ?? 0,
      }),
    ),
  );
}

export async function qontoZugangSichern(formData: FormData) {
  const t = await uebersetzer();
  const user = await requireAdmin();
  const login = str(formData, "qontoLogin");
  const secretKey = str(formData, "qontoSecretKey");
  if (!login || !secretKey) {
    redirect(flash("/einstellungen#qonto", "fehler", t("Bitte Login und geheimen Schlüssel von Qonto eintragen.")));
  }

  await qontoZugangSpeichern(login, secretKey);
  await audit(user.email, "update", "Settings", null, "Qonto-Zugang");

  // Gleich ausprobieren - so sieht man sofort, ob der Schluessel stimmt.
  const ergebnis = await qontoAbgleich(user.email);
  auffrischen();
  if (!ergebnis.ok) {
    redirect(flash("/einstellungen#qonto", "fehler", `${t("Zugang gespeichert, aber der Abgleich klappt noch nicht:")} ${t(ergebnis.fehler ?? "")}`));
  }
  redirect(
    flash(
      "/einstellungen#qonto",
      "ok",
      t("Qonto verbunden: {neu} neue Buchung(en), {zugeordnet} Zahlung(en) automatisch zugeordnet, {belege} Beleg(e) abgelegt.", {
        neu: ergebnis.neu,
        zugeordnet: ergebnis.zugeordnet,
        belege: ergebnis.belege ?? 0,
      }),
    ),
  );
}

export async function qontoZugangLoeschen() {
  const t = await uebersetzer();
  const user = await requireAdmin();
  await qontoZugangEntfernen();
  await audit(user.email, "delete", "Settings", null, "Qonto-Zugang");
  revalidatePath("/einstellungen");
  redirect(flash("/einstellungen#qonto", "ok", t("Qonto-Zugang wurde entfernt.")));
}
