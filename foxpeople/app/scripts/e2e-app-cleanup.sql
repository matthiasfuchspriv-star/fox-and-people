DELETE FROM "Stundennachweis"; DELETE FROM "Nachricht"; DELETE FROM "Empfehlung"; DELETE FROM "AppLogin";
DELETE FROM "Abwesenheit" WHERE quelle='APP';
DELETE FROM "Aufgabe" WHERE typ IN ('STUNDENNACHWEIS_PRUEFEN','KRANKMELDUNG','URLAUBSANTRAG','DOKUMENT_PRUEFEN','EMPFEHLUNG_PRAEMIE') OR "referenzTyp"='Empfehlung';
DELETE FROM "Qualifikation" WHERE notiz LIKE 'Über die App%';
DELETE FROM "Dokument" WHERE quelle='APP';
UPDATE "Person" SET "profilBestaetigtAm"=NULL, notfallkontakt=NULL, "appZuletztAktiv"=NULL WHERE nachname='Gruber';
UPDATE "Monatsabrechnung" SET stunden=NULL WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Gruber') AND jahr=2026 AND monat=8 AND stunden=38.5;
DELETE FROM "Rechnungsposition" WHERE "rechnungId" IN (SELECT "rechnungId" FROM "Monatsabrechnung" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Gruber') AND jahr=2026 AND monat=8 AND "rechnungId" IS NOT NULL);
UPDATE "Dokument" SET "rechnungId"=NULL WHERE "rechnungId" IN (SELECT "rechnungId" FROM "Monatsabrechnung" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Gruber') AND jahr=2026 AND monat=8 AND "rechnungId" IS NOT NULL);
DELETE FROM "Rechnung" WHERE id IN (SELECT "rechnungId" FROM "Monatsabrechnung" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Gruber') AND jahr=2026 AND monat=8 AND "rechnungId" IS NOT NULL);
UPDATE "Monatsabrechnung" SET status='OFFEN', "rechnungId"=NULL, stunden=NULL WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Gruber') AND jahr=2026 AND monat=8;

-- v2.2
UPDATE "Person" SET "datenschutzAkzeptiertAm" = NULL, "datenschutzVersion" = NULL, "appGesperrtAm" = NULL;
DELETE FROM "PushAbo";

-- v2.3
DELETE FROM "Empfehlung" WHERE "name" IN ('Max Beispiel','Lena Freundin');
DELETE FROM "Aufgabe" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname IN ('Freundin','Aushang'));
DELETE FROM "Aktivitaet" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname IN ('Freundin','Aushang'));
DELETE FROM "Person" WHERE nachname IN ('Freundin','Aushang');

-- Zähler der Missbrauchsbremse zurücksetzen, sonst blockt sie wiederholte Testläufe
DELETE FROM "Zugriffszaehler";

-- Stundenerfassung in der App zuruecksetzen (der Testlauf schaltet sie selbst frei)
UPDATE "Einsatz" SET "stundenerfassungApp" = false;
