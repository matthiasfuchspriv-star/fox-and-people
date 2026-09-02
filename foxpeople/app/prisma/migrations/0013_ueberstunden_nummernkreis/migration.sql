-- Überstunden und Zulagen je Monat getrennt (eigene Rechnungspositionen)
ALTER TABLE "Monatsabrechnung" ADD COLUMN IF NOT EXISTS "ueberstunden50" DOUBLE PRECISION;
ALTER TABLE "Monatsabrechnung" ADD COLUMN IF NOT EXISTS "ueberstunden100" DOUBLE PRECISION;
ALTER TABLE "Monatsabrechnung" ADD COLUMN IF NOT EXISTS "zulagenBetrag" DOUBLE PRECISION;
-- Rechnungsnummern firmenweit im Format JJJJNNN (2026008 …)
UPDATE "Nummernkreis" SET "format" = '{jahr}{nnn}' WHERE "typ" = 'RE';
-- Zahlungsziel Standard: sofort
UPDATE "Kunde" SET "zahlungszielTage" = 0 WHERE "zahlungszielTage" = 14;
-- Bankverbindung der Firma (nur wenn noch Platzhalter)
UPDATE "Einstellung" SET "value" = "value" || '{"iban":"AT53 1500 0040 7108 4307","bic":"OBKLAT2L","bank":"Oberbank AG"}'::jsonb
  WHERE "key" = 'firma' AND (("value"->>'iban') IS NULL OR ("value"->>'iban') LIKE 'AT__ %' OR ("value"->>'iban') = '');
