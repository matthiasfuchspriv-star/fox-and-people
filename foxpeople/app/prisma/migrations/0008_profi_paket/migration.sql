-- Controllingkosten je Kostenstelle
ALTER TABLE "Controllingkosten" DROP CONSTRAINT IF EXISTS "Controllingkosten_jahr_key";
DROP INDEX IF EXISTS "Controllingkosten_jahr_key";
ALTER TABLE "Controllingkosten" ADD COLUMN "kostenstelleId" TEXT NOT NULL DEFAULT '', ADD COLUMN "kostenProVermittlung" DOUBLE PRECISION;
CREATE UNIQUE INDEX "Controllingkosten_jahr_kostenstelleId_key" ON "Controllingkosten"("jahr", "kostenstelleId");
-- Planwerte
CREATE TABLE "Planwert" ("id" TEXT NOT NULL, "jahr" INTEGER NOT NULL, "kostenstelleId" TEXT NOT NULL DEFAULT '', "zielUmsatz" DOUBLE PRECISION NOT NULL DEFAULT 0, "zielDb1" DOUBLE PRECISION NOT NULL DEFAULT 0, "zielMitarbeiter" INTEGER NOT NULL DEFAULT 0, "notiz" TEXT, CONSTRAINT "Planwert_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Planwert_jahr_kostenstelleId_key" ON "Planwert"("jahr", "kostenstelleId");
-- Zulagen
CREATE TYPE "ZulageArt" AS ENUM ('PROZENT_STUNDENLOHN', 'EURO_STUNDE', 'EURO_TAG', 'EURO_MONAT');
CREATE TABLE "Zulage" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "kuerzel" TEXT NOT NULL, "art" "ZulageArt" NOT NULL, "wert" DOUBLE PRECISION NOT NULL, "weiterverrechnen" BOOLEAN NOT NULL DEFAULT true, "steuerfrei" BOOLEAN NOT NULL DEFAULT false, "beschreibung" TEXT, "aktiv" BOOLEAN NOT NULL DEFAULT true, "reihenfolge" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "Zulage_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Zulage_kuerzel_key" ON "Zulage"("kuerzel");
-- Zeitkonto
CREATE TYPE "ZeitbuchungTyp" AS ENUM ('KORREKTUR', 'ZEITAUSGLEICH', 'AUSZAHLUNG', 'UEBERTRAG');
CREATE TABLE "Zeitbuchung" ("id" TEXT NOT NULL, "personId" TEXT NOT NULL, "datum" TIMESTAMP(3) NOT NULL, "stunden" DOUBLE PRECISION NOT NULL, "typ" "ZeitbuchungTyp" NOT NULL, "notiz" TEXT, "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Zeitbuchung_pkey" PRIMARY KEY ("id"), CONSTRAINT "Zeitbuchung_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "Zeitbuchung_personId_idx" ON "Zeitbuchung"("personId");
-- Provisionsabrechnung
CREATE TYPE "ProvisionStatus" AS ENUM ('ENTWURF', 'FREIGEGEBEN', 'AUSBEZAHLT');
CREATE TABLE "Provisionsabrechnung" ("id" TEXT NOT NULL, "kostenstelleId" TEXT NOT NULL, "jahr" INTEGER NOT NULL, "monat" INTEGER NOT NULL, "verrechnung" DOUBLE PRECISION NOT NULL, "db2" DOUBLE PRECISION NOT NULL, "provisionUeberlassung" DOUBLE PRECISION NOT NULL, "provisionVermittlung" DOUBLE PRECISION NOT NULL, "betrag" DOUBLE PRECISION NOT NULL, "detail" JSONB NOT NULL, "status" "ProvisionStatus" NOT NULL DEFAULT 'ENTWURF', "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "freigegebenAm" TIMESTAMP(3), "freigegebenVon" TEXT, "ausbezahltAm" TIMESTAMP(3), "notiz" TEXT, CONSTRAINT "Provisionsabrechnung_pkey" PRIMARY KEY ("id"), CONSTRAINT "Provisionsabrechnung_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "Provisionsabrechnung_kostenstelleId_jahr_monat_key" ON "Provisionsabrechnung"("kostenstelleId", "jahr", "monat");
-- Kunde / Person / Einsatz
ALTER TABLE "Kunde" ADD COLUMN "bundesland" TEXT;
ALTER TABLE "Person" ADD COLUMN "geschlecht" TEXT, ADD COLUMN "angestellt" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "lehreEndeAm" TIMESTAMP(3), ADD COLUMN "durchrechnungStart" TIMESTAMP(3), ADD COLUMN "durchrechnungMonate" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "Einsatz" ADD COLUMN "grenzueberschreitend" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "zkoGemeldet" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "zulagen" JSONB;
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'AUEG_STATISTIK';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'ZKO_MELDUNG';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'ZEITKONTO_ABLAUF';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'PROVISION_FREIGABE';
