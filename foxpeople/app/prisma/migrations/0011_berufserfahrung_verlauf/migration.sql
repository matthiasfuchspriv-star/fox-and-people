-- Berufserfahrung (Werdegang für das Kundenprofil)
CREATE TABLE IF NOT EXISTS "Berufserfahrung" (
  "id" TEXT PRIMARY KEY,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE CASCADE,
  "reihenfolge" INTEGER NOT NULL DEFAULT 0,
  "zeitraum" TEXT NOT NULL,
  "firma" TEXT NOT NULL,
  "taetigkeit" TEXT NOT NULL,
  "notiz" TEXT
);
CREATE INDEX IF NOT EXISTS "Berufserfahrung_personId_idx" ON "Berufserfahrung"("personId");

-- Qualifikation: Bezeichnung lt. Nachweis
ALTER TABLE "Qualifikation" ADD COLUMN IF NOT EXISTS "bezeichnung" TEXT;

-- Bewertungen: Merkmal-Chips
ALTER TABLE "Bewertung" ADD COLUMN IF NOT EXISTS "merkmale" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "KundenBewertung" ADD COLUMN IF NOT EXISTS "merkmale" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Monatsabrechnung: Ist-Selbstkosten lt. Lohnüberweisung
ALTER TABLE "Monatsabrechnung" ADD COLUMN IF NOT EXISTS "selbstkostenIst" DOUBLE PRECISION;
