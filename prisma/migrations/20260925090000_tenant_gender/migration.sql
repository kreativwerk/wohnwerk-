-- Geschlecht des Mieters: die Wohnungsgeberbestaetigung fragt je Person
-- "maennlich" oder "weiblich" ab. Freiwillig; leer bleibt leer.
ALTER TABLE "Tenant" ADD COLUMN "gender" TEXT;
