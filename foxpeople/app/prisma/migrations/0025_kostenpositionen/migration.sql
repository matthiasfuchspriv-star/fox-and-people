-- Kosten je Monat statt einer Jahressumme.
--
-- Bisher stand im Controlling nur „Gesamtkosten pro Jahr“. Damit lässt sich nicht erkennen, welche
-- Kosten den DB1 auffressen und ob sie steigen. Jetzt wird je Monat einzeln erfasst, getrennt nach
-- Fixkosten (jeden Monat gleich, werden in den Folgemonat übernommen) und variablen Kosten.
CREATE TABLE IF NOT EXISTS "Kostenposition" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL DEFAULT '',
  "jahr" INTEGER NOT NULL,
  "monat" INTEGER NOT NULL,
  "bezeichnung" TEXT NOT NULL,
  "kategorie" TEXT NOT NULL DEFAULT 'Sonstiges',
  "betrag" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fix" BOOLEAN NOT NULL DEFAULT true,
  "notiz" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Kostenposition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Kostenposition_jahr_monat_idx" ON "Kostenposition" ("jahr", "monat");
CREATE INDEX IF NOT EXISTS "Kostenposition_kostenstelleId_jahr_idx" ON "Kostenposition" ("kostenstelleId", "jahr");
