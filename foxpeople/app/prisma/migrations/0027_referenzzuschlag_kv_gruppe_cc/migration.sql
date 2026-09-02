-- CC-Adresse für Rechnungen (Buchhaltung des Kunden, Steuerberater, eigene Ablage)
ALTER TABLE "Kunde" ADD COLUMN "rechnungCcEmail" TEXT;

-- Zweiter Referenz-KV: Beschäftiger führen für Arbeiter und Angestellte getrennte Kollektivverträge.
ALTER TABLE "Kunde" ADD COLUMN "referenzKvAngestellteId" TEXT;
ALTER TABLE "Kunde" ADD CONSTRAINT "Kunde_referenzKvAngestellteId_fkey"
  FOREIGN KEY ("referenzKvAngestellteId") REFERENCES "Kollektivvertrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Kunde_referenzKvAngestellteId_idx" ON "Kunde"("referenzKvAngestellteId");

-- Für wen der KV gilt: ARBEITER, ANGESTELLTE oder BEIDE
ALTER TABLE "Kollektivvertrag" ADD COLUMN "gruppe" TEXT NOT NULL DEFAULT 'ARBEITER';

-- Referenzzuschlag je Beschäftigungsgruppe in Prozent (Spalte "Satz Ref. Z" in der Lohnverrechnung)
ALTER TABLE "KvLohnstufe" ADD COLUMN "referenzzuschlagProzent" DOUBLE PRECISION;

-- Bestehende KV zuordnen, soweit der Name es hergibt
UPDATE "Kollektivvertrag" SET "gruppe" = 'ANGESTELLTE' WHERE name ILIKE '%angestellte%';
UPDATE "Kollektivvertrag" SET "gruppe" = 'BEIDE' WHERE kuerzel = 'AKÜ';

-- Metalltechnische Industrie (Arbeiter): Referenzzuschlagsätze laut Lohnverrechnung, Stichtag 1.11.2025
UPDATE "KvLohnstufe" SET "referenzzuschlagProzent" = 9
  WHERE "beschaeftigungsgruppe" = 'A' AND "kvId" IN (SELECT id FROM "Kollektivvertrag" WHERE kuerzel = 'MTI');
UPDATE "KvLohnstufe" SET "referenzzuschlagProzent" = 13
  WHERE "beschaeftigungsgruppe" IN ('B', 'C') AND "kvId" IN (SELECT id FROM "Kollektivvertrag" WHERE kuerzel = 'MTI');
UPDATE "KvLohnstufe" SET "referenzzuschlagProzent" = 18
  WHERE "beschaeftigungsgruppe" IN ('D', 'E', 'F', 'G', 'H', 'I', 'J', 'K') AND "kvId" IN (SELECT id FROM "Kollektivvertrag" WHERE kuerzel = 'MTI');
