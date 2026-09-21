-- "Keine Kaution" als bewusste Entscheidung, nicht als Luecke: Aeltere
-- Vertraege liefen ohne Kaution. Mit dem Haken verschwindet die Zeile aus
-- den offenen Kautionen, und es wird auch keine Kaution berechnet.
ALTER TABLE "Tenancy" ADD COLUMN "noDeposit" BOOLEAN NOT NULL DEFAULT false;
