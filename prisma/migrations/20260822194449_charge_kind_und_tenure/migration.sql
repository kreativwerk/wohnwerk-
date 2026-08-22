-- Forderungsart: Monatsmiete oder einmalige Kaution zum Einzug
ALTER TABLE "RentCharge" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'RENT';

-- Eindeutigkeit je Mietverhaeltnis, Monat und Art
ALTER TABLE "RentCharge" DROP CONSTRAINT IF EXISTS "RentCharge_tenancyId_periodYear_periodMonth_key";
DROP INDEX IF EXISTS "RentCharge_tenancyId_periodYear_periodMonth_key";
CREATE UNIQUE INDEX "RentCharge_tenancyId_periodYear_periodMonth_kind_key"
  ON "RentCharge"("tenancyId", "periodYear", "periodMonth", "kind");

-- Objekt: angemietet (ownerName = Vermieter) oder Eigentum von Wohnwerk
ALTER TABLE "Property" ADD COLUMN "tenure" TEXT NOT NULL DEFAULT 'ANGEMIETET';
