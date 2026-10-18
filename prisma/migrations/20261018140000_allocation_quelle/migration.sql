-- Herkunft einer Zuordnung: AUTO (Abgleich, neu berechenbar) oder HAND
ALTER TABLE "Allocation" ADD COLUMN "quelle" TEXT NOT NULL DEFAULT 'AUTO';
