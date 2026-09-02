-- Tagesgenaue Einsatzplanung
ALTER TABLE "Wochenstatus" ADD COLUMN IF NOT EXISTS "tage" TEXT;
-- Rechnungsnummern: frei gewordene Nummern wiederverwenden
ALTER TABLE "Nummernkreis" ADD COLUMN IF NOT EXISTS "freieNummern" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
-- KV Arbeitskräfteüberlassung Arbeiter/innen 2026 (WKO, gültig ab 1.1.2026, +2,30 %): Beschäftigungsgruppen A–F
DO $$
DECLARE kv_id TEXT;
BEGIN
  SELECT id INTO kv_id FROM "Kollektivvertrag" WHERE kuerzel = 'AKÜ' LIMIT 1;
  IF kv_id IS NOT NULL THEN
    DELETE FROM "KvLohnstufe" WHERE "kvId" = kv_id;
    INSERT INTO "KvLohnstufe" ("id", "kvId", "beschaeftigungsgruppe", "bezeichnung", "mindestStundenlohn") VALUES
      (md5(kv_id || 'A'), kv_id, 'A', 'Ungelernte Arbeitnehmer/innen (1. Jahr Betriebszugehörigkeit)', 13.90),
      (md5(kv_id || 'B'), kv_id, 'B', 'Angelernte Arbeitnehmer/innen', 13.90),
      (md5(kv_id || 'C'), kv_id, 'C', 'Qualifizierte Arbeitnehmer/innen', 15.62),
      (md5(kv_id || 'D'), kv_id, 'D', 'Facharbeiter/innen', 17.50),
      (md5(kv_id || 'E'), kv_id, 'E', 'Qualifizierte Facharbeiter/innen', 20.14),
      (md5(kv_id || 'F'), kv_id, 'F', 'Techniker/innen', 24.82);
    UPDATE "Kollektivvertrag" SET "name" = 'KV Arbeitskräfteüberlassung (Arbeiter/innen) 2026', "gultigAb" = '2026-01-01' WHERE id = kv_id;
  END IF;
END $$;
-- Kündigungsfristen: neue Hausregel (DG 21 Tage / DN 14 Tage zum Freitag) → gespeicherte Fristentabelle zurücksetzen
DELETE FROM "Einstellung" WHERE "key" = 'fristen';
