-- Notizen je Bewohner, optional als Kautionsabzug
CREATE TABLE "TenantNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "grund" TEXT,
    "amountCents" INTEGER,
    "erledigt" BOOLEAN NOT NULL DEFAULT false,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantNote_tenantId_createdAt_idx" ON "TenantNote"("tenantId", "createdAt");

ALTER TABLE "TenantNote" ADD CONSTRAINT "TenantNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nachrichtenvermerk unterscheidet Zahlungserinnerung und Kautionsabrechnung
ALTER TABLE "ReminderLog" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'RUECKSTAND';
