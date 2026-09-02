-- v2.2: Mitarbeiter-App – Push-Benachrichtigungen, Datenschutz-Einwilligung, App-Sperre, Lohn-Vorschau

ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "appSprache" TEXT NOT NULL DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS "datenschutzAkzeptiertAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "datenschutzVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "appGesperrtAm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lohnvorschauAus" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PushAbo" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "geraet" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "zuletztOk" TIMESTAMP(3),
  "fehler" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PushAbo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushAbo_endpoint_key" ON "PushAbo"("endpoint");
CREATE INDEX IF NOT EXISTS "PushAbo_personId_idx" ON "PushAbo"("personId");
DO $$ BEGIN
  ALTER TABLE "PushAbo" ADD CONSTRAINT "PushAbo_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
