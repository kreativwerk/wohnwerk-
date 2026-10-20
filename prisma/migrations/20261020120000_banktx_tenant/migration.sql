-- Zahler einer Buchung: daraus ergibt sich das Guthaben je Mieter
ALTER TABLE "BankTransaction" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "BankTransaction_tenantId_idx" ON "BankTransaction"("tenantId");
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bestehende Zuordnungen: Zahler aus der zugeordneten Forderung uebernehmen,
-- wenn alle Zuordnungen einer Buchung zum selben Mieter gehoeren.
UPDATE "BankTransaction" b SET "tenantId" = z.tenant
FROM (
  SELECT a."bankTransactionId" AS tx, MIN(ty."tenantId") AS tenant
  FROM "Allocation" a
  JOIN "RentCharge" c ON c.id = a."rentChargeId"
  JOIN "Tenancy" ty ON ty.id = c."tenancyId"
  GROUP BY a."bankTransactionId"
  HAVING COUNT(DISTINCT ty."tenantId") = 1
) z
WHERE b.id = z.tx;
