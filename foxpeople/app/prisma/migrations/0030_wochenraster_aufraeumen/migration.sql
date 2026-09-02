-- Verwaiste Wochenraster entfernen.
--
-- Bisher wurde das Wochenraster beim Löschen eines Einsatzes nur entkoppelt (einsatzId auf NULL),
-- nicht gelöscht. Dadurch standen in der Einsatzplanung Sollstunden für Monate, in denen es
-- nachweislich keinen Einsatz gab – im August 8 Stunden, im September 169, bei null Mitarbeitern im
-- Raster. Eine Zahl ohne Grundlage ist schlimmer als keine Zahl.
--
-- Weg kommt nur, was zu keinem Einsatz gehört UND zu einer Person, die überhaupt keinen Einsatz hat.
-- Wochenraster von Mitarbeitern mit laufendem oder geplantem Einsatz bleiben unangetastet.
DELETE FROM "Wochenstatus"
WHERE "einsatzId" IS NULL
  AND "personId" NOT IN (SELECT DISTINCT "personId" FROM "Einsatz");
