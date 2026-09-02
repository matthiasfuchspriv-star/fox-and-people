-- Fehlerprotokoll: was im Hintergrund schiefgeht, soll nicht nur im Container-Log stehen.
CREATE TABLE "Fehlerprotokoll" (
  "id"         TEXT PRIMARY KEY,
  "quelle"     TEXT NOT NULL,
  "stufe"      TEXT NOT NULL DEFAULT 'FEHLER',
  "meldung"    TEXT NOT NULL,
  "detail"     TEXT,
  "anzahl"     INTEGER NOT NULL DEFAULT 1,
  "zuerstAm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "zuletztAm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "erledigtAm" TIMESTAMP(3),
  "gemeldetAm" TIMESTAMP(3)
);

-- Derselbe Fehler soll eine Zeile mit Zähler sein, nicht tausend Zeilen. Der Schlüssel ist die
-- Quelle plus die Meldung; solange die Zeile offen ist, wird nur hochgezählt.
CREATE UNIQUE INDEX "Fehlerprotokoll_offen_idx" ON "Fehlerprotokoll"("quelle", "meldung") WHERE "erledigtAm" IS NULL;
CREATE INDEX "Fehlerprotokoll_zuletzt_idx" ON "Fehlerprotokoll"("zuletztAm" DESC);
