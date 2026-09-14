-- Tickets: was im Haus zu tun ist. Ein Anliegen entsteht mit einem Satz
-- und wird bearbeitet, bis es erledigt ist; Fotos haengen als Document daran.

CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "nummer" SERIAL NOT NULL,
    "titel" TEXT NOT NULL,
    "beschreibung" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFEN',
    "prioritaet" TEXT NOT NULL DEFAULT 'NORMAL',
    "propertyId" TEXT,
    "tenantId" TEXT,
    "erstelltVon" TEXT NOT NULL,
    "bearbeiter" TEXT,
    "erledigtAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketKommentar" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketKommentar_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Document" ADD COLUMN "ticketId" TEXT;

CREATE UNIQUE INDEX "Ticket_nummer_key" ON "Ticket"("nummer");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_propertyId_idx" ON "Ticket"("propertyId");
CREATE INDEX "Ticket_tenantId_idx" ON "Ticket"("tenantId");
CREATE INDEX "TicketKommentar_ticketId_idx" ON "TicketKommentar"("ticketId");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketKommentar" ADD CONSTRAINT "TicketKommentar_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wie bei allen Tabellen: kein Zugriff ueber die Supabase-Client-Rollen.
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketKommentar" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "Ticket", "TicketKommentar" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "Ticket", "TicketKommentar" FROM authenticated;
  END IF;
END $$;
