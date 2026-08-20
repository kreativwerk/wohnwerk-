import { prisma } from "./db";

/** Firmen- und Vertragsstammdaten, die in Mietvertraege und Belege einfliessen. */
export type AppSettings = {
  companyName: string;
  companyStreet: string;
  companyZip: string;
  companyCity: string;
  companyCountry: string;
  companyPhone: string;
  companyEmail: string;
  companyVatId: string;
  companyRegister: string;

  bankName: string;
  bankIban: string;
  bankBic: string;

  contractIntro: string;
  contractClauses: string;
  contractHouseRules: string;
  contractNoticePeriod: string;

  appUrl: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: "Wohnwerk GmbH",
  companyStreet: "Musterstraße 1",
  companyZip: "28195",
  companyCity: "Bremen",
  companyCountry: "Deutschland",
  companyPhone: "",
  companyEmail: "",
  companyVatId: "",
  companyRegister: "",

  bankName: "",
  bankIban: "",
  bankBic: "",

  contractIntro:
    "Zwischen dem Vermieter und dem Mieter wird folgender Vertrag über die Überlassung " +
    "eines möblierten Schlafplatzes zum vorübergehenden Gebrauch (Monteurunterkunft) geschlossen.",
  contractClauses: [
    "1. Mietgegenstand: Überlassen wird der oben bezeichnete Schlafplatz im genannten Zimmer zur alleinigen Nutzung. Küche, Bad und Aufenthaltsräume werden gemeinschaftlich mit den übrigen Bewohnern genutzt.",
    "2. Mietzweck: Die Überlassung erfolgt ausschließlich zum vorübergehenden Gebrauch im Rahmen einer auswärtigen Tätigkeit (§ 549 Abs. 2 Nr. 1 BGB). Ein Wohnraummietverhältnis auf Dauer wird nicht begründet.",
    "3. Miete: Die Miete ist im Voraus bis zum vereinbarten Fälligkeitstag auf das Konto des Vermieters zu zahlen. Betriebs- und Nebenkosten sowie Strom, Wasser, Heizung und Internet sind in der Miete enthalten, sofern nicht abweichend vereinbart.",
    "4. Kaution: Eine vereinbarte Kaution ist vor Bezug zu hinterlegen und wird nach ordnungsgemäßer Rückgabe des Schlafplatzes und Ausgleich aller Forderungen zurückgezahlt.",
    "5. Nutzung: Die Unterkunft darf nur von der im Vertrag genannten Person genutzt werden. Die Aufnahme weiterer Personen sowie eine Untervermietung sind nicht gestattet.",
    "6. Hausordnung: Die Hausordnung ist Bestandteil dieses Vertrages. Rauchen ist in allen Innenräumen untersagt. Von 22:00 bis 06:00 Uhr ist Nachtruhe einzuhalten.",
    "7. Rückgabe: Der Schlafplatz ist zum Vertragsende besenrein und geräumt zurückzugeben. Schlüssel sind vollständig auszuhändigen. Für nicht zurückgegebene Schlüssel wird der Aufwand für den Austausch der Schließanlage berechnet.",
    "8. Haftung: Der Mieter haftet für von ihm verursachte Schäden. Für in die Unterkunft eingebrachte Sachen übernimmt der Vermieter keine Haftung.",
    "9. Meldepflicht: Der Mieter versichert, die für den Aufenthalt erforderlichen melderechtlichen Pflichten zu erfüllen und auf Verlangen eine Wohnungsgeberbestätigung entgegenzunehmen.",
    "10. Schlussbestimmungen: Änderungen und Ergänzungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.",
  ].join("\n"),
  contractHouseRules:
    "Nachtruhe 22:00–06:00 Uhr · Rauchverbot in allen Innenräumen · Küche und Bad nach Benutzung sauber hinterlassen · " +
    "Müll getrennt entsorgen · Keine Haustiere · Besuch nur nach Absprache",
  contractNoticePeriod:
    "Das Mietverhältnis kann von beiden Seiten mit einer Frist von 14 Tagen zum Monatsende in Textform gekündigt werden.",

  appUrl: "",
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>;

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const result = { ...DEFAULT_SETTINGS };
  for (const key of SETTINGS_KEYS) {
    const value = map.get(key);
    if (value !== undefined) result[key] = value;
  }
  if (!result.appUrl) {
    result.appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  }
  return result;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) =>
    SETTINGS_KEYS.includes(key as keyof AppSettings),
  );

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: String(value ?? "") },
        update: { value: String(value ?? "") },
      }),
    ),
  );
}

/** Basis-URL fuer die Mieter-Links. */
export async function getAppUrl(): Promise<string> {
  const settings = await getSettings();
  return settings.appUrl.replace(/\/+$/, "");
}
