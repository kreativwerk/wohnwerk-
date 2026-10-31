-- Standardmiete je Bett: 470 EUR statt 350 EUR.
ALTER TABLE "Room" ALTER COLUMN "defaultBedRentCents" SET DEFAULT 47000;
ALTER TABLE "Bed" ALTER COLUMN "monthlyRentCents" SET DEFAULT 47000;

-- Zimmer, die noch den alten Standard tragen, auf 470 EUR heben. Bestehende Betten bleiben unveraendert.
UPDATE "Room" SET "defaultBedRentCents" = 47000 WHERE "defaultBedRentCents" = 35000;
