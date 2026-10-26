-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "emailAnhangId" TEXT;

-- CreateTable
CREATE TABLE "EmailNachricht" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "richtung" TEXT NOT NULL DEFAULT 'EIN',
    "ordner" TEXT NOT NULL DEFAULT 'INBOX',
    "uid" INTEGER,
    "vonAdresse" TEXT NOT NULL,
    "vonName" TEXT,
    "an" TEXT NOT NULL,
    "cc" TEXT,
    "betreff" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "text" TEXT,
    "ergebnis" TEXT,
    "gelesen" BOOLEAN NOT NULL DEFAULT false,
    "erledigt" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT,
    "propertyId" TEXT,
    "antwortAufId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNachricht_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAnhang" (
    "id" TEXT NOT NULL,
    "nachrichtId" TEXT NOT NULL,
    "dateiname" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "driveFolder" TEXT,
    "localPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAnhang_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailNachricht_messageId_key" ON "EmailNachricht"("messageId");

-- CreateIndex
CREATE INDEX "EmailNachricht_datum_idx" ON "EmailNachricht"("datum");

-- CreateIndex
CREATE INDEX "EmailNachricht_tenantId_idx" ON "EmailNachricht"("tenantId");

-- CreateIndex
CREATE INDEX "EmailNachricht_richtung_gelesen_idx" ON "EmailNachricht"("richtung", "gelesen");

-- CreateIndex
CREATE INDEX "EmailAnhang_nachrichtId_idx" ON "EmailAnhang"("nachrichtId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_emailAnhangId_key" ON "Document"("emailAnhangId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_emailAnhangId_fkey" FOREIGN KEY ("emailAnhangId") REFERENCES "EmailAnhang"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNachricht" ADD CONSTRAINT "EmailNachricht_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNachricht" ADD CONSTRAINT "EmailNachricht_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAnhang" ADD CONSTRAINT "EmailAnhang_nachrichtId_fkey" FOREIGN KEY ("nachrichtId") REFERENCES "EmailNachricht"("id") ON DELETE CASCADE ON UPDATE CASCADE;

