/**
 * Statuswerte werden als String gespeichert (SQLite kennt keine Enums in Prisma).
 * Hier liegt die einzige Quelle der Wahrheit inkl. deutscher Beschriftung.
 */

export const BED_STATUS = ["FREE", "BLOCKED"] as const;
export type BedStatus = (typeof BED_STATUS)[number];

export const TENANCY_STATUS = ["DRAFT", "SENT", "ACTIVE", "ENDED", "CANCELLED"] as const;
export type TenancyStatus = (typeof TENANCY_STATUS)[number];

export const CONTRACT_STATUS = ["DRAFT", "SENT", "VIEWED", "SIGNED", "CANCELLED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[number];

export const TX_DIRECTION = ["CREDIT", "DEBIT"] as const;
export type TxDirection = (typeof TX_DIRECTION)[number];

export const TX_REVIEW_STATUS = ["OPEN", "MATCHED", "BOOKED", "IGNORED"] as const;
export type TxReviewStatus = (typeof TX_REVIEW_STATUS)[number];

export const CHARGE_STATUS = ["OPEN", "PARTIAL", "PAID", "WAIVED"] as const;
export type ChargeStatus = (typeof CHARGE_STATUS)[number];

export const DOCUMENT_KIND = ["RECEIPT", "INVOICE", "CONTRACT", "STATEMENT", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KIND)[number];

type LabelMap = Record<string, string>;

export const BED_STATUS_LABEL: LabelMap = {
  FREE: "Frei",
  BLOCKED: "Gesperrt",
  OCCUPIED: "Belegt", // abgeleitet, nicht persistiert
};

export const TENANCY_STATUS_LABEL: LabelMap = {
  DRAFT: "Entwurf",
  SENT: "Vertrag versendet",
  ACTIVE: "Aktiv",
  ENDED: "Beendet",
  CANCELLED: "Storniert",
};

export const CONTRACT_STATUS_LABEL: LabelMap = {
  DRAFT: "Entwurf",
  SENT: "Versendet",
  VIEWED: "Geöffnet",
  SIGNED: "Unterschrieben",
  CANCELLED: "Storniert",
};

export const TX_REVIEW_STATUS_LABEL: LabelMap = {
  OPEN: "Offen",
  MATCHED: "Zugeordnet",
  BOOKED: "Gebucht",
  IGNORED: "Ignoriert",
};

export const CHARGE_STATUS_LABEL: LabelMap = {
  OPEN: "Offen",
  PARTIAL: "Teilzahlung",
  PAID: "Bezahlt",
  WAIVED: "Erlassen",
};

export const DOCUMENT_KIND_LABEL: LabelMap = {
  RECEIPT: "Beleg",
  INVOICE: "Rechnung",
  CONTRACT: "Mietvertrag",
  STATEMENT: "Kontoauszug",
  EXPORT: "Steuerberater-Export",
  OTHER: "Sonstiges",
};

/** Standardkategorien fuer die Buchhaltung. */
export const EXPENSE_CATEGORIES = [
  "Miete Einnahme",
  "Nebenkosten Einnahme",
  "Kaution",
  "Objektmiete (Ausgabe)",
  "Strom / Gas / Wasser",
  "Internet / Telefon",
  "Reinigung",
  "Instandhaltung",
  "Einrichtung / Möbel",
  "Versicherung",
  "Grundsteuer / Abgaben",
  "Verwaltung / Software",
  "Bankgebühren",
  "Sonstiges",
] as const;
