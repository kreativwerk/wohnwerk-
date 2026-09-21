-- Wann wurde wem eine Zahlungserinnerung geschickt? Ein Eintrag je Klick
-- auf Kopieren oder WhatsApp, damit in der Liste steht: "Nachricht
-- gesendet am ..." - und niemand zweimal mahnt oder einen vergisst.
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReminderLog_tenantId_sentAt_idx" ON "ReminderLog"("tenantId", "sentAt");

ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
