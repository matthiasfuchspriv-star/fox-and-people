CREATE TABLE "Controllingkosten" (
  "id" TEXT NOT NULL,
  "jahr" INTEGER NOT NULL,
  "gesamtkosten" DOUBLE PRECISION NOT NULL,
  "kostenProMitarbeiterMonat" DOUBLE PRECISION NOT NULL,
  "notiz" TEXT,
  "aktualisiertAm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Controllingkosten_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Controllingkosten_jahr_key" ON "Controllingkosten"("jahr");
