-- Bankkonto je Objekt: eingehende Zahlungen dieses Kontos gehoeren zum Objekt
ALTER TABLE "Property" ADD COLUMN "bankAccountId" TEXT;
CREATE INDEX "Property_bankAccountId_idx" ON "Property"("bankAccountId");
ALTER TABLE "Property" ADD CONSTRAINT "Property_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
