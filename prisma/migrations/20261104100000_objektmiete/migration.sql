-- Mietvertraege, in denen Wohnwerk Mieter ist: Betrag und Faelligkeit.
CREATE TABLE "Objektmiete" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bezeichnung" TEXT,
    "vermieter" TEXT NOT NULL,
    "betragCents" INTEGER NOT NULL,
    "faelligArt" TEXT NOT NULL DEFAULT 'WERKTAG',
    "faelligTag" INTEGER NOT NULL DEFAULT 3,
    "beginn" TIMESTAMP(3) NOT NULL,
    "ende" TIMESTAMP(3),
    "suchbegriffe" TEXT,
    "kennung" TEXT,
    "vertragUrl" TEXT,
    "notizen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objektmiete_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Objektmiete_propertyId_idx" ON "Objektmiete"("propertyId");

ALTER TABLE "Objektmiete" ADD CONSTRAINT "Objektmiete_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
