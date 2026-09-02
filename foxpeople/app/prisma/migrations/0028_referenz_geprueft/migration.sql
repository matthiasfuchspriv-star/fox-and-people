-- Nachweis, dass der Referenzlohn beim Beschäftiger erfragt wurde (§ 10 AÜG / LSD-BG).
-- Ohne Lohntafel im System darf ein Einsatz nur entstehen, wenn jemand ausdrücklich bestätigt hat,
-- dass er nachgefragt hat – bei einer Prüfung zählt der dokumentierte Vorgang, nicht die Absicht.
ALTER TABLE "Einsatz" ADD COLUMN "referenzGeprueftAm" TIMESTAMP(3);
ALTER TABLE "Einsatz" ADD COLUMN "referenzGeprueftVon" TEXT;
