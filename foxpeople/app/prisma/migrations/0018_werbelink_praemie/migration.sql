-- v2.3: persönlicher Empfehlungs-Link, öffentliche Kurzbewerbung, Prämie belastet den DB1 der Zentrale

ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "werbecode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Person_werbecode_key" ON "Person"("werbecode");

ALTER TABLE "Empfehlung"
  ADD COLUMN IF NOT EXISTS "belastetJahr" INTEGER,
  ADD COLUMN IF NOT EXISTS "belastetMonat" INTEGER,
  ADD COLUMN IF NOT EXISTS "ueberLink" BOOLEAN NOT NULL DEFAULT false;

-- Sprachen auf Deutsch und Englisch beschränken
UPDATE "Person" SET "appSprache" = 'de' WHERE "appSprache" NOT IN ('de', 'en');
