-- Kaution zurueckgezahlt: Tag und Betrag
ALTER TABLE "Tenancy" ADD COLUMN "depositRefundedAt" TIMESTAMP(3);
ALTER TABLE "Tenancy" ADD COLUMN "depositRefundCents" INTEGER;
