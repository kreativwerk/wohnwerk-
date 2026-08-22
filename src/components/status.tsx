import { Badge, type Tone } from "./ui";
import {
  CHARGE_STATUS_LABEL,
  CONTRACT_STATUS_LABEL,
  TENANCY_STATUS_LABEL,
  TX_REVIEW_STATUS_LABEL,
} from "@/lib/enums";

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

export function TenancyBadge({ status }: { status: string }) {
  return <Badge tone={TENANCY_TONE[status] ?? "neutral"}>{TENANCY_STATUS_LABEL[status] ?? status}</Badge>;
}

export function ContractBadge({ status }: { status: string }) {
  return <Badge tone={CONTRACT_TONE[status] ?? "neutral"}>{CONTRACT_STATUS_LABEL[status] ?? status}</Badge>;
}

export function ChargeBadge({ status }: { status: string }) {
  return <Badge tone={CHARGE_TONE[status] ?? "neutral"}>{CHARGE_STATUS_LABEL[status] ?? status}</Badge>;
}

export function ReviewBadge({ status }: { status: string }) {
  return <Badge tone={REVIEW_TONE[status] ?? "neutral"}>{TX_REVIEW_STATUS_LABEL[status] ?? status}</Badge>;
}

/** Belegungszustand eines Bettes. */
export function BedBadge({ occupied, blocked }: { occupied: boolean; blocked: boolean }) {
  if (occupied) return <Badge tone="brand">Belegt</Badge>;
  if (blocked) return <Badge tone="danger">Gesperrt</Badge>;
  // Gelb: ein freies Bett ist kein Erfolg, sondern entgangene Miete.
  return <Badge tone="warning">Frei</Badge>;
}
