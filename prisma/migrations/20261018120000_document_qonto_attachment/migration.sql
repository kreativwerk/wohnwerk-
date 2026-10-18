-- Belege aus Qonto: Kennung des Anhangs, damit er nur einmal abgelegt wird
ALTER TABLE "Document" ADD COLUMN "qontoAttachmentId" TEXT;
CREATE UNIQUE INDEX "Document_qontoAttachmentId_key" ON "Document"("qontoAttachmentId");
