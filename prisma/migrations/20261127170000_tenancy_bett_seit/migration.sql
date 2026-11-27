-- Seit wann wohnt der Mieter im aktuellen Bett? Gesetzt beim internen Umzug -
-- die Wohnungsgeberbestaetigung nennt dann dieses Datum als Einzug.
ALTER TABLE "Tenancy" ADD COLUMN "bettSeit" TIMESTAMP(3);
