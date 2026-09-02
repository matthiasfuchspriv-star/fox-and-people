-- v2.1: Referenzlohn je Beschäftiger-KV, AZG-Zeitaufzeichnung, Bewilligungs-/Dokumentenmonitor,
-- Recruiting-Pipeline, Sperrlisten-Katalog, Übernahmegebühr und Kundenportal light.

-- Kollektivvertrag: Referenzlohn-Stammdaten
ALTER TABLE "Kollektivvertrag"
  ADD COLUMN IF NOT EXISTS "gultigBis" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "monatsteiler" DOUBLE PRECISION NOT NULL DEFAULT 167,
  ADD COLUMN IF NOT EXISTS "wochenstunden" DOUBLE PRECISION NOT NULL DEFAULT 38.5,
  ADD COLUMN IF NOT EXISTS "istReferenz" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "referenzzuschlagPruefen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hinweis" TEXT,
  ADD COLUMN IF NOT EXISTS "quelle" TEXT;

ALTER TABLE "KvLohnstufe"
  ADD COLUMN IF NOT EXISTS "nach2Jahren" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "nach4Jahren" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "gultigAb" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "KvLohnstufe_kvId_gultigAb_idx" ON "KvLohnstufe"("kvId", "gultigAb");

-- Kunde: Referenz-KV, Rahmenvertragspflicht, UID-Prüfung, AGB, Übernahme
ALTER TABLE "Kunde"
  ADD COLUMN IF NOT EXISTS "referenzKvId" TEXT,
  ADD COLUMN IF NOT EXISTS "rahmenvertragPflicht" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "uidGeprueftAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "uidGeprueftStufe" TEXT,
  ADD COLUMN IF NOT EXISTS "uidGueltig" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "uidPruefIntervallTage" INTEGER NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS "agbVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "agbAkzeptiertAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "agbAkzeptiertVon" TEXT,
  ADD COLUMN IF NOT EXISTS "uebernahmeProzent" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  ADD COLUMN IF NOT EXISTS "uebernahmeMindest" DOUBLE PRECISION NOT NULL DEFAULT 2500,
  ADD COLUMN IF NOT EXISTS "vermittlungProzent" DOUBLE PRECISION NOT NULL DEFAULT 0.30;
DO $$ BEGIN
  ALTER TABLE "Kunde" ADD CONSTRAINT "Kunde_referenzKvId_fkey" FOREIGN KEY ("referenzKvId") REFERENCES "Kollektivvertrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Person: Ausweis, Sperrcode, Recruiting-Pipeline
ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "gesperrtCode" TEXT,
  ADD COLUMN IF NOT EXISTS "ausweisArt" TEXT,
  ADD COLUMN IF NOT EXISTS "ausweisNummer" TEXT,
  ADD COLUMN IF NOT EXISTS "ausweisGultigBis" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ausweisDokumentId" TEXT,
  ADD COLUMN IF NOT EXISTS "quelle" TEXT,
  ADD COLUMN IF NOT EXISTS "pipelineStufe" TEXT DEFAULT 'NEU',
  ADD COLUMN IF NOT EXISTS "pipelineAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "erstkontaktAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "absagegrund" TEXT,
  ADD COLUMN IF NOT EXISTS "absageAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "talentpool" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "wiedervorlageAm" TIMESTAMP(3);

-- Einsatz: Time-to-Fill und Referenzlohn
ALTER TABLE "Einsatz"
  ADD COLUMN IF NOT EXISTS "angefragtAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "besetztAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "referenzlohn" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "referenzzuschlag" DOUBLE PRECISION;

-- Stundennachweis: AZG-Zeitaufzeichnung
ALTER TABLE "Stundennachweis"
  ADD COLUMN IF NOT EXISTS "eintraege" JSONB,
  ADD COLUMN IF NOT EXISTS "summeNormal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "summeUe50" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "summeUe100" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quelle" TEXT NOT NULL DEFAULT 'APP',
  ADD COLUMN IF NOT EXISTS "bestaetigtVon" TEXT,
  ADD COLUMN IF NOT EXISTS "bestaetigtAm" TIMESTAMP(3);
UPDATE "Stundennachweis" SET "summeNormal" = "summe" WHERE "summeNormal" = 0 AND "summe" > 0;

-- Übernahme (Abwerbung)
CREATE TABLE IF NOT EXISTS "Uebernahme" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "einsatzId" TEXT,
  "gemeldetAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uebernahmeAm" TIMESTAMP(3) NOT NULL,
  "bruttojahresentgelt" DOUBLE PRECISION NOT NULL,
  "monateUeberlassen" INTEGER NOT NULL DEFAULT 0,
  "prozent" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  "mindesthonorar" DOUBLE PRECISION NOT NULL DEFAULT 2500,
  "honorar" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OFFEN',
  "rechnungId" TEXT,
  "notiz" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Uebernahme_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Uebernahme_kundeId_idx" ON "Uebernahme"("kundeId");
CREATE INDEX IF NOT EXISTS "Uebernahme_personId_idx" ON "Uebernahme"("personId");
DO $$ BEGIN
  ALTER TABLE "Uebernahme" ADD CONSTRAINT "Uebernahme_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "Uebernahme" ADD CONSTRAINT "Uebernahme_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "Uebernahme" ADD CONSTRAINT "Uebernahme_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sperrgründe und Sperren
CREATE TABLE IF NOT EXISTS "Sperrgrund" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "bezeichnung" TEXT NOT NULL,
  "sperrtEinsatz" BOOLEAN NOT NULL DEFAULT true,
  "sensibel" BOOLEAN NOT NULL DEFAULT false,
  "reihenfolge" INTEGER NOT NULL DEFAULT 0,
  "aktiv" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Sperrgrund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Sperrgrund_code_key" ON "Sperrgrund"("code");

CREATE TABLE IF NOT EXISTS "Sperre" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "kundeId" TEXT,
  "grundId" TEXT,
  "ab" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bis" TIMESTAMP(3),
  "notiz" TEXT,
  "erfasstVon" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sperre_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Sperre_personId_idx" ON "Sperre"("personId");
CREATE INDEX IF NOT EXISTS "Sperre_kundeId_idx" ON "Sperre"("kundeId");
DO $$ BEGIN
  ALTER TABLE "Sperre" ADD CONSTRAINT "Sperre_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "Sperre" ADD CONSTRAINT "Sperre_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "Sperre" ADD CONSTRAINT "Sperre_grundId_fkey" FOREIGN KEY ("grundId") REFERENCES "Sperrgrund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Kundenportal light
CREATE TABLE IF NOT EXISTS "KundenPortalToken" (
  "id" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "an" TEXT NOT NULL,
  "name" TEXT,
  "zweck" TEXT NOT NULL DEFAULT 'STUNDEN',
  "jahr" INTEGER,
  "kw" INTEGER,
  "gultigBis" TIMESTAMP(3) NOT NULL,
  "verwendetAm" TIMESTAMP(3),
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KundenPortalToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KundenPortalToken_tokenHash_key" ON "KundenPortalToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "KundenPortalToken_kundeId_idx" ON "KundenPortalToken"("kundeId");
DO $$ BEGIN
  ALTER TABLE "KundenPortalToken" ADD CONSTRAINT "KundenPortalToken_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Katalog der Sperrgründe befüllen
INSERT INTO "Sperrgrund" ("id","code","bezeichnung","sperrtEinsatz","sensibel","reihenfolge") VALUES
  ('sg_leistung','LEISTUNG','Leistung nicht ausreichend',true,false,10),
  ('sg_verhalten','VERHALTEN','Verhalten / Zusammenarbeit',true,false,20),
  ('sg_unzuverlaessig','UNZUVERLAESSIG','Unentschuldigt gefehlt / unzuverlässig',true,false,30),
  ('sg_sicherheit','SICHERHEIT','Verstoß gegen Sicherheitsvorschriften',true,false,40),
  ('sg_qualifikation','QUALIFIKATION','Qualifikation/Nachweis fehlt oder abgelaufen',true,false,50),
  ('sg_bewilligung','BEWILLIGUNG','Arbeitsbewilligung fehlt oder abgelaufen',true,false,60),
  ('sg_kundenwunsch','KUNDENWUNSCH','Auf Wunsch des Beschäftigers',true,false,70),
  ('sg_eigenwunsch','EIGENWUNSCH','Auf Wunsch des Mitarbeiters',true,false,80),
  ('sg_dokumente','DOKUMENTE','Unterlagen unvollständig',true,false,90),
  ('sg_sonstiges','SONSTIGES','Sonstiges (siehe Notiz)',true,false,100)
ON CONFLICT ("code") DO NOTHING;

-- Neue Aufgabentypen für den Verfallsmonitor und die Übernahme
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'BEWILLIGUNG_ABLAUF';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'AUSWEIS_ABLAUF';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'UID_PRUEFUNG';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'AGB_FEHLT';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'TALENTPOOL_WIEDERVORLAGE';
ALTER TYPE "AufgabeTyp" ADD VALUE IF NOT EXISTS 'UEBERNAHME_VERRECHNEN';
