DELETE FROM "Rechnungsposition" WHERE "rechnungId" IN (SELECT id FROM "Rechnung" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%')) OR "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann');
UPDATE "Dokument" SET "rechnungId"=NULL WHERE "rechnungId" IN (SELECT id FROM "Rechnung" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%'));
DELETE FROM "Rechnung" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%');
DELETE FROM "Monatsabrechnung" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%') OR "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann');
UPDATE "Dokument" SET "vertragId"=NULL WHERE "vertragId" IN (SELECT id FROM "Vertrag" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann') OR "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%'));
DELETE FROM "Vertrag" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann') OR "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%');
DELETE FROM "Angebotsposition" WHERE "angebotId" IN (SELECT id FROM "Angebot" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%'));
UPDATE "Dokument" SET "angebotId"=NULL WHERE "angebotId" IN (SELECT id FROM "Angebot" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%'));
DELETE FROM "Angebot" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%');
DELETE FROM "Aufgabe" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann') OR "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%') OR typ IN ('PROVISION_FREIGABE','AUEG_STATISTIK');
DELETE FROM "Einsatz" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%') OR "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann');
DELETE FROM "Dokument" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann') OR "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%');
DELETE FROM "Zeitbuchung" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann');
DELETE FROM "Aktivitaet" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname='Testmann') OR "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%');
UPDATE "Empfehlung" SET "empfohlenePersonId"=NULL WHERE "empfohlenePersonId" IN (SELECT id FROM "Person" WHERE nachname='Testmann');
DELETE FROM "Person" WHERE nachname='Testmann';
DELETE FROM "Ansprechpartner" WHERE "kundeId" IN (SELECT id FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%');
DELETE FROM "Kunde" WHERE firmenname LIKE 'Heindl Testkunde%';
DELETE FROM "Monatsreport"; DELETE FROM "AssistentNachricht"; DELETE FROM "Controllingkosten"; DELETE FROM "Provisionsabrechnung"; DELETE FROM "Planwert";

-- v2.1
DELETE FROM "Uebernahme";
DELETE FROM "Sperre";
DELETE FROM "KundenPortalToken";

-- Zähler der Missbrauchsbremse zurücksetzen, sonst blockt sie wiederholte Testläufe
DELETE FROM "Zugriffszaehler";

-- Testimporte des Bewerber-Imports zuruecksetzen
DELETE FROM "Qualifikation" WHERE "personId" IN (SELECT id FROM "Person" WHERE "importQuelle" LIKE 'AMS Melk%');
DELETE FROM "Person" WHERE "importQuelle" LIKE 'AMS Melk%';
DELETE FROM "Dokument" WHERE kategorie = 'Import';

-- v2.10: Testimporte der Mitarbeiterliste und Löschprüfungen
DELETE FROM "Qualifikation" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname IN ('Prueflohn','Prüfmann','ZZTest'));
DELETE FROM "Person" WHERE nachname IN ('Prueflohn','Prüfmann','ZZTest');
DELETE FROM "Kunde" WHERE firmenname = 'ZZ Prüf GmbH';

-- v2.10.1: Testimport aus dem Fremdsystem-Layout
DELETE FROM "Qualifikation" WHERE "personId" IN (SELECT id FROM "Person" WHERE nachname = 'Fremdliste');
DELETE FROM "Person" WHERE nachname = 'Fremdliste';

-- v2.11: Ansprechpartner aus dem Anrede-Test
DELETE FROM "Ansprechpartner" WHERE name = 'Josef Anredetest';

-- v2.13: Kostenpositionen und Profilversand aus dem Testlauf
DELETE FROM "Kostenposition" WHERE bezeichnung LIKE 'E2E %';
DELETE FROM "ProfilVersand";
DELETE FROM "Berufserfahrung" WHERE firma = 'Muster Metall GmbH';

-- App-Lauf: eingereichte und bestätigte Stundennachweise der Testperson. Ohne das steht der
-- Nachweis beim nächsten Lauf auf BESTAETIGT, die Felder sind schreibgeschützt und der Lauf
-- scheitert an einer Stelle, die mit der eigentlichen Prüfung nichts zu tun hat.
DELETE FROM "Wochenstatus" WHERE "personId" IN (SELECT id FROM "Person" WHERE vorname = 'Anna');
DELETE FROM "Stundennachweis" WHERE "personId" IN (SELECT id FROM "Person" WHERE vorname = 'Anna');
-- Und die Freischaltung im Einsatz zurücknehmen: sonst ist der Stundenzettel schon beim ersten
-- Aufruf da und die Prüfung "ohne Freischaltung kein Stundenzettel" fällt durch.
UPDATE "Einsatz" SET "stundenerfassungApp" = false WHERE "personId" IN (SELECT id FROM "Person" WHERE vorname = 'Anna');
-- Datenschutz-Bestätigung der Testperson zurücksetzen: sonst fehlt das Häkchen im Profil und der
-- Lauf wartet auf ein Feld, das es nach dem ersten Durchgang zu Recht nicht mehr gibt.
UPDATE "Person" SET "datenschutzAkzeptiertAm" = NULL, "datenschutzVersion" = NULL WHERE vorname = 'Anna';
-- Systemprotokoll: der Probelauf des Berichts merkt sich das Datum und würde beim zweiten
-- Durchgang "heute schon gesendet" melden, statt zu senden.
DELETE FROM "Einstellung" WHERE key = 'tagesmailZuletzt';
DELETE FROM "MailLog" WHERE "referenzTyp" = 'Tagesmail';
-- Anmeldebremse zurücksetzen: Nach mehreren Durchläufen hintereinander greift die Sperre gegen
-- Durchprobieren, und der Lauf scheitert schon an der Anmeldung.
DELETE FROM "Zugriffszaehler";
-- Freie Rechnung aus dem Testlauf. Reihenfolge zählt: Zur freien Rechnung gehört eine Zeile in der
-- Monatsabrechnung (damit der Erlös im DB1 ankommt). Die muss zuerst weg, sonst hält der
-- Fremdschlüssel die Rechnung fest, das Aufräumen bricht ab und der nächste Lauf scheitert an Resten.
DELETE FROM "Monatsabrechnung" WHERE "rechnungId" IN (
  SELECT "rechnungId" FROM "Rechnungsposition" WHERE beschreibung LIKE 'E2E %' AND "rechnungId" IS NOT NULL
);
DELETE FROM "Rechnungsposition" WHERE beschreibung LIKE 'E2E %';
DELETE FROM "Rechnung" r
 WHERE NOT EXISTS (SELECT 1 FROM "Rechnungsposition" p WHERE p."rechnungId" = r.id)
   AND NOT EXISTS (SELECT 1 FROM "Monatsabrechnung" m WHERE m."rechnungId" = r.id)
   AND r."erstelltAm" > now() - interval '1 day';
