-- Anschrift und Kontakt des Eigentuemers, wenn Wohnwerk nur Zwischenmieter
-- ist. Die Wohnungsgeberbestaetigung fragt danach ("Der Wohnungsgeber ist
-- nicht Eigentuemer der Wohnung. Name und Anschrift des Eigentuemers ...").
ALTER TABLE "Property" ADD COLUMN "ownerAddress" TEXT;
ALTER TABLE "Property" ADD COLUMN "ownerContact" TEXT;
