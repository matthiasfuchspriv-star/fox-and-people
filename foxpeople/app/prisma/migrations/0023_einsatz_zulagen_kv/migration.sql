-- Wie ein Einsatz geendet hat – steht in der Einsatzhistorie des Mitarbeiters
ALTER TABLE "Einsatz" ADD COLUMN IF NOT EXISTS "aufloesungsart" TEXT;

-- Zulagen gelten oft nur für einen bestimmten Beschäftiger-Kollektivvertrag (z. B. Schichtzulagen
-- der Metallindustrie) oder nur bei einem bestimmten Schichtmodell. Dann schlägt die Software sie
-- beim Einsatz von selbst vor, statt sie in einer langen Liste zum Suchen anzubieten.
ALTER TABLE "Zulage" ADD COLUMN IF NOT EXISTS "kvId" TEXT;
ALTER TABLE "Zulage" ADD COLUMN IF NOT EXISTS "schichtmodelle" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Zulage" ADD CONSTRAINT "Zulage_kvId_fkey" FOREIGN KEY ("kvId") REFERENCES "Kollektivvertrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Die Schichtzulagen aus den Stammdaten gleich richtig verknüpfen
UPDATE "Zulage" SET "schichtmodelle" = ARRAY['ZWEI_SCHICHT'] WHERE kuerzel = 'SCHICHT2';
UPDATE "Zulage" SET "schichtmodelle" = ARRAY['DREI_SCHICHT'] WHERE kuerzel = 'SCHICHT3';
