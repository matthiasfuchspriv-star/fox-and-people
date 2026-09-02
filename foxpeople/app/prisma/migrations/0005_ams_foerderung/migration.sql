ALTER TABLE "Person"
  ADD COLUMN "amsGefoerdert" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "amsFoerderungArt" TEXT,
  ADD COLUMN "amsFoerderungBetrag" DOUBLE PRECISION,
  ADD COLUMN "amsFoerderungVon" TIMESTAMP(3),
  ADD COLUMN "amsFoerderungBis" TIMESTAMP(3),
  ADD COLUMN "amsFoerderungNotiz" TEXT;
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'AMS_FOERDERUNG_ENDE';
