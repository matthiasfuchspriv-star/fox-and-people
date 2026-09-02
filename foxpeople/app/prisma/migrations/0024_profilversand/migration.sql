-- Versendete Kundenprofile: an welchen Kunden, wann genau, mit welcher Rückmeldung.
-- Ohne diese Liste weiß niemand mehr, wem man einen Mitarbeiter schon vorgestellt hat –
-- und genau daraus entstehen Doppelvorstellungen und verlorene Nachfassgespräche.
CREATE TABLE IF NOT EXISTS "ProfilVersand" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "an" TEXT,
  "gesendetAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gesendetVon" TEXT,
  "dokumentId" TEXT,
  "rueckmeldungAm" TIMESTAMP(3),
  "rueckmeldung" TEXT,
  CONSTRAINT "ProfilVersand_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProfilVersand_personId_idx" ON "ProfilVersand" ("personId");
CREATE INDEX IF NOT EXISTS "ProfilVersand_kundeId_idx" ON "ProfilVersand" ("kundeId");
ALTER TABLE "ProfilVersand" ADD CONSTRAINT "ProfilVersand_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfilVersand" ADD CONSTRAINT "ProfilVersand_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfilVersand" ADD CONSTRAINT "ProfilVersand_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;
