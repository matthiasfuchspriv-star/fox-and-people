CREATE TYPE "Rolle" AS ENUM ('SYSTEMADMIN', 'ZENTRALE', 'KOSTENSTELLEN_LEITUNG', 'SACHBEARBEITUNG');

CREATE TYPE "KundeStatus" AS ENUM ('AKTIV', 'INAKTIV');

CREATE TYPE "PersonStatus" AS ENUM ('SUCHT', 'VERMITTELT', 'GESPERRT', 'AUSGESCHIEDEN');

CREATE TYPE "AbwesenheitTyp" AS ENUM ('URLAUB', 'KRANKENSTAND', 'PFLEGEFREISTELLUNG', 'SONSTIGES');

CREATE TYPE "EinsatzStatus" AS ENUM ('GEPLANT', 'AKTIV', 'BEENDET', 'ABGEBROCHEN');

CREATE TYPE "Schichtmodell" AS ENUM ('TAG', 'ZWEI_SCHICHT', 'DREI_SCHICHT', 'FREI');

CREATE TYPE "AngebotStatus" AS ENUM ('ENTWURF', 'VERSENDET', 'ANGENOMMEN', 'ABGELEHNT', 'ABGELAUFEN');

CREATE TYPE "Kalkulationsart" AS ENUM ('UEBERLASSUNG', 'PAYROLL', 'VERMITTLUNG');

CREATE TYPE "VertragTyp" AS ENUM ('DIENSTVERTRAG', 'UEBERLASSUNGSVERTRAG', 'RAHMENVERTRAG', 'VERMITTLUNGSVERTRAG');

CREATE TYPE "VertragStatus" AS ENUM ('ENTWURF', 'VERSENDET', 'UNTERSCHRIEBEN', 'BEENDET');

CREATE TYPE "AbrechnungStatus" AS ENUM ('OFFEN', 'ABGERECHNET');

CREATE TYPE "RechnungStatus" AS ENUM ('ENTWURF', 'VERSENDET', 'TEILBEZAHLT', 'BEZAHLT', 'UEBERFAELLIG', 'STORNIERT');

CREATE TYPE "AufgabeTyp" AS ENUM ('QUALIFIKATION_ABLAUF', 'RAHMENVERTRAG_ABLAUF', 'RECHNUNG_UEBERFAELLIG', 'ANGEBOT_OFFEN', 'EINSATZ_ENDE', 'MANUELL');

CREATE TABLE "Kostenstelle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kuerzel" TEXT NOT NULL,
  "isZentrale" BOOLEAN NOT NULL DEFAULT false,
  "strasse" TEXT,
  "plz" TEXT,
  "ort" TEXT,
  "bundesland" TEXT NOT NULL DEFAULT 'Niederösterreich',
  "telefon" TEXT,
  "email" TEXT,
  "aktiv" BOOLEAN NOT NULL DEFAULT true,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Kostenstelle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Kostenstelle_kuerzel_key" ON "Kostenstelle"("kuerzel");

CREATE TABLE "Nutzer" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwortHash" TEXT NOT NULL,
  "rolle" "Rolle" NOT NULL,
  "kostenstelleId" TEXT,
  "totpSecret" TEXT,
  "aktiv" BOOLEAN NOT NULL DEFAULT true,
  "fehlversuche" INTEGER NOT NULL DEFAULT 0,
  "gesperrtBis" TIMESTAMP(3),
  "letzterLogin" TIMESTAMP(3),
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Nutzer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Nutzer_email_key" ON "Nutzer"("email");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nutzerId" TEXT,
  "nutzerName" TEXT NOT NULL,
  "aktion" TEXT NOT NULL,
  "entitaet" TEXT NOT NULL,
  "datensatzId" TEXT,
  "beschreibung" TEXT,
  "diff" JSONB,
  "ip" TEXT,
  "kostenstelleId" TEXT,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AbgabenSatzSet" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "gultigAb" TIMESTAMP(3) NOT NULL,
  "saetze" JSONB NOT NULL,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AbgabenSatzSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DzSatz" (
  "id" TEXT NOT NULL,
  "bundesland" TEXT NOT NULL,
  "satz" DOUBLE PRECISION NOT NULL,
  "gultigAb" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DzSatz_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DzSatz_bundesland_gultigAb_key" ON "DzSatz"("bundesland", "gultigAb");

CREATE TABLE "Kollektivvertrag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kuerzel" TEXT NOT NULL,
  "gultigAb" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Kollektivvertrag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KvLohnstufe" (
  "id" TEXT NOT NULL,
  "kvId" TEXT NOT NULL,
  "beschaeftigungsgruppe" TEXT NOT NULL,
  "bezeichnung" TEXT,
  "mindestStundenlohn" DOUBLE PRECISION,
  "mindestMonatsbrutto" DOUBLE PRECISION,
  CONSTRAINT "KvLohnstufe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Nummernkreis" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "typ" TEXT NOT NULL,
  "jahr" INTEGER NOT NULL,
  "letzteNummer" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Nummernkreis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Nummernkreis_kostenstelleId_typ_jahr_key" ON "Nummernkreis"("kostenstelleId", "typ", "jahr");

CREATE TABLE "Einstellung" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  CONSTRAINT "Einstellung_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Kunde" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "firmenname" TEXT NOT NULL,
  "kurzname" TEXT,
  "strasse" TEXT,
  "plz" TEXT,
  "ort" TEXT,
  "land" TEXT NOT NULL DEFAULT 'Österreich',
  "uid" TEXT,
  "telefon" TEXT,
  "email" TEXT,
  "rechnungsemail" TEXT,
  "website" TEXT,
  "zahlungszielTage" INTEGER NOT NULL DEFAULT 14,
  "skontoProzent" DOUBLE PRECISION,
  "status" "KundeStatus" NOT NULL DEFAULT 'AKTIV',
  "notizen" TEXT,
  "rahmenvertragBeginn" TIMESTAMP(3),
  "rahmenvertragEnde" TIMESTAMP(3),
  "kuendigungsfrist" TEXT,
  "erinnerungTageVorher" INTEGER NOT NULL DEFAULT 60,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiertAm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Kunde_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ansprechpartner" (
  "id" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "funktion" TEXT,
  "telefon" TEXT,
  "email" TEXT,
  "istHaupt" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Ansprechpartner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Kondition" (
  "id" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "rolle" TEXT NOT NULL,
  "stundensatz" DOUBLE PRECISION NOT NULL,
  "ueberstundenZuschlag" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "nachtZuschlag" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "wochenendZuschlag" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "gultigVon" TIMESTAMP(3),
  "gultigBis" TIMESTAMP(3),
  CONSTRAINT "Kondition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Person" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "status" "PersonStatus" NOT NULL DEFAULT 'SUCHT',
  "nachname" TEXT NOT NULL,
  "vorname" TEXT NOT NULL,
  "geburtsdatum" TIMESTAMP(3),
  "telefon" TEXT,
  "email" TEXT,
  "strasse" TEXT,
  "plz" TEXT,
  "ort" TEXT,
  "staatsangehoerigkeit" TEXT,
  "svnrEnc" TEXT,
  "svnrLast4" TEXT,
  "standardrolle" TEXT,
  "verfuegbarAb" TIMESTAMP(3),
  "verfuegbarSofort" BOOLEAN NOT NULL DEFAULT false,
  "hinterlegterKundeId" TEXT,
  "gesperrtSeit" TIMESTAMP(3),
  "gesperrtGrund" TEXT,
  "gesperrtVon" TEXT,
  "notizen" TEXT,
  "aufnahmedatum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kvId" TEXT,
  "beschaeftigungsgruppe" TEXT,
  "wochenstunden" DOUBLE PRECISION,
  "eintrittsdatum" TIMESTAMP(3),
  "austrittsdatum" TIMESTAMP(3),
  "urlaubsanspruchTage" INTEGER NOT NULL DEFAULT 25,
  "stundenlohn" DOUBLE PRECISION,
  "anonymisiertAm" TIMESTAMP(3),
  "importQuelle" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiertAm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Qualifikation" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "typ" TEXT NOT NULL,
  "nummer" TEXT,
  "ausgestelltAm" TIMESTAMP(3),
  "gultigBis" TIMESTAMP(3),
  "erinnerungTageVorher" INTEGER NOT NULL DEFAULT 60,
  "dokumentId" TEXT,
  "notiz" TEXT,
  CONSTRAINT "Qualifikation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Abwesenheit" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "typ" "AbwesenheitTyp" NOT NULL,
  "von" TIMESTAMP(3) NOT NULL,
  "bis" TIMESTAMP(3) NOT NULL,
  "tage" DOUBLE PRECISION NOT NULL,
  "notiz" TEXT,
  CONSTRAINT "Abwesenheit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bewertung" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "kundeId" TEXT,
  "einsatzId" TEXT,
  "datum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sterne" INTEGER NOT NULL,
  "kommentar" TEXT,
  "wiedereinsatzEmpfohlen" BOOLEAN NOT NULL DEFAULT true,
  "erfasstVon" TEXT,
  CONSTRAINT "Bewertung_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Einsatz" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "rolleImEinsatz" TEXT NOT NULL,
  "standardrolleReferenz" TEXT,
  "von" TIMESTAMP(3) NOT NULL,
  "bis" TIMESTAMP(3),
  "schichtmodell" "Schichtmodell" NOT NULL DEFAULT 'TAG',
  "wochenstunden" DOUBLE PRECISION NOT NULL DEFAULT 38.5,
  "auslastung" INTEGER NOT NULL DEFAULT 100,
  "stundenlohn" DOUBLE PRECISION,
  "verrechnungssatz" DOUBLE PRECISION,
  "status" "EinsatzStatus" NOT NULL DEFAULT 'GEPLANT',
  "angebotId" TEXT,
  "einsatzort" TEXT,
  "notizen" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Einsatz_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Angebot" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "nummer" TEXT NOT NULL,
  "datum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gultigBis" TIMESTAMP(3),
  "status" "AngebotStatus" NOT NULL DEFAULT 'ENTWURF',
  "betreff" TEXT NOT NULL,
  "einleitung" TEXT,
  "schlusstext" TEXT,
  "bundesland" TEXT,
  "satzSetId" TEXT,
  "versendetAm" TIMESTAMP(3),
  "versendetAn" TEXT,
  "entschiedenAm" TIMESTAMP(3),
  "pdfDokumentId" TEXT,
  "erstelltVon" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiertAm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Angebot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Angebot_nummer_key" ON "Angebot"("nummer");

CREATE TABLE "Angebotsposition" (
  "id" TEXT NOT NULL,
  "angebotId" TEXT NOT NULL,
  "reihenfolge" INTEGER NOT NULL DEFAULT 0,
  "kalkulationsart" "Kalkulationsart" NOT NULL DEFAULT 'UEBERLASSUNG',
  "rolle" TEXT NOT NULL,
  "anzahlPersonen" INTEGER NOT NULL DEFAULT 1,
  "stundenlohn" DOUBLE PRECISION,
  "bruttogehalt" DOUBLE PRECISION,
  "stundenProMonat" DOUBLE PRECISION DEFAULT 173,
  "verrechnungssatz" DOUBLE PRECISION,
  "aufschlagMonat" DOUBLE PRECISION,
  "honorar" DOUBLE PRECISION,
  "kvId" TEXT,
  "beschaeftigungsgruppe" TEXT,
  "kalkulation" JSONB,
  CONSTRAINT "Angebotsposition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vertragsvorlage" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT,
  "name" TEXT NOT NULL,
  "typ" "VertragTyp" NOT NULL,
  "inhalt" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "aktiv" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Vertragsvorlage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vertrag" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "nummer" TEXT NOT NULL,
  "typ" "VertragTyp" NOT NULL,
  "vorlageId" TEXT,
  "personId" TEXT,
  "kundeId" TEXT,
  "einsatzId" TEXT,
  "status" "VertragStatus" NOT NULL DEFAULT 'ENTWURF',
  "inhalt" TEXT NOT NULL,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "versendetAm" TIMESTAMP(3),
  "unterschriebenAm" TIMESTAMP(3),
  "signaturAnbieter" TEXT,
  "signaturExterneId" TEXT,
  "pdfEntwurfDokumentId" TEXT,
  "pdfUnterschriebenDokumentId" TEXT,
  CONSTRAINT "Vertrag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vertrag_nummer_key" ON "Vertrag"("nummer");

CREATE TABLE "Monatsabrechnung" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "einsatzId" TEXT,
  "jahr" INTEGER NOT NULL,
  "monat" INTEGER NOT NULL,
  "verrechnung" DOUBLE PRECISION,
  "bruttolohn" DOUBLE PRECISION,
  "stunden" DOUBLE PRECISION,
  "status" "AbrechnungStatus" NOT NULL DEFAULT 'OFFEN',
  "rechnungId" TEXT,
  "notiz" TEXT,
  CONSTRAINT "Monatsabrechnung_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Monatsabrechnung_personId_kundeId_jahr_monat_key" ON "Monatsabrechnung"("personId", "kundeId", "jahr", "monat");

CREATE TABLE "Rechnung" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "kundeId" TEXT NOT NULL,
  "nummer" TEXT NOT NULL,
  "rechnungsdatum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leistungJahr" INTEGER NOT NULL,
  "leistungMonat" INTEGER NOT NULL,
  "faelligAm" TIMESTAMP(3) NOT NULL,
  "status" "RechnungStatus" NOT NULL DEFAULT 'ENTWURF',
  "netto" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ustProzent" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "brutto" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bezahltBetrag" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bezahltAm" TIMESTAMP(3),
  "mahnstufe" INTEGER NOT NULL DEFAULT 0,
  "letzteErinnerungAm" TIMESTAMP(3),
  "versendetAm" TIMESTAMP(3),
  "pdfDokumentId" TEXT,
  "storniertDurchId" TEXT,
  "notiz" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Rechnung_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Rechnung_nummer_key" ON "Rechnung"("nummer");

CREATE TABLE "Rechnungsposition" (
  "id" TEXT NOT NULL,
  "rechnungId" TEXT NOT NULL,
  "personId" TEXT,
  "einsatzId" TEXT,
  "beschreibung" TEXT NOT NULL,
  "menge" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "einheit" TEXT NOT NULL DEFAULT 'Std.',
  "einzelpreis" DOUBLE PRECISION NOT NULL,
  "betrag" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "Rechnungsposition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dokument" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "dateiname" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "groesse" INTEGER NOT NULL,
  "speicherpfad" TEXT NOT NULL,
  "kategorie" TEXT NOT NULL,
  "personId" TEXT,
  "kundeId" TEXT,
  "vertragId" TEXT,
  "rechnungId" TEXT,
  "angebotId" TEXT,
  "sichtbarImPortal" BOOLEAN NOT NULL DEFAULT false,
  "hochgeladenVon" TEXT,
  "hochgeladenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Dokument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Aktivitaet" (
  "id" TEXT NOT NULL,
  "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "typ" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "nutzerName" TEXT,
  "kundeId" TEXT,
  "personId" TEXT,
  CONSTRAINT "Aktivitaet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Aufgabe" (
  "id" TEXT NOT NULL,
  "kostenstelleId" TEXT NOT NULL,
  "typ" "AufgabeTyp" NOT NULL,
  "titel" TEXT NOT NULL,
  "faelligAm" TIMESTAMP(3) NOT NULL,
  "erledigt" BOOLEAN NOT NULL DEFAULT false,
  "erledigtAm" TIMESTAMP(3),
  "personId" TEXT,
  "kundeId" TEXT,
  "referenzTyp" TEXT,
  "referenzId" TEXT,
  "nutzerId" TEXT,
  "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Aufgabe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Aufgabe_typ_referenzTyp_referenzId_key" ON "Aufgabe"("typ", "referenzTyp", "referenzId");

CREATE TABLE "MailLog" (
  "id" TEXT NOT NULL,
  "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "an" TEXT NOT NULL,
  "betreff" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "anhangName" TEXT,
  "status" TEXT NOT NULL,
  "fehler" TEXT,
  "referenzTyp" TEXT,
  "referenzId" TEXT,
  CONSTRAINT "MailLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortalToken" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "gultigBis" TIMESTAMP(3) NOT NULL,
  "verwendetAm" TIMESTAMP(3),
  CONSTRAINT "PortalToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalToken_tokenHash_key" ON "PortalToken"("tokenHash");

CREATE INDEX "AuditLog_entitaet_datensatzId_idx" ON "AuditLog"("entitaet", "datensatzId");

CREATE INDEX "AuditLog_zeitpunkt_idx" ON "AuditLog"("zeitpunkt");

CREATE INDEX "Kunde_kostenstelleId_idx" ON "Kunde"("kostenstelleId");

CREATE INDEX "Person_kostenstelleId_status_idx" ON "Person"("kostenstelleId", "status");

CREATE INDEX "Person_nachname_vorname_idx" ON "Person"("nachname", "vorname");

CREATE INDEX "Einsatz_kostenstelleId_status_idx" ON "Einsatz"("kostenstelleId", "status");

CREATE INDEX "Einsatz_personId_idx" ON "Einsatz"("personId");

CREATE INDEX "Einsatz_kundeId_idx" ON "Einsatz"("kundeId");

CREATE INDEX "Angebot_kostenstelleId_status_idx" ON "Angebot"("kostenstelleId", "status");

CREATE INDEX "Monatsabrechnung_kostenstelleId_jahr_idx" ON "Monatsabrechnung"("kostenstelleId", "jahr");

CREATE INDEX "Rechnung_kostenstelleId_status_idx" ON "Rechnung"("kostenstelleId", "status");

ALTER TABLE "Nutzer" ADD CONSTRAINT "Nutzer_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KvLohnstufe" ADD CONSTRAINT "KvLohnstufe_kvId_fkey" FOREIGN KEY ("kvId") REFERENCES "Kollektivvertrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Nummernkreis" ADD CONSTRAINT "Nummernkreis_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Kunde" ADD CONSTRAINT "Kunde_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ansprechpartner" ADD CONSTRAINT "Ansprechpartner_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Kondition" ADD CONSTRAINT "Kondition_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Person" ADD CONSTRAINT "Person_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Person" ADD CONSTRAINT "Person_hinterlegterKundeId_fkey" FOREIGN KEY ("hinterlegterKundeId") REFERENCES "Kunde"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Person" ADD CONSTRAINT "Person_kvId_fkey" FOREIGN KEY ("kvId") REFERENCES "Kollektivvertrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Qualifikation" ADD CONSTRAINT "Qualifikation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Abwesenheit" ADD CONSTRAINT "Abwesenheit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bewertung" ADD CONSTRAINT "Bewertung_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bewertung" ADD CONSTRAINT "Bewertung_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Einsatz" ADD CONSTRAINT "Einsatz_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Einsatz" ADD CONSTRAINT "Einsatz_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Einsatz" ADD CONSTRAINT "Einsatz_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Einsatz" ADD CONSTRAINT "Einsatz_angebotId_fkey" FOREIGN KEY ("angebotId") REFERENCES "Angebot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Angebot" ADD CONSTRAINT "Angebot_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Angebot" ADD CONSTRAINT "Angebot_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Angebotsposition" ADD CONSTRAINT "Angebotsposition_angebotId_fkey" FOREIGN KEY ("angebotId") REFERENCES "Angebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vertragsvorlage" ADD CONSTRAINT "Vertragsvorlage_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vertrag" ADD CONSTRAINT "Vertrag_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vertrag" ADD CONSTRAINT "Vertrag_vorlageId_fkey" FOREIGN KEY ("vorlageId") REFERENCES "Vertragsvorlage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vertrag" ADD CONSTRAINT "Vertrag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vertrag" ADD CONSTRAINT "Vertrag_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vertrag" ADD CONSTRAINT "Vertrag_einsatzId_fkey" FOREIGN KEY ("einsatzId") REFERENCES "Einsatz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Monatsabrechnung" ADD CONSTRAINT "Monatsabrechnung_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Monatsabrechnung" ADD CONSTRAINT "Monatsabrechnung_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Monatsabrechnung" ADD CONSTRAINT "Monatsabrechnung_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Monatsabrechnung" ADD CONSTRAINT "Monatsabrechnung_einsatzId_fkey" FOREIGN KEY ("einsatzId") REFERENCES "Einsatz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Monatsabrechnung" ADD CONSTRAINT "Monatsabrechnung_rechnungId_fkey" FOREIGN KEY ("rechnungId") REFERENCES "Rechnung"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Rechnung" ADD CONSTRAINT "Rechnung_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Rechnung" ADD CONSTRAINT "Rechnung_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Rechnungsposition" ADD CONSTRAINT "Rechnungsposition_rechnungId_fkey" FOREIGN KEY ("rechnungId") REFERENCES "Rechnung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Rechnungsposition" ADD CONSTRAINT "Rechnungsposition_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Rechnungsposition" ADD CONSTRAINT "Rechnungsposition_einsatzId_fkey" FOREIGN KEY ("einsatzId") REFERENCES "Einsatz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_vertragId_fkey" FOREIGN KEY ("vertragId") REFERENCES "Vertrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_rechnungId_fkey" FOREIGN KEY ("rechnungId") REFERENCES "Rechnung"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_angebotId_fkey" FOREIGN KEY ("angebotId") REFERENCES "Angebot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Aktivitaet" ADD CONSTRAINT "Aktivitaet_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Aktivitaet" ADD CONSTRAINT "Aktivitaet_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Aufgabe" ADD CONSTRAINT "Aufgabe_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "Kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Aufgabe" ADD CONSTRAINT "Aufgabe_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Aufgabe" ADD CONSTRAINT "Aufgabe_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Aufgabe" ADD CONSTRAINT "Aufgabe_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PortalToken" ADD CONSTRAINT "PortalToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
