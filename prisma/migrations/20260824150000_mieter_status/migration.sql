-- Ehemalige Mieter: bleiben mit ihren Vertraegen erhalten, tauchen aber
-- nicht mehr in den laufenden Listen auf.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'AKTIV';

CREATE INDEX IF NOT EXISTS "Tenant_status_idx" ON "Tenant"("status");
