-- Zwei Sorten Tickets: Anliegen aus den Objekten und Meldungen zur
-- Anwendung selbst. Bestehende Tickets sind Objekt-Anliegen.
ALTER TABLE "Ticket" ADD COLUMN "art" TEXT NOT NULL DEFAULT 'OBJEKT';

-- Bei Support-Meldungen haelt die App fest, wo das Problem auftrat und
-- womit - damit die IT nicht erst nachfragen muss.
ALTER TABLE "Ticket" ADD COLUMN "kontext" TEXT;

CREATE INDEX "Ticket_art_idx" ON "Ticket"("art");
