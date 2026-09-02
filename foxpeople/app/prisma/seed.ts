/**
 * Seed: Kostenstellen, Nutzer, Sätze, KV-Tabellen, Vertragsvorlagen.
 * Optional: EXCEL_IMPORT_PATH=<xlsx> importiert das bestehende Verrechnungstool in die Zentrale.
 * Optional: DEMO=1 legt zusätzlich Musterdaten (Kunden, Personen, Einsätze, Angebote, Rechnungen) an.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { encryptField } from "../src/lib/crypto";
import { SAETZE_2023, DZ_BUNDESLAND } from "../src/engine/kalkulation";
import { importiereExcel } from "../src/lib/import-excel";
import { naechsteNummer } from "../src/lib/nummern";
import { berechneAngebotsposition } from "../src/lib/angebot-kalkulation";
import { erzeugeAufgaben } from "../src/lib/aufgaben";
import { ZULAGEN_DEFAULT } from "../src/lib/zulagen";
import { referenzKvSynchronisieren } from "../src/lib/referenzlohn";

const RAHMENVERTRAG = `# Rahmenvertrag Arbeitskräfteüberlassung

zwischen **{{firma.rechtstraeger}}** (handelnd unter der Marke „{{firma.name}}“), {{firma.strasse}}, {{firma.plz}} {{firma.ort}} – „Überlasser“ – und **{{kunde.firmenname}}**, {{kunde.strasse}}, {{kunde.plz}} {{kunde.ort}} – „Beschäftiger“ –

## 1. Geltungsbereich
Dieser Rahmenvertrag regelt alle Überlassungen von Arbeitskräften des Überlassers an den Beschäftiger ab {{datum}}. Die konkreten Einsätze werden jeweils in einer Überlassungsmitteilung bzw. Einsatzbestätigung festgehalten.

## 2. Konditionen
{{kunde.konditionenTabelle}}

Auftretende 50%ige Überstunden werden mit einem Zuschlag von {{kunde.ueberstundenZuschlag}} und 100%ige Überstunden mit einem Zuschlag von {{kunde.wochenendZuschlag}} auf den Verrechnungssatz in Rechnung gestellt. Zahlungsziel: {{kunde.zahlungszielTage}}. Alle Beträge verstehen sich zuzüglich 20 % Umsatzsteuer.

## 3. Entlohnung der Mitarbeiter
Die Mitarbeiter der {{firma.rechtstraeger}} werden nach den gesetzlichen Bestimmungen des Arbeitskräfteüberlassungsgesetzes (AÜG) bzw. auf Basis des Kollektivvertrages für das Gewerbe Arbeitskräfteüberlassung entlohnt.

## 4. Übernahme ins Stammpersonal
Die Übernahme der überlassenen Mitarbeiter ist nach einer 12-monatigen, durchgehenden Beschäftigung zum nächsten Monatsersten kostenlos möglich. Erfolgt die Übernahme früher, gebührt dem Überlasser der Aufwandsersatz nach Punkt 6 der AGB Arbeitskräfteüberlassung: 30 % des Bruttojahresentgeltes auf Vollzeitbasis, je vollem Überlassungsmonat um 1/12 reduziert, mindestens EUR 2.500,–. Der Beschäftiger zeigt jede Übernahme binnen zwei Wochen schriftlich an.

## 5. Pflichten des Beschäftigers
Der Beschäftiger übernimmt die Fürsorgepflicht und die Einhaltung der Arbeitnehmerschutzvorschriften am Einsatzort (§ 6 AÜG), stellt erforderliche Schutzausrüstung bei und bestätigt die Stundennachweise wöchentlich.

## 6. Laufzeit
Der Vertrag läuft bis {{kunde.rahmenvertragEnde}} und verlängert sich jeweils um ein Jahr, sofern er nicht mit einer Frist von {{kunde.kuendigungsfrist}} gekündigt wird.

## 7. Allgemeine Geschäftsbedingungen
Es gelten die Allgemeinen Geschäftsbedingungen des Überlassers für die Arbeitskräfteüberlassung in der jeweils gültigen Fassung; sie sind diesem Rahmenvertrag angeschlossen und bilden einen integrierenden Bestandteil. Mit der Unterfertigung bestätigt der Beschäftiger, die AGB erhalten und zur Kenntnis genommen zu haben.

{{firma.ort}}, am {{datum}}

______________________________            ______________________________
{{firma.rechtstraeger}}                                {{kunde.firmenname}}`;

const UEBERLASSUNGSVERTRAG = `# Überlassungsvertrag / Einsatzbestätigung

zwischen **{{firma.rechtstraeger}}** ({{firma.name}}), {{firma.strasse}}, {{firma.plz}} {{firma.ort}} – „Überlasser“ – und **{{kunde.firmenname}}**, {{kunde.strasse}}, {{kunde.plz}} {{kunde.ort}} – „Beschäftiger“ –

## 1. Gegenstand
Der Überlasser überlässt dem Beschäftiger ab {{einsatz.von}}{{einsatz.bisText}} die Arbeitskraft **{{person.vorname}} {{person.nachname}}** für die Tätigkeit **{{einsatz.rolle}}** am Einsatzort {{einsatz.ort}}.

## 2. Arbeitszeit
Die Normalarbeitszeit beträgt {{einsatz.wochenstunden}} Wochenstunden ({{einsatz.schicht}}). Mehr- und Überstunden werden nur über Anordnung des Beschäftigers geleistet.

## 3. Verrechnung
Verrechnungssatz **EUR {{einsatz.verrechnungssatz}} je geleisteter Normalstunde** zuzüglich USt. 50%ige Überstunden +{{kunde.ueberstundenZuschlag}}, 100%ige Überstunden +{{kunde.wochenendZuschlag}} auf den Verrechnungssatz. Abrechnung monatlich auf Basis der vom Beschäftiger bestätigten Stundennachweise, Zahlungsziel {{kunde.zahlungszielTage}}.

## 4. Pflichten des Beschäftigers (§ 6 AÜG)
Der Beschäftiger übernimmt die Fürsorgepflicht und die Einhaltung der Arbeitnehmerschutzvorschriften am Einsatzort und meldet Arbeitsunfälle unverzüglich.

## 5. Übernahme
Die Übernahme ins Stammpersonal ist frühestens nach 12-monatiger durchgehender Beschäftigung zum nächsten Monatsersten kostenlos möglich.

{{firma.ort}}, am {{datum}}

______________________________            ______________________________
{{firma.rechtstraeger}}                                {{kunde.firmenname}}`;

const lese = (n: string) => readFileSync(new URL(`./vorlagen/${n}`, import.meta.url), "utf8");

async function main() {
  // ---- Kostenstellen
  const hq = await db.kostenstelle.upsert({
    where: { kuerzel: "HQ" },
    update: {},
    create: { name: "Headquarter Fox & People", kuerzel: "HQ", isZentrale: true, strasse: "Kettenreith 52", plz: "3233", ort: "Kilb", bundesland: "Niederösterreich", email: "office@foxandpeople.at", telefon: "+43 676 4574096" },
  });
  const heindl = await db.kostenstelle.upsert({
    where: { kuerzel: "HEI" },
    update: {},
    create: { name: "Kostenstelle Heindl", kuerzel: "HEI", bundesland: "Niederösterreich" },
  });

  // ---- Nutzer
  const pw = await hashPassword(process.env.SEED_PASSWORD ?? "FoxPeople2026!");
  const nutzer = [
    { email: "admin@foxandpeople.at", name: "Systemadmin", rolle: "SYSTEMADMIN" as const, kostenstelleId: null },
    { email: "zentrale@foxandpeople.at", name: "Matthias Fuchs", rolle: "ZENTRALE" as const, kostenstelleId: null },
    { email: "heindl@foxandpeople.at", name: "Leitung Heindl", rolle: "KOSTENSTELLEN_LEITUNG" as const, kostenstelleId: heindl.id },
  ];
  for (const n of nutzer) await db.nutzer.upsert({ where: { email: n.email }, update: {}, create: { ...n, passwortHash: pw } });

  // ---- Sätze
  if ((await db.abgabenSatzSet.count()) === 0) {
    await db.abgabenSatzSet.create({ data: { name: "WIFI NÖ 2023", gultigAb: new Date(Date.UTC(2023, 0, 1)), saetze: { ...SAETZE_2023 } } });
  }
  for (const [bl, satz] of Object.entries(DZ_BUNDESLAND)) {
    await db.dzSatz.upsert({ where: { bundesland_gultigAb: { bundesland: bl, gultigAb: new Date(Date.UTC(2023, 0, 1)) } }, update: {}, create: { bundesland: bl, satz, gultigAb: new Date(Date.UTC(2023, 0, 1)) } });
  }

  // ---- Kollektivverträge (Referenzwerte – bitte in den Einstellungen mit den aktuellen KV-Tabellen abgleichen)
  // Referenzlöhne der Beschäftiger-KV (metalltechnische Industrie exakt, übrige mit Prüfhinweis)
  await referenzKvSynchronisieren();
  if ((await db.kollektivvertrag.count({ where: { istReferenz: false } })) === 0) {
    await db.kollektivvertrag.create({
      data: {
        name: "KV Arbeitskräfteüberlassung (Arbeiter/innen) 2026", kuerzel: "AKÜ", gultigAb: new Date(Date.UTC(2026, 0, 1)),
        // WKO: KV-Abschluss Arbeitskräfteüberlassung 2026 (+2,30 %, gültig ab 1.1.2026)
        lohntabelle: { create: [
          { beschaeftigungsgruppe: "A", bezeichnung: "Ungelernte Arbeitnehmer/innen (1. Jahr Betriebszugehörigkeit)", mindestStundenlohn: 13.9 },
          { beschaeftigungsgruppe: "B", bezeichnung: "Angelernte Arbeitnehmer/innen", mindestStundenlohn: 13.9 },
          { beschaeftigungsgruppe: "C", bezeichnung: "Qualifizierte Arbeitnehmer/innen", mindestStundenlohn: 15.62 },
          { beschaeftigungsgruppe: "D", bezeichnung: "Facharbeiter/innen", mindestStundenlohn: 17.5 },
          { beschaeftigungsgruppe: "E", bezeichnung: "Qualifizierte Facharbeiter/innen", mindestStundenlohn: 20.14 },
          { beschaeftigungsgruppe: "F", bezeichnung: "Techniker/innen", mindestStundenlohn: 24.82 },
        ] },
      },
    });
    await db.kollektivvertrag.create({
      data: {
        name: "KV Arbeitskräfteüberlassung (Angestellte)", kuerzel: "AKÜ-Ang", gultigAb: new Date(Date.UTC(2026, 0, 1)),
        lohntabelle: { create: [
          { beschaeftigungsgruppe: "I", bezeichnung: "Einfache Tätigkeiten", mindestMonatsbrutto: 2170 },
          { beschaeftigungsgruppe: "II", bezeichnung: "Kaufmännisch/Office", mindestMonatsbrutto: 2380 },
          { beschaeftigungsgruppe: "III", bezeichnung: "Qualifizierte Sachbearbeitung", mindestMonatsbrutto: 2740 },
          { beschaeftigungsgruppe: "IV", bezeichnung: "Fach- & Führungskräfte", mindestMonatsbrutto: 3290 },
        ] },
      },
    });
  }

  // ---- Zulagen (Referenzwerte)
  for (const [i, z] of ZULAGEN_DEFAULT.entries()) await db.zulage.upsert({ where: { kuerzel: z.kuerzel }, update: {}, create: { ...z, reihenfolge: i, beschreibung: "Referenzwert – bitte mit KV/Lohnverrechnung abgleichen" } });

  // ---- Vertragsvorlagen
  if ((await db.vertragsvorlage.count()) === 0) {
    await db.vertragsvorlage.createMany({ data: [
      { name: "Arbeitsvertrag (KV Arbeitskräfteüberlassung)", typ: "DIENSTVERTRAG", inhalt: lese("dienstvertrag.md") },
      { name: "Überlassungsmitteilung § 12 AÜG", typ: "UEBERLASSUNGSMITTEILUNG", inhalt: lese("ueberlassungsmitteilung.md") },
      { name: "Zusatzvereinbarung Urlaub / Krankenstand", typ: "ZUSATZVEREINBARUNG", inhalt: lese("zusatzvereinbarung.md") },
      { name: "Überlassungsvertrag (Einsatz)", typ: "UEBERLASSUNGSVERTRAG", inhalt: UEBERLASSUNGSVERTRAG },
      { name: "Rahmenvertrag Kunde", typ: "RAHMENVERTRAG", inhalt: RAHMENVERTRAG },
    ] });
  }

  // ---- Firmendaten (Blackburn Beteiligungs GmbH · Marke Fox & People) & Nummernkreise
  if (!(await db.einstellung.findUnique({ where: { key: "firma" } }))) {
    await db.einstellung.create({ data: { key: "firma", value: { name: "Fox & People", rechtstraeger: "Blackburn Beteiligungs GmbH", strasse: "Kettenreith 52", plz: "3233", ort: "Kilb", uid: "ATU 81895246", firmenbuch: "FN 647703 f, LG St. Pölten", telefon: "+43 676 4574096", email: "office@foxandpeople.at", iban: "AT__ ____ ____ ____ ____", bic: "", bank: "", ustProzent: 20, zahlungszielTage: 0, mahnstufenTage: [4, 12, 19], angebotGueltigTage: 30 } } });
  }
  const jahr0 = new Date().getFullYear();
  // Rechnungsnummern der Zentrale: Format JJJJNNN, 2026001–2026007 bereits vergeben → nächste 2026008
  await db.nummernkreis.upsert({ where: { kostenstelleId_typ_jahr: { kostenstelleId: hq.id, typ: "RE", jahr: 2026 } }, update: {}, create: { kostenstelleId: hq.id, typ: "RE", jahr: 2026, letzteNummer: 7, format: "{jahr}{nnn}" } });
  await db.nummernkreis.upsert({ where: { kostenstelleId_typ_jahr: { kostenstelleId: hq.id, typ: "AN", jahr: jahr0 } }, update: {}, create: { kostenstelleId: hq.id, typ: "AN", jahr: jahr0, format: "AN-{jahr}-{nnn}" } });
  await db.nummernkreis.upsert({ where: { kostenstelleId_typ_jahr: { kostenstelleId: heindl.id, typ: "RE", jahr: jahr0 } }, update: {}, create: { kostenstelleId: heindl.id, typ: "RE", jahr: jahr0, format: "{jahr}{kuerzel}{nnn}" } });

  // ---- Excel-Import
  const xl = process.env.EXCEL_IMPORT_PATH;
  if (xl && existsSync(xl)) {
    const erg = await importiereExcel(readFileSync(xl), hq.id, "Excel-Import (Seed)");
    console.log("Excel-Import:", JSON.stringify(erg, null, 1));
  }

  // ---- Demo-Daten
  if (process.env.DEMO === "1") await demo(hq.id);

  await erzeugeAufgaben();
  console.log("Seed fertig.");
}

async function demo(kostenstelleId: string) {
  if (await db.kunde.findFirst({ where: { firmenname: "Muster Logistik GmbH" } })) return;
  const jahr = new Date().getFullYear();
  const monat = new Date().getMonth(); // 0-basiert = aktueller Monat
  const d = (y: number, m: number, day = 1) => new Date(Date.UTC(y, m, day));

  const kunden = await Promise.all([
    db.kunde.create({ data: { kostenstelleId, firmenname: "Muster Logistik GmbH", kurzname: "Muster Logistik", strasse: "Industriestraße 12", plz: "3100", ort: "St. Pölten", uid: "ATU12345678", email: "einkauf@muster-logistik.example", rechnungsemail: "buchhaltung@muster-logistik.example", telefon: "02742 12345", rahmenvertragBeginn: d(jahr, 0), rahmenvertragEnde: d(jahr, 11, 31), kuendigungsfrist: "4 Wochen", zahlungszielTage: 10, arbeitszeitmodell: "38,5 h Mo–Fr Tagschicht", kollektivvertrag: "KV Güterbeförderung / Transport", kvGueltigBis: d(jahr, monat + 1, 30), erforderlicheQualifikationen: ["Staplerschein"], anforderungen: "Lager & Kommissionierung, Schichtbereitschaft Früh/Spät, Deutsch B1", notizen: "Demo-Datensatz", ansprechpartner: { create: [{ name: "Ing. Petra Hollaus", funktion: "Leitung Logistik", telefon: "0664 1111111", email: "p.hollaus@muster-logistik.example", istHaupt: true }] }, konditionen: { create: [{ rolle: "Lagerlogistik", stundensatz: 29.5 }, { rolle: "Staplerfahrer", stundensatz: 31.9 }] } } }),
    db.kunde.create({ data: { kostenstelleId, firmenname: "Alpen Metallbau AG", kurzname: "Alpen Metallbau", strasse: "Werkstraße 4", plz: "3300", ort: "Amstetten", uid: "ATU23456789", email: "office@alpen-metallbau.example", rahmenvertragBeginn: d(jahr - 1, 5), rahmenvertragEnde: d(jahr, monat + 1, 15), kuendigungsfrist: "3 Monate", arbeitszeitmodell: "38,5 h 2-Schicht (Früh/Spät)", kollektivvertrag: "KV Metallgewerbe", kvGueltigBis: d(jahr + 1, 0, 31), erforderlicheQualifikationen: ["Schweißprüfung EN ISO 9606", "Sicherheitsunterweisung"], notizen: "Demo-Datensatz", ansprechpartner: { create: [{ name: "DI Markus Leitner", funktion: "Produktionsleitung", email: "m.leitner@alpen-metallbau.example", istHaupt: true }] }, konditionen: { create: [{ rolle: "Schweißer", stundensatz: 38 }, { rolle: "Produktionshelfer", stundensatz: 27.8 }] } } }),
    db.kunde.create({ data: { kostenstelleId, firmenname: "Donau Office Services e.U.", kurzname: "Donau Office", strasse: "Rathausplatz 2", plz: "3500", ort: "Krems", email: "hr@donau-office.example", arbeitszeitmodell: "Gleitzeit 38,5 h", kollektivvertrag: "KV Angestellte Gewerbe & Handwerk", kvGueltigBis: d(jahr + 1, 2, 31), notizen: "Demo-Datensatz", ansprechpartner: { create: [{ name: "Mag. Sabine Wurm", funktion: "HR", istHaupt: true }] }, konditionen: { create: [{ rolle: "Bürokraft", stundensatz: 26.5 }] } } }),
  ]);

  const personen = [
    { nachname: "Gruber", vorname: "Anna", status: "VERMITTELT", rolle: "Lagerlogistik", lohn: 14.2, kunde: 0, geb: d(1994, 2, 12), ort: "St. Pölten", plz: "3100", quals: [["Führerschein B", null], ["Staplerschein", d(jahr, monat + 1, 20)]] },
    { nachname: "Berger", vorname: "Thomas", status: "VERMITTELT", rolle: "Staplerfahrer", lohn: 15.1, kunde: 0, geb: d(1998, 6, 22), ort: "Ober-Grafendorf", plz: "3200", quals: [["Führerschein B", null], ["Staplerschein", d(jahr + 2, 3, 1)]] },
    { nachname: "Kovač", vorname: "Marko", status: "VERMITTELT", rolle: "Schweißer", lohn: 19.8, kunde: 1, geb: d(1989, 10, 5), ort: "Amstetten", plz: "3300", quals: [["Schweißprüfung EN ISO 9606", d(jahr, monat, 10)]] },
    { nachname: "Hofer", vorname: "Lukas", status: "VERMITTELT", rolle: "Produktionshelfer", lohn: 12.6, kunde: 1, geb: d(2001, 1, 14), ort: "Ybbs", plz: "3370", quals: [] },
    { nachname: "Novak", vorname: "Julia", status: "VERMITTELT", rolle: "Bürokraft", lohn: 14.9, kunde: 2, geb: d(2000, 10, 3), ort: "Krems", plz: "3500", quals: [["Führerschein B", null]] },
    { nachname: "Aigner", vorname: "Stefan", status: "SUCHT", rolle: "Elektriker", lohn: null, kunde: null, geb: d(1992, 4, 30), ort: "Melk", plz: "3390", quals: [["Führerschein B", null]] },
    { nachname: "Yilmaz", vorname: "Derya", status: "SUCHT", rolle: "Lagerlogistik", lohn: null, kunde: null, geb: d(1997, 8, 9), ort: "St. Pölten", plz: "3100", quals: [["Staplerschein", d(jahr + 1, 0, 1)], ["Arbeitserlaubnis (RWR-Karte)", d(jahr, monat + 2, 1)]] },
    { nachname: "Pichler", vorname: "Georg", status: "SUCHT", rolle: "Kaufmännischer Angestellter", lohn: null, kunde: null, geb: d(1985, 0, 20), ort: "Tulln", plz: "3430", quals: [] },
    { nachname: "Maier", vorname: "Rene", status: "GESPERRT", rolle: "Produktionshelfer", lohn: null, kunde: null, geb: d(1995, 11, 1), ort: "Herzogenburg", plz: "3130", quals: [], sperre: "Wiederholt unentschuldigt nicht zum Einsatz erschienen" },
  ] as const;

  const pIds: string[] = [];
  for (const p of personen) {
    const person = await db.person.create({
      data: {
        kostenstelleId, status: p.status, nachname: p.nachname, vorname: p.vorname, geburtsdatum: p.geb, telefon: "0664 " + String(Math.floor(1000000 + Math.random() * 8999999)),
        email: `${p.vorname}.${p.nachname}@example.at`.toLowerCase().replace("č", "c"), strasse: "Hauptstraße " + (pIds.length + 3), plz: p.plz, ort: p.ort,
        svnrEnc: encryptField(`${1000 + pIds.length * 37}${String(p.geb.getUTCDate()).padStart(2, "0")}${String(p.geb.getUTCMonth() + 1).padStart(2, "0")}${String(p.geb.getUTCFullYear()).slice(2)}`), svnrLast4: String(p.geb.getUTCFullYear()).slice(2) + "01",
        standardrolle: p.rolle, stundenlohn: p.lohn, hinterlegterKundeId: p.kunde == null ? null : kunden[p.kunde].id, verfuegbarSofort: p.status === "SUCHT",
        gesperrtSeit: "sperre" in p ? d(jahr, monat - 2, 5) : null, gesperrtGrund: "sperre" in p ? p.sperre : null, notizen: "Demo-Datensatz",
        aufnahmedatum: d(jahr - 1, 8, 1 + pIds.length), eintrittsdatum: p.status === "VERMITTELT" ? d(jahr, 0, 7) : null, wochenstunden: 38.5,
        qualifikationen: { create: p.quals.map(([typ, bis]) => ({ typ, gultigBis: bis })) },
      },
    });
    pIds.push(person.id);
    if (p.status === "VERMITTELT" && p.kunde != null) {
      const kond = await db.kondition.findFirst({ where: { kundeId: kunden[p.kunde].id, rolle: p.rolle } });
      const einsatz = await db.einsatz.create({ data: { kostenstelleId, personId: person.id, kundeId: kunden[p.kunde].id, rolleImEinsatz: p.rolle, standardrolleReferenz: p.rolle, von: d(jahr, 0, 7), status: "AKTIV", stundenlohn: p.lohn, verrechnungssatz: kond?.stundensatz ?? 30, wochenstunden: 38.5, einsatzort: kunden[p.kunde].ort ?? undefined } });
      // Monatsabrechnungen Jan..aktueller Monat
      for (let m = 0; m < monat; m++) {
        const std = 150 + Math.round(Math.random() * 30);
        await db.monatsabrechnung.create({ data: { kostenstelleId, personId: person.id, kundeId: kunden[p.kunde].id, einsatzId: einsatz.id, jahr, monat: m + 1, stunden: std, verrechnung: Math.round(std * (kond?.stundensatz ?? 30) * 100) / 100, bruttolohn: Math.round(std * (p.lohn ?? 13) * 100) / 100, status: m < monat - 1 ? "ABGERECHNET" : "OFFEN" } });
      }
      await db.abwesenheit.create({ data: { personId: person.id, typ: "URLAUB", von: d(jahr, 6, 14), bis: d(jahr, 6, 18), tage: 5 } });
      await db.bewertung.create({ data: { personId: person.id, kundeId: kunden[p.kunde].id, einsatzId: einsatz.id, sterne: 4 + Math.round(Math.random()), kommentar: "Zuverlässig, pünktlich, gerne wieder.", wiedereinsatzEmpfohlen: true, erfasstVon: "Matthias Fuchs" } });
    }
  }
  await db.abwesenheit.create({ data: { personId: pIds[3], typ: "KRANKENSTAND", von: d(jahr, monat, 2), bis: d(jahr, monat, 4), tage: 3 } });

  // Angebote
  const { aktuelleSaetze } = await import("../src/lib/einstellungen");
  const { saetze } = await aktuelleSaetze("Niederösterreich");
  const angebote = [
    { kunde: 0, status: "ANGENOMMEN", pos: [{ rolle: "Lagerlogistik", stundenlohn: 14.2, verrechnungssatz: 29.5, anzahl: 2 }] },
    { kunde: 1, status: "VERSENDET", pos: [{ rolle: "Schweißer", stundenlohn: 19.8, verrechnungssatz: 38 }, { rolle: "Produktionshelfer", stundenlohn: 12.6, verrechnungssatz: 27.8, anzahl: 3 }] },
    { kunde: 2, status: "ENTWURF", pos: [{ rolle: "Bürokraft", stundenlohn: 14.9, verrechnungssatz: 26.5 }] },
  ] as const;
  for (const a of angebote) {
    const nummer = await naechsteNummer(kostenstelleId, "AN");
    await db.angebot.create({
      data: {
        kostenstelleId, kundeId: kunden[a.kunde].id, nummer, status: a.status, betreff: "Angebot Arbeitskräfteüberlassung", bundesland: "Niederösterreich", gultigBis: d(jahr, monat + 1, 15), versendetAm: a.status === "ENTWURF" ? null : d(jahr, monat, 3), entschiedenAm: a.status === "ANGENOMMEN" ? d(jahr, monat, 10) : null, erstelltVon: "Matthias Fuchs",
        positionen: { create: a.pos.map((p, i) => ({ reihenfolge: i, kalkulationsart: "UEBERLASSUNG", rolle: p.rolle, stundenlohn: p.stundenlohn, verrechnungssatz: p.verrechnungssatz, stundenProMonat: 173, anzahlPersonen: "anzahl" in p ? p.anzahl : 1, kalkulation: berechneAngebotsposition({ kalkulationsart: "UEBERLASSUNG", stundenlohn: p.stundenlohn, verrechnungssatz: p.verrechnungssatz, stundenProMonat: 173, anzahlPersonen: "anzahl" in p ? p.anzahl : 1 }, saetze) as object })) },
      },
    });
  }

  // Rechnungen für abgeschlossene Monate
  for (let m = 0; m < monat - 1; m++) {
    for (const k of kunden) {
      const mas = await db.monatsabrechnung.findMany({ where: { kundeId: k.id, jahr, monat: m + 1 }, include: { person: true } });
      if (!mas.length) continue;
      const netto = mas.reduce((s, x) => s + (x.verrechnung ?? 0), 0);
      const nummer = await naechsteNummer(kostenstelleId, "RE", jahr);
      const rd = d(jahr, m + 1, 3);
      const faellig = new Date(rd.getTime() + (k.zahlungszielTage || 0) * 86400000);
      const alt = m < monat - 2;
      const r = await db.rechnung.create({
        data: {
          kostenstelleId, kundeId: k.id, nummer, rechnungsdatum: rd, leistungJahr: jahr, leistungMonat: m + 1, faelligAm: faellig, status: alt ? "BEZAHLT" : k.firmenname.startsWith("Alpen") ? "UEBERFAELLIG" : "VERSENDET", netto, ustProzent: 20, brutto: netto * 1.2, bezahltBetrag: alt ? netto * 1.2 : 0, bezahltAm: alt ? new Date(faellig.getTime() - 2 * 86400000) : null, versendetAm: rd, mahnstufe: !alt && k.firmenname.startsWith("Alpen") ? 1 : 0,
          positionen: { create: mas.map((x) => ({ personId: x.personId, einsatzId: x.einsatzId, beschreibung: `${x.person.vorname} ${x.person.nachname} – Überlassung ${String(m + 1).padStart(2, "0")}/${jahr}`, menge: x.stunden ?? 0, einheit: "Std.", einzelpreis: x.stunden ? (x.verrechnung ?? 0) / x.stunden : 0, betrag: x.verrechnung ?? 0 })) },
        },
      });
      await db.monatsabrechnung.updateMany({ where: { id: { in: mas.map((x) => x.id) } }, data: { rechnungId: r.id, status: "ABGERECHNET" } });
    }
  }
  // gegenseitige Bewertungen (Mitarbeiter → Kunde)
  await db.kundenBewertung.createMany({ data: [
    { kundeId: kunden[0].id, personId: pIds[0], sterne: 5, kommentar: "Gute Einschulung, nettes Team, Stundenzettel immer pünktlich bestätigt.", wiederArbeiten: true, quelle: "PORTAL" },
    { kundeId: kunden[1].id, personId: pIds[2], sterne: 3, kommentar: "Viel Lärm, Schutzausrüstung musste nachgefordert werden.", wiederArbeiten: true, quelle: "INTERN" },
  ] });
  // Wochenraster für den laufenden Monat
  const { wochenImMonat } = await import("../src/lib/wochen");
  for (const w of wochenImMonat(jahr, monat + 1)) for (const [i, pid] of pIds.slice(0, 5).entries()) {
    await db.wochenstatus.upsert({ where: { personId_jahr_kw: { personId: pid, jahr: w.jahr, kw: w.kw } }, update: {}, create: { personId: pid, jahr: w.jahr, kw: w.kw, status: i === 3 && w === wochenImMonat(jahr, monat + 1)[0] ? "K" : "X" } });
  }
  await db.aktivitaet.createMany({ data: [
    { typ: "ANRUF", text: "Telefonat mit Fr. Hollaus: Bedarf für 2 weitere Lagerkräfte ab nächstem Monat.", nutzerName: "Matthias Fuchs", kundeId: kunden[0].id },
    { typ: "NOTIZ", text: "Rahmenvertrag läuft bald aus – Verlängerung mit DI Leitner besprechen.", nutzerName: "Matthias Fuchs", kundeId: kunden[1].id },
  ] });
  console.log("Demo-Daten angelegt.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
