-- Angebot: wöchentliche Sollarbeitszeit statt Stunden je Monat, Überstundenzuschläge und Zulagen je Position
ALTER TABLE "Angebotsposition" ADD COLUMN IF NOT EXISTS "wochenstunden" DOUBLE PRECISION;
ALTER TABLE "Angebotsposition" ADD COLUMN IF NOT EXISTS "zuschlag50" DOUBLE PRECISION NOT NULL DEFAULT 0.35;
ALTER TABLE "Angebotsposition" ADD COLUMN IF NOT EXISTS "zuschlag100" DOUBLE PRECISION NOT NULL DEFAULT 0.70;
ALTER TABLE "Angebotsposition" ADD COLUMN IF NOT EXISTS "zulagenIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Bestehende Angebote: aus den Monatsstunden die Wochenstunden ableiten (Monat = 4,3333 Wochen)
UPDATE "Angebotsposition" SET "wochenstunden" = ROUND(("stundenProMonat" / 4.3333)::numeric, 1)
 WHERE "wochenstunden" IS NULL AND "stundenProMonat" IS NOT NULL;

-- Stundennachweis: kommt er vom Beschäftiger oder schicken wir ihn zur Freigabe?
ALTER TABLE "Angebot" ADD COLUMN IF NOT EXISTS "stundennachweisVomKunden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Kunde"   ADD COLUMN IF NOT EXISTS "stundennachweisVomKunden" BOOLEAN NOT NULL DEFAULT false;

-- Anrede für E-Mails: Voreinstellung beim Kunden, je Ansprechpartner überschreibbar
ALTER TABLE "Kunde" ADD COLUMN IF NOT EXISTS "anredeDu" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ansprechpartner" ADD COLUMN IF NOT EXISTS "anredeDu" BOOLEAN;
ALTER TABLE "Ansprechpartner" ADD COLUMN IF NOT EXISTS "anrede" TEXT;
