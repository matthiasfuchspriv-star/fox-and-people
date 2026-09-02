-- Schwerarbeit / Nachtschwerarbeit als Kennzeichen am Einsatz (Überlassungsmitteilung Punkte 9/10)
ALTER TABLE "Einsatz" ADD COLUMN IF NOT EXISTS "schwerarbeit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Einsatz" ADD COLUMN IF NOT EXISTS "nachtschwerarbeit" BOOLEAN NOT NULL DEFAULT false;
