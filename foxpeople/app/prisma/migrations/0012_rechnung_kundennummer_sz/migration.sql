-- Kundennummer, Sonderzahlung-Ist
ALTER TABLE "Kunde" ADD COLUMN IF NOT EXISTS "kundennummer" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Kunde_kundennummer_key" ON "Kunde"("kundennummer");
ALTER TABLE "Monatsabrechnung" ADD COLUMN IF NOT EXISTS "sonderzahlungIst" DOUBLE PRECISION;
-- Bestehende Kunden fortlaufend nummerieren (200001 …)
UPDATE "Kunde" k SET "kundennummer" = t.nr FROM (SELECT id, (200000 + row_number() OVER (ORDER BY "erstelltAm", id))::text AS nr FROM "Kunde") t WHERE k.id = t.id AND k."kundennummer" IS NULL;
