-- CreateTable
CREATE TABLE "PropertyTemplate" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "data" BYTEA NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "fieldNames" TEXT NOT NULL DEFAULT '[]',
    "fieldMap" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyTemplate_propertyId_kind_idx" ON "PropertyTemplate"("propertyId", "kind");

-- AddForeignKey
ALTER TABLE "PropertyTemplate" ADD CONSTRAINT "PropertyTemplate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
