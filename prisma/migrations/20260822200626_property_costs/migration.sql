-- Laufende Kosten eines Objekts aus Sicht von Wohnwerk
CREATE TABLE "PropertyCost" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PropertyCost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PropertyCost_propertyId_idx" ON "PropertyCost"("propertyId");
ALTER TABLE "PropertyCost" ADD CONSTRAINT "PropertyCost_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Datensicherheit wie bei allen Tabellen: Data API bleibt zu
ALTER TABLE "PropertyCost" ENABLE ROW LEVEL SECURITY;
