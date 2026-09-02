-- Zulagen nicht mehr pauschal auf alle Stunden: je Zulage die tatsächliche Menge (Stunden bzw. Tage)
-- lt. Stundenzettel, erfasst in der Monatsabrechnung. Dazu die Art der Leistung an der Abrechnungszeile,
-- damit freie Rechnungen (Direktvermittlung) in der Provision mit dem richtigen Satz ankommen.
ALTER TABLE "Monatsabrechnung" ADD COLUMN IF NOT EXISTS "zulagenMengen" JSONB;
ALTER TABLE "Monatsabrechnung" ADD COLUMN IF NOT EXISTS "art" TEXT;
