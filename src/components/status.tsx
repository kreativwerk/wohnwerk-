import { Badge, type Tone } from "./ui";
import {
  CHARGE_STATUS_LABEL,
  CONTRACT_STATUS_LABEL,
  TENANCY_STATUS_LABEL,
  TX_REVIEW_STATUS_LABEL,
} from "@/lib/enums";
import { oberflaeche } from "@/lib/i18n";

const TENANCY_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  SENT: "info",
  ACTIVE: "success",
  ENDED: "neutral",
  CANCELLED: "danger",
};

const CONTRACT_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  SENT: "info",
  VIEWED: "warning",
  SIGNED: "success",
  ENDED: "neutral",
  CANCELLED: "danger",
};

const CHARGE_TONE: Record<string, Tone> = {
  OPEN: "warning",
  PARTIAL: "info",
  PAID: "success",
  WAIVED: "neutral",
};

const REVIEW_TONE: Record<string, Tone> = {
  OPEN: "warning",
  MATCHED: "info",
  BOOKED: "success",
  IGNORED: "neutral",
};

export async function TenancyBadge({ status }: { status: string }) {
  const { t } = await oberflaeche();
  return <Badge tone={TENANCY_TONE[status] ?? "neutral"}>{t(TENANCY_STATUS_LABEL[status] ?? status)}</Badge>;
}

export async function ContractBadge({ status }: { status: string }) {
  const { t } = await oberflaeche();
  return <Badge tone={CONTRACT_TONE[status] ?? "neutral"}>{t(CONTRACT_STATUS_LABEL[status] ?? status)}</Badge>;
}

export async function ChargeBadge({ status }: { status: string }) {
  const { t } = await oberflaeche();
  return <Badge tone={CHARGE_TONE[status] ?? "neutral"}>{t(CHARGE_STATUS_LABEL[status] ?? status)}</Badge>;
}

export async function ReviewBadge({ status }: { status: string }) {
  const { t } = await oberflaeche();
  return <Badge tone={REVIEW_TONE[status] ?? "neutral"}>{t(TX_REVIEW_STATUS_LABEL[status] ?? status)}</Badge>;
}

/** Belegungszustand eines Bettes. */
export async function BedBadge({ occupied, blocked }: { occupied: boolean; blocked: boolean }) {
  const { t } = await oberflaeche();
  if (occupied) return <Badge tone="brand">{t("Belegt")}</Badge>;
  if (blocked) return <Badge tone="danger">{t("Gesperrt")}</Badge>;
  // Gelb: ein freies Bett ist kein Erfolg, sondern entgangene Miete.
  return <Badge tone="warning">{t("Frei")}</Badge>;
}
