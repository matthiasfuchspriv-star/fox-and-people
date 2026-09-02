-- v2.7: Umsatzsteuerbetrag als eigenes Feld, damit Netto + USt = Brutto centgenau stimmt.
-- Vorher wurde die USt im PDF als Differenz Brutto minus Netto gerechnet; beide Werte waren ungerundet.
ALTER TABLE "Rechnung" ADD COLUMN IF NOT EXISTS "ust" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Bestehende Rechnungen nachziehen: USt aus dem Nettobetrag, Brutto als Summe – auf Cent gerundet.
UPDATE "Rechnung"
   SET "netto" = ROUND("netto"::numeric, 2),
       "ust"   = ROUND(("netto" * "ustProzent" / 100)::numeric, 2),
       "brutto" = ROUND("netto"::numeric, 2) + ROUND(("netto" * "ustProzent" / 100)::numeric, 2)
 WHERE "ust" = 0;

-- Indizes für den Mahnlauf und die Monatsabrechnung
CREATE INDEX IF NOT EXISTS "Rechnung_status_faelligAm_idx" ON "Rechnung"("status", "faelligAm");
CREATE INDEX IF NOT EXISTS "Monatsabrechnung_jahr_monat_status_idx" ON "Monatsabrechnung"("jahr", "monat", "status");
CREATE INDEX IF NOT EXISTS "Monatsabrechnung_personId_idx" ON "Monatsabrechnung"("personId");
