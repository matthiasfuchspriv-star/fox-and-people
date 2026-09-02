-- v2.5: Zeiterfassung je Einsatz freischalten, Missbrauchsbremse, Sitzungsgueltigkeit

-- Stundenerfassung in der Mitarbeiter-App ist standardmaessig AUS und wird je Einsatz freigeschaltet
ALTER TABLE "Einsatz" ADD COLUMN IF NOT EXISTS "stundenerfassungApp" BOOLEAN NOT NULL DEFAULT false;

-- Zaehler gegen Massenanfragen (Anmeldecodes, Login, Bewerbungsformular)
CREATE TABLE IF NOT EXISTS "Zugriffszaehler" (
  "id"        TEXT PRIMARY KEY,
  "schluessel" TEXT NOT NULL,
  "fenster"   TIMESTAMP(3) NOT NULL,
  "anzahl"    INTEGER NOT NULL DEFAULT 0,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Zugriffszaehler_schluessel_fenster_key" ON "Zugriffszaehler"("schluessel", "fenster");
CREATE INDEX IF NOT EXISTS "Zugriffszaehler_fenster_idx" ON "Zugriffszaehler"("fenster");

-- Buero-Sitzungen sollen bei Passwortwechsel, Rollenwechsel oder Deaktivierung sofort ungueltig werden
ALTER TABLE "Nutzer" ADD COLUMN IF NOT EXISTS "sitzungenGueltigAb" TIMESTAMP(3);

-- Indizes fuer haeufige Abfragen
CREATE INDEX IF NOT EXISTS "Dokument_personId_idx" ON "Dokument"("personId");
CREATE INDEX IF NOT EXISTS "Dokument_kundeId_idx" ON "Dokument"("kundeId");
CREATE INDEX IF NOT EXISTS "Aktivitaet_personId_idx" ON "Aktivitaet"("personId");
CREATE INDEX IF NOT EXISTS "Aktivitaet_kundeId_idx" ON "Aktivitaet"("kundeId");
