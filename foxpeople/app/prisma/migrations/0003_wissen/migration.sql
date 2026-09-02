CREATE TABLE "WissenDokument" ("id" TEXT NOT NULL, "titel" TEXT NOT NULL, "quelle" TEXT, "kategorie" TEXT NOT NULL DEFAULT 'Firmenwissen', "zeichen" INTEGER NOT NULL DEFAULT 0, "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WissenDokument_pkey" PRIMARY KEY ("id"));
CREATE TABLE "WissenChunk" ("id" TEXT NOT NULL, "dokumentId" TEXT NOT NULL, "index" INTEGER NOT NULL, "text" TEXT NOT NULL, CONSTRAINT "WissenChunk_pkey" PRIMARY KEY ("id"));
CREATE INDEX "WissenChunk_dokumentId_idx" ON "WissenChunk"("dokumentId");
ALTER TABLE "WissenChunk" ADD CONSTRAINT "WissenChunk_dokumentId_fkey" FOREIGN KEY ("dokumentId") REFERENCES "WissenDokument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WissenChunk" ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('german', "text")) STORED;
CREATE INDEX "WissenChunk_tsv_idx" ON "WissenChunk" USING GIN ("tsv");
CREATE TABLE "AssistentNachricht" ("id" TEXT NOT NULL, "unterhaltungId" TEXT NOT NULL, "nutzerId" TEXT NOT NULL, "rolle" TEXT NOT NULL, "text" TEXT NOT NULL, "quellen" JSONB, "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AssistentNachricht_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AssistentNachricht_unterhaltungId_idx" ON "AssistentNachricht"("unterhaltungId");
CREATE TABLE "Monatsreport" ("id" TEXT NOT NULL, "jahr" INTEGER NOT NULL, "monat" INTEGER NOT NULL, "kostenstelleId" TEXT, "inhalt" TEXT NOT NULL, "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "erstelltVon" TEXT, CONSTRAINT "Monatsreport_pkey" PRIMARY KEY ("id"));
