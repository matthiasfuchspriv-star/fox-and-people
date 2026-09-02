-- Auto und Führerschein sind zwei verschiedene Dinge: Wer einen Schein hat, hat noch lange kein Auto.
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "autoVorhanden" BOOLEAN NOT NULL DEFAULT false;
-- Bisher steckte beides im Feld "fuehrerschein" ("Führerschein & Auto") – wer dort ja stehen hatte,
-- bekommt beides, das ist die einzige Auslegung, die keine Information verliert.
UPDATE "Person" SET "autoVorhanden" = true WHERE "fuehrerschein" = true;

-- Ausweis und Arbeitserlaubnis gehören zu den Dokumenten, nicht zu den Qualifikationen.
-- Dafür braucht das Dokument ein Ablaufdatum (bei Ausweisen Pflichtfeld).
ALTER TABLE "Dokument" ADD COLUMN IF NOT EXISTS "gultigBis" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Dokument_kategorie_gultigBis_idx" ON "Dokument" ("kategorie", "gultigBis");
