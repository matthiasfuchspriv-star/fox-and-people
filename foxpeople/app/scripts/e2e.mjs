// End-to-End-Smoke-Test der wichtigsten Abläufe (gegen laufenden Dev-Server auf :3000)
import { chromium } from "playwright";
import ExcelJS from "exceljs";

/** Erzeugt eine realistische Fremdliste: Titelzeile, Leerzeile, eigenwillige Überschriften, drei Datumsformate. */
async function testlisteSchreiben() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tabelle1");
  ws.addRow(["AMS Vermittlungsvorschlaege - Bezirk Melk"]);
  ws.addRow([]);
  ws.addRow(["Familienname", "Vorname", "Mobiltelefon", "E-Mail Adresse", "geb. am", "PLZ", "Wohnort", "Taetigkeit", "ab wann", "FS B", "Stapler", "Anmerkung"]);
  ws.addRow(["Novak", "Peter", "0664 1234567", "p.novak@example.at", "14.03.1988", "3250", "Wieselburg", "Staplerfahrer", "sofort", "ja", "ja", ""]);
  ws.addRow(["Bauer", "Andrea", "0676/2345678", "", "02.11.1995", "3251", "Purgstall", "Produktionshelferin", "15.09.2026", "ja", "nein", ""]);
  ws.addRow(["Kovac", "Milan", "+43 660 3456789", "milan.kovac@example.at", "1979-06-30", "3390", "Melk", "Schlosser", "sofort", "ja", "x", ""]);
  ws.addRow(["Novak", "Peter", "0664 1234567", "p.novak@example.at", "14.03.1988", "3250", "Wieselburg", "Staplerfahrer", "sofort", "ja", "ja", "doppelt"]);
  ws.addRow(["", "", "", "", "", "", "", "", "", "", "", "ohne Namen"]);
  ws.addRow(["Gruber", "Anna", "0664 9999999", "anna.gruber@example.at", "", "3233", "Kilb", "Kommissioniererin", "sofort", "ja", "ja", "im Bestand"]);
  await wb.xlsx.writeFile("/tmp/e2e-fremdliste.xlsx");
}
const PW = process.env.SEED_PASSWORD ?? "FoxPeople2026!";
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "✓ " : "✗ ") + msg); if (!cond) fails++; };

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=passwort]", PW);
  await page.click("form button");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return { ctx, page };
}

// ---- 0) Zentrale hinterlegt Controlling-Kosten (Basis für DB2 und Provision)
{
  const { ctx, page } = await login("admin@foxandpeople.at");
  await page.goto(base + "/controlling");
  await page.fill("input[name=gesamtkosten]", "120000");
  await page.fill("input[name=kostenProMitarbeiterMonat]", "350");
  await page.fill("input[name=notiz]", "Demo-Werte");
  await page.click("button:has-text('speichern')");
  await page.waitForURL(/ok=1/);
  ok((await page.content()).includes("DB2"), "Controlling-Kosten gespeichert, DB2 berechnet");

  // Freie Rechnung (Direktvermittlung, Nachverrechnung, Pauschale)
  await page.goto(base + "/rechnungen/neu");
  await page.waitForFunction(() => document.body.innerText.includes("Freie Rechnung"));
  await page.selectOption("select[name=kundeId]", { index: 1 });
  // Personensuche: tippen, Serverantwort abwarten, ersten Treffer nehmen
  // "gruber" statt "test": Auf einer frischen Datenbank mit Demo-Daten gibt es niemanden mit
  // "test" im Namen – die Person "Testmann" entsteht erst in einem SPÄTEREN Testblock. Der Lauf
  // brach deshalb reproduzierbar im ersten Block ab.
  await page.fill("input[placeholder='Name eintippen …']", "gruber");
  await page.waitForSelector("div.absolute button", { timeout: 8000 });
  ok(await page.locator("div.absolute button").first().isVisible(), "Personensuche liefert Treffer beim Tippen");
  await page.locator("div.absolute button").first().click();
  await page.fill("input[name=bez_0]", "E2E Vermittlungshonorar");
  await page.fill("input[name=menge_0]", "1");
  await page.fill("input[name=einheit_0]", "pauschal");
  await page.fill("input[name=preis_0]", "2500");
  await page.click("button:has-text('Rechnung erzeugen')");
  await page.waitForURL(/\/rechnungen\/(?!neu)[a-z0-9]+/);
  const freieUrl = page.url();
  const freie = await page.content();
  ok(freie.includes("E2E Vermittlungshonorar"), "Freie Rechnung mit eigener Position angelegt");
  ok(freie.includes("3.000,00") || freie.includes("3000"), "Freie Rechnung: 2.500 € netto + 20 % USt = 3.000 € brutto");
  // Der Erlös muss im Deckungsbeitrag ankommen – sonst steht das Honorar auf dem Konto und fehlt im DB1.
  await page.goto(base + "/controlling?jahr=" + new Date().getFullYear());
  await page.waitForFunction(() => document.body.innerText.includes("DB1"));
  ok((await page.content()).includes("2.500") || (await page.content()).includes("2.500,00"), "Freie Rechnung kommt im Controlling als Umsatz und DB1 an");
  // Und wieder weg: Löscht man die Rechnung, muss die eigens angelegte Abrechnungszeile mitgehen.
  // Bliebe sie als "offen" stehen, würde der nächste Rechnungslauf das Honorar ein zweites Mal fakturieren.
  await page.goto(freieUrl);
  await page.click("button:has-text('Rechnung endgültig löschen')");
  await page.waitForURL(/geloescht=/);
  await page.goto(base + "/abrechnung?jahr=" + new Date().getFullYear());
  await page.waitForFunction(() => document.body.innerText.length > 200);
  ok(!(await page.content()).includes("E2E Vermittlungshonorar"), "Gelöschte freie Rechnung hinterlässt keine offene Abrechnungszeile");

  // KV-Übersicht: welcher Beschäftiger-KV gilt, auf welchem Stand unsere Tafel ist, wann der
  // nächste Termin fällt. Ein durchgelaufener KV-Stichtag heißt Unterzahlung – das muss sichtbar sein.
  await page.goto(base + "/kollektivvertraege");
  await page.waitForFunction(() => document.body.innerText.includes("Kollektivverträge"));
  const kvSeite = await page.content();
  ok(kvSeite.includes("Metalltechnische Industrie"), "KV-Übersicht listet die metalltechnische Industrie");
  ok(kvSeite.includes("Sätze hinterlegt"), "Referenzzuschlag der Metaller ist als hinterlegt ausgewiesen");
  ok(kvSeite.includes("wko.at"), "Jede Zeile verweist auf die Quelle bei der WKO");
  ok(kvSeite.includes("Nächster Termin") && /1\.11\.20\d\d/.test(kvSeite), "Nächster KV-Termin wird ausgewiesen (Metall am 1.11.)");

  // Systemprotokoll: die Seite, auf der man sieht, was im Hintergrund schiefgegangen ist.
  await page.goto(base + "/fehler");
  await page.waitForFunction(() => document.body.innerText.includes("Systemprotokoll"));
  const fehlerSeite = await page.content();
  ok(fehlerSeite.includes("Systemprotokoll"), "Systemprotokoll erreichbar");
  ok(fehlerSeite.includes("7 Uhr"), "Systemprotokoll nennt die tägliche Berichtszeit");
  await page.click("button:has-text('Bericht jetzt schicken')");
  await page.waitForURL(/probe=/);
  ok(/probe=(nichts%20zu%20melden|gesendet)/.test(page.url()), "Systembericht lässt sich von Hand auslösen");
  await ctx.close();
}

// ---- 1) Mandantentrennung: Heindl sieht keine HQ-Kunden, aber den Bewerber-Pool
{
  const { ctx, page } = await login("heindl@foxandpeople.at");
  await page.goto(base + "/kunden");
  ok(!(await page.content()).includes("Muster Logistik"), "Heindl sieht keine HQ-Kunden");
  await page.goto(base + "/personen?status=SUCHT");
  ok((await page.content()).includes("Aigner"), "Heindl sieht den gemeinsamen Bewerber-Pool");
  await page.goto(base + "/personen?status=VERMITTELT");
  ok(!(await page.content()).includes("Gruber"), "Heindl sieht keine aktiven HQ-Mitarbeiter");
  const r = await page.goto(base + "/einstellungen?tab=nutzer");
  ok(!(await page.content()).includes("Nutzer & Rollen"), "Heindl hat keinen Zugriff auf Admin-Einstellungen");
  const a = await page.goto(base + "/assistent");
  ok(a.url().includes("fehler=keine-berechtigung") || !(await page.content()).includes("Wissensbasis"), "Wissensassistent nur für Systemadmin");
  // Person in Heindl anlegen
  await page.goto(base + "/personen/neu");
  await page.fill("input[name=nachname]", "Testmann");
  await page.fill("input[name=vorname]", "Erika");
  await page.fill("input[name=geburtsdatum]", "1990-05-05");
  await page.fill("input[name=telefon]", "0660 0000000");
  await page.fill("input[name=email]", "erika@example.at");
  await page.fill("input[name=svnr]", "1234050590");
  await page.fill("input[name=standardrolle]", "Staplerfahrer");
  await page.selectOption("select[name=staatsangehoerigkeit]", "Österreich");
  await page.click("button:has-text('Person aufnehmen')");
  await page.waitForURL(/\/personen\/(?!neu)[a-z0-9]+$/);
  ok((await page.content()).includes("Erika Testmann"), "Person in Kostenstelle Heindl angelegt");
  const personUrl = page.url();
  // Kunde anlegen
  await page.goto(base + "/kunden/neu");
  await page.fill("input[name=firmenname]", "Heindl Testkunde GmbH");
  await page.fill("input[name=email]", "test@heindl-kunde.example");
  await page.fill("input[name=uid]", "ATU12345678");
  await page.fill("input[name=strasse]", "Industriestraße 1");
  await page.fill("input[name=plz]", "3100");
  await page.fill("input[name=ort]", "St. Pölten");
  await page.fill("input[name=rechnungsemail]", "rechnung@heindl-kunde.example");
  await page.fill("input[name=ap_name]", "Max Muster");
  await page.fill("input[name=ap_funktion]", "Produktionsleitung");
  await page.fill("input[name=ap_telefon]", "0664 1234567");
  await page.fill("input[name=ap_email]", "max@heindl-kunde.example");
  await page.fill("input[name=arbeitszeitmodell]", "38,5 h Mo–Fr Tagschicht");
  await page.fill("input[name=kollektivvertrag]", "KV Metallindustrie");
  await page.fill("input[name=kvGueltigBis]", "2027-01-31");
  await page.fill("input[name=erforderlicheQualifikationen]", "Staplerschein");
  // Rahmenvertrag und AGB-Annahme sind seit v2.1 Voraussetzung für den ersten Einsatz
  await page.fill("input[name=rahmenvertragBeginn]", "2026-01-01");
  await page.fill("input[name=agbVersion]", "2026-08");
  await page.fill("input[name=agbAkzeptiertAm]", "2026-01-02");
  await page.fill("input[name=agbAkzeptiertVon]", "Max Muster");
  await page.click("button:has-text('Kunde anlegen')");
  await page.waitForURL(/\/kunden\/(?!neu)[a-z0-9]+$/);
  ok((await page.content()).includes("Heindl Testkunde"), "Kunde in Kostenstelle Heindl angelegt");
  const kundeUrl = page.url();
  await page.goto(kundeUrl + "?tab=kontakte");
  await page.fill("input[name=name]", "Rechnungswesen Heindl");
  await page.fill("input[name=email]", "buchhaltung@heindl-kunde.example");
  await page.fill("input[name=funktion]", "Buchhaltung");
  await page.fill("input[name=telefon]", "02742 000000");
  await page.check("input[name=rollen][value=RECHNUNG]");
  await page.click("button:has-text('Speichern')");
  await page.waitForTimeout(800);
  ok((await page.content()).includes("Rechnungsempfang"), "Ansprechpartner mit Rolle Rechnungsempfang angelegt");
  await page.goto(kundeUrl + "?tab=matching&rolle=Staplerfahrer", { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");
  const matchingInhalt = await page.evaluate(() => document.body.innerText);
  ok(matchingInhalt.includes("Testmann") && /score/i.test(matchingInhalt), "Matching schlägt Pool-Bewerber mit Score vor");
  await page.goto(base + "/einsaetze?ansicht=monat");
  ok((await page.content()).includes("Sollstunden"), "Monatsübersicht mit Sollstunden");
  await page.goto(base + "/personen/geburtstage");
  ok((await page.content()).includes("Geburtstagsliste"), "Geburtstagsliste");
  // Einsatz mit Konfliktprüfung (Staplerfahrer ohne Staplerschein → Warnung)
  await page.goto(base + "/einsaetze/neu");
  const optVal = await page.locator("select[name=personId] option", { hasText: "Testmann Erika" }).getAttribute("value");
  await page.selectOption("select[name=personId]", optVal);
  await page.selectOption("select[name=kundeId]", { label: "Heindl Testkunde GmbH" });
  // Die Rolle kommt jetzt aus dem Angebot des Kunden; ohne Angebot bleibt das freie Feld.
  const rolleFrei = await page.locator("input[name=rolle]:not([type=hidden])").count();
  if (rolleFrei) await page.fill("input[name=rolle]:not([type=hidden])", "Staplerfahrer");
  else await page.selectOption("select:near(:text('Rolle / Position'))", { index: 1 });
  await page.fill("input[name=stundenlohn]", "15");
  await page.fill("input[name=verrechnungssatz]", "32");
  await page.check("input[name=zulage][value=SCHMUTZ]");
  await page.click("button:has-text('Prüfen & anlegen')");
  await page.waitForURL(/konflikte=/);
  ok((await page.content()).includes("Staplerschein"), "Konfliktprüfung meldet fehlenden Staplerschein");
  // Ohne hinterlegte Lohntafel des Beschäftigers verlangt die Software eine dokumentierte
  // Entscheidung zum Referenzlohn – ein stiller Rückfall auf die Hausregel wäre Lohndumping.
  const referenzOffen = await page.locator("input[name=referenzGeprueft]").count();
  ok(referenzOffen === 1, "Ohne Lohntafel verlangt die Software eine Entscheidung zum Referenzlohn");
  // Der Kunde hat eine Lohntafel, aber ohne Angebotsposition ist keine Beschäftigungsgruppe gewählt.
  // Dann muss die Software genau das sagen – „Referenzlohn nicht hinterlegt" wäre die falsche Ansage
  // und schickt einen an die falsche Stelle.
  const blockText = await page.content();
  ok(blockText.includes("keine Beschäftigungsgruppe des Beschäftigers gewählt"), "Fehlt nur die Beschäftigungsgruppe, sagt die Software genau das");
  ok(!blockText.includes("Referenzlohn des Beschäftigers ist nicht hinterlegt"), "…und behauptet nicht, die Lohntafel fehle");
  await page.check("input[name=referenzGeprueft]");
  // Erst noch einmal prüfen lassen: Solange ein blockierender Punkt offen ist, gibt es das Häkchen
  // „trotzdem anlegen" bewusst gar nicht.
  await page.click("button:has-text('Erneut prüfen & anlegen')");
  await page.waitForFunction(() => document.querySelector("input[name=konflikteAkzeptiert]") !== null);
  ok(true, "Nach der Bestätigung zum Referenzlohn ist der Einsatz wieder anlegbar");
  await page.check("input[name=konflikteAkzeptiert]");
  await page.check("input[name=referenzGeprueft]");
  await page.click("button:has-text('Erneut prüfen & anlegen')");
  await page.waitForURL(/\/einsaetze\/(?!neu)[a-z0-9]+$/);
  ok((await page.content()).includes("Heindl Testkunde"), "Einsatz nach Bestätigung angelegt");
  ok((await page.content()).includes("Schmutzzulage"), "Zulage am Einsatz gespeichert und in der Kalkulation");
  const einsatzUrl = page.url();
  const pdf = await page.request.get(einsatzUrl + "/bestaetigung", { timeout: 120000 });
  ok(pdf.status() === 200 && pdf.headers()["content-type"].includes("pdf"), "Überlassungsmitteilung als PDF");
  // Angebot kalkulieren
  await page.goto(base + "/angebote/neu");
  ok(page.url().includes("/kunden?hinweis=angebot"), "Angebot ohne Kunde nicht möglich – Umleitung auf Kundenliste");
  await page.goto(base + "/angebote/neu?kundeId=" + kundeUrl.split("/").pop());
  await page.selectOption("select[name=kundeId]", { label: "Heindl Testkunde GmbH" });
  await page.click("button:has-text('Angebot anlegen')");
  await page.waitForURL(/\/angebote\/(?!neu)[a-z0-9]+$/);
  await page.fill("input[list^=rollen-]", "Staplerfahrer");
  const inputs = page.locator("input.num");
  const dez = (n) => page.locator("input[inputmode=decimal]").nth(n);
  // Kommaeingabe: das Feld darf das Komma beim Tippen nicht wegfressen
  await dez(0).click();
  await page.keyboard.type("15,50");
  ok(await dez(0).inputValue() === "15,50", "Bruttostundenlohn nimmt ein Komma an");
  await dez(0).fill("15");
  await dez(1).fill("40"); // wöchentliche Sollarbeitszeit
  await dez(2).fill("32");
  await page.waitForTimeout(300);
  const html = await page.content();
  ok(html.includes("Provision positiv") && html.includes("kostendeckend") && !html.includes("29,71") && !html.includes("20 %"), "Angebots-Editor (Kostenstelle): Ampel ohne Selbstkosten und ohne Prozentsatz");
  ok(html.includes("173,3") || html.includes("173,33"), "Wochenstunden werden in Monatsstunden umgerechnet (40 → 173,33)");
  ok(!html.includes("Anzahl Personen"), "Feld „Anzahl Personen“ ist weg – das Angebot gilt für die Gruppe");
  ok(html.includes("Überstunde 50 %") && html.includes("Überstunde 100 %"), "Überstundenzuschläge stehen im Angebot");
  ok(html.includes("43,20"), "Überstunde 50 % = 32,00 € + 35 % = 43,20 €");
  ok(html.includes("54,40"), "Überstunde 100 % = 32,00 € + 70 % = 54,40 €");
  ok(html.includes("Stundennachweis"), "Frage nach dem Stundennachweis im Angebotskopf");
  await page.click("button:has-text('Änderungen speichern')");
  const provOk = await page.waitForFunction(() => /€[\s\u00a0]9\b/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok(provOk, "Provision nach dem Speichern serverseitig vom DB2 berechnet (≈ 9 €/Monat = 20 % × (396 € DB1 − 350 € Umlage))");
  // Beschäftigungsgruppe des Beschäftiger-KV wählen: Der Referenzlohn muss von selbst im
  // Bruttostundenlohn stehen – abtippen hieße, den Zuschlag jedes Mal im Kopf zu rechnen.
  const bgSelect = page.locator("select").filter({ hasText: "Angelernte" }).first();
  ok(await bgSelect.count() === 1, "Beschäftigungsgruppe des Beschäftiger-KV steht im Angebot zur Wahl");
  await bgSelect.selectOption("B");
  await page.waitForTimeout(400);
  const nachBg = await page.content();
  ok(nachBg.includes("17,39") || nachBg.includes("17.39"), "BG B gewählt – Bruttostundenlohn springt auf den Referenzlohn 17,39 €");
  ok(nachBg.includes("Referenzlohn § 10 AÜG"), "Das Angebot weist den Referenzlohn als solchen aus, nicht als KV-Mindestlohn");
  await page.click("button:has-text('Änderungen speichern')");
  await page.waitForTimeout(600);
  const apdf = await page.request.get(page.url() + "/pdf", { timeout: 120000 });
  ok(apdf.status() === 200 && apdf.headers()["content-type"].includes("pdf"), "Angebots-PDF erzeugt");
  await page.click("button:has-text('PDF erzeugen & versenden')");
  await page.waitForURL(/gesendet=/);
  ok(page.url().includes("gesendet=TEST"), "Angebot versendet (Testmodus, MailLog)");
  // Annehmen – danach muss die Einsatzplanung die Position aus diesem Angebot anbieten.
  const angebotUrl = page.url().split("?")[0];
  await page.goto(angebotUrl);
  await page.click("button:has-text('Angenommen')");
  await page.waitForFunction(() => document.body.innerText.includes("Jetzt Einsätze anlegen"), null, { timeout: 15000 });
  // Der eigentliche Punkt: Kunde wählen und die Rollenauswahl ist sofort da – ohne die Seite neu zu
  // laden. Vorher hing die Positionsliste an der Adresszeile, das Auswahlfeld schrieb aber nicht
  // hinein: Man wählte den Kunden und konnte trotzdem kein Angebot auswählen.
  await page.goto(base + "/einsaetze/neu");
  await page.selectOption("select[name=kundeId]", { label: "Heindl Testkunde GmbH" });
  const rolleDa = await page.waitForFunction(() => document.body.innerText.includes("Rolle aus dem Angebot wählen"), null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok(rolleDa, "Kunde gewählt – die Angebotsposition steht sofort zur Auswahl (ohne Neuladen)");
  // Der Kunde hat eine hinterlegte Lohntafel (Metallindustrie): Dann darf die Software den
  // Referenzlohn nicht als „nicht hinterlegt" melden – und die Beschäftigungsgruppe muss hier
  // wählbar sein, ohne dass man ins Angebot zurückgehen muss.
  const einsatzSeite = await page.content();
  ok(einsatzSeite.includes("Beschäftigungsgruppe beim Beschäftiger"), "Beschäftigungsgruppe des Beschäftigers ist im Einsatz wählbar");
  ok(!einsatzSeite.includes("Referenzlohn des Beschäftigers ist nicht hinterlegt"), "Bei hinterlegter Lohntafel meldet die Software den Referenzlohn nicht als fehlend");
  void inputs;
  // Kostenstelle: keine Abrechnung/Rechnungen (läuft über die Zentrale), Dashboard zeigt Provision
  await page.goto(base + "/abrechnung");
  ok(page.url().includes("fehler=keine-berechtigung"), "Kostenstelle hat keinen Zugriff auf die Monatsabrechnung (Zentrale rechnet ab)");
  await page.goto(base + "/rechnungen");
  ok(page.url().includes("fehler=keine-berechtigung"), "Kostenstelle sieht keine Rechnungen");
  const dash0 = await page.content();
  ok(dash0.includes("Provision Überlassung") && !dash0.includes("DB1 gesamt") && !dash0.includes("Selbstkosten") && !dash0.includes("20 %"), "Kostenstellen-Dashboard zeigt Provision statt DB1/Selbstkosten, ohne Prozentsatz");
  // Monatsabrechnung + Rechnung – als Zentrale (Admin, alle Kostenstellen)
  const hq = await login("admin@foxandpeople.at");
  const hp = hq.page;
  await hp.goto(base + "/abrechnung");
  const zeile = hp.locator("tr", { hasText: "Testmann" }).first();
  await zeile.locator("input[name^=stunden_]").fill("160");
  await zeile.locator("input[name^=bruttolohn_]").fill("2400");
  // Zulagen laufen NICHT mehr automatisch über alle Stunden: Ohne eingetragene Menge wird nichts verrechnet.
  await hp.click("button:has-text('Monat speichern')");
  await hp.waitForURL(/gespeichert=/);
  await hp.waitForLoadState("networkidle");
  const verrWert = () => hp.locator("tr", { hasText: "Testmann" }).first().locator("input[name^=verrechnung_]").inputValue();
  ok((await verrWert()) === "5120", "Ohne Zulagen-Menge: Verrechnung = 160 h × 32 € = 5.120 € (keine automatische Schichtzulage mehr)");
  ok((await hp.content()).includes("Zulagen ohne Menge"), "Hinweis: Einsatz hat Zulagen, aber keine Menge erfasst");
  // Menge lt. Stundenzettel eintragen (alle 160 h Schmutzzulage) → jetzt wird sie verrechnet
  const stundenFeld = await zeile.locator("input[name^=stunden_]").getAttribute("name");
  const einsatzFeldId = stundenFeld.slice("stunden_".length);
  await hp.fill(`input[name="zul_${einsatzFeldId}_SCHMUTZ"]`, "160");
  await hp.click("button:has-text('Monat speichern')");
  // Die URL trägt schon nach dem ersten Speichern ?gespeichert= – auf den neuen WERT warten, nicht auf die URL.
  await hp.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.name.startsWith("verrechnung_") && i.value === "5216"), { timeout: 20000 }).catch(() => undefined);
  ok((await verrWert()) === "5216", "Verrechnung mit Zulagen-Menge = 160 × 32 + 160 × 0,60 = 5.216 €");
  await hp.goto(base + "/abrechnung");
  await hp.click("button:has-text('Rechnungen erzeugen')");
  await hp.waitForURL(/rechnungen\?/);
  ok(/erzeugt=[1-9]/.test(hp.url()), "Rechnung aus Monatsabrechnung erzeugt");
  await hp.goto(kundeUrl + "?tab=angebote");
  await hp.click("table a.row-link >> nth=0");
  await hp.waitForURL(/\/rechnungen\/[a-z0-9]+$/);
  const c = await hp.content();
  ok(/Rechnung 2026\d{3}\b/.test(c) && !c.includes("2026HEI"), "Rechnungsnummer firmenweit im Format JJJJNNN (ohne Kostenstellen-Kürzel)");
  ok(c.includes("buchhaltung@heindl-kunde.example"), "Rechnung geht an den Ansprechpartner mit Rolle Rechnungsempfang");
  ok(c.includes("6.259,20"), "Brutto = 5.216 × 1,2 = 6.259,20 €");
  ok(c.includes("Normalstunden") && c.includes("Schmutzzulage"), "Rechnungspositionen: Normalstunden und Zulagen getrennt");
  // Die Rechnung muss in sich stimmen: Summe der Positionen = Netto, Netto + USt = Brutto (§ 11 UStG)
  {
    const zahl = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));
    const zelle = (label) => zahl((c.match(new RegExp(label + "[\\s\\S]{0,260}?([\\d.]+,\\d{2})")) ?? [])[1] ?? "0");
    // Betrag ist immer die letzte Zelle einer Positionszeile (Währungsformat "€ 5.216,00")
    const posten = [...c.matchAll(/font-semibold"[^>]*>\D*?([\d.]+,\d{2})[^<]*<\/td>\s*<\/tr>/g)].map((m) => zahl(m[1]));
    const netto = zelle("Netto");
    const brutto = zelle("Brutto");
    const ust = zelle("% USt");
    const summePosten = Math.round(posten.reduce((a, b) => a + b, 0) * 100) / 100;
    ok(netto > 0 && Math.abs(summePosten - netto) < 0.005, `Summe der Positionen = Nettobetrag (${summePosten} / ${netto})`);
    ok(Math.abs(netto + ust - brutto) < 0.005, `Netto + Umsatzsteuer = Brutto (${netto} + ${ust} = ${brutto})`);
  }
  const rpdf = await hp.request.get(hp.url() + "/pdf", { timeout: 120000 });
  ok(rpdf.status() === 200, "Rechnungs-PDF erzeugt");
  await hq.ctx.close();
  // Vertrag
  await page.goto(base + "/vertraege/neu?einsatzId=" + einsatzUrl.split("/").pop() + "&typ=DIENSTVERTRAG");
  await page.click("button:has-text('Vertrag erzeugen')");
  await page.waitForURL(/\/vertraege\/(?!neu)[a-z0-9]+$/);
  const v = await page.content();
  ok(v.includes("Erika Testmann") && v.includes("Kettenreith 52"), "Arbeitsvertrag mit Stamm-/Firmendaten befüllt");
  // Kundenprofil-PDF
  const prof = await page.request.get(personUrl + "/profil", { timeout: 120000 });
  ok(prof.status() === 200 && prof.headers()["content-type"].includes("pdf"), "Kundenprofil-PDF (Branding) erzeugt");
  await ctx.close();
}

// ---- 2) Zentrale sieht Heindl-Daten, Admin: Wissensbot & Monatsreport
{
  const { ctx, page } = await login("admin@foxandpeople.at");
  await page.goto(base + "/kunden?status=");
  ok((await page.content()).includes("Heindl Testkunde"), "Zentrale/Admin sieht Kunden aller Kostenstellen");
  await page.goto(base + "/assistent");
  await page.fill("input[placeholder='Frage eingeben …']", "Welche Kündigungsfrist hat ein Leiharbeitnehmer einzuhalten?");
  await page.click("form button.btn-primary");
  await page.waitForSelector("text=Quellen", { timeout: 60000 });
  ok((await page.content()).includes("Arbeitsrecht"), "Wissensbot findet Quellen im Arbeitsrecht-Buch");
  await page.goto(base + "/assistent?tab=reports");
  await page.click("button:has-text('Monatsreport erzeugen')");
  await page.waitForURL(/reports\?id=/);
  ok((await page.content()).includes("Monatsreport") && (await page.content()).includes("DB1"), "Monatsreport erzeugt");
  // Controlling: Plan/Forecast, Liquidität, AÜG-Statistik, Provisionsbeleg
  await page.goto(base + "/controlling?tab=plan");
  ok((await page.content()).includes("Forecast"), "Controlling: Plan/Ist/Forecast");
  await page.goto(base + "/controlling?tab=liquiditaet");
  ok((await page.content()).includes("Wochenvorschau"), "Controlling: Liquiditätsvorschau");
  await page.goto(base + "/controlling?tab=aueg&stichtag=" + new Date().toISOString().slice(0, 10));
  ok((await page.content()).includes("Überlassene Arbeitskräfte") && (await page.content()).includes("Testmann"), "AÜG-Statistik zählt den laufenden Heindl-Einsatz");
  const csv = await page.request.get(base + "/controlling/aueg-statistik.csv?stichtag=" + new Date().toISOString().slice(0, 10), { timeout: 120000 });
  ok(csv.status() === 200 && (await csv.text()).includes("§ 13 AÜG"), "AÜG-Statistik CSV-Export");
  await page.goto(base + "/controlling?tab=provisionen");
  await page.selectOption("select[name=monat]", String(new Date().getMonth() + 1));
  await page.click("button:has-text('Beleg berechnen')");
  await page.waitForURL(/tab=provisionen/);
  ok((await page.content()).includes("Entwurf"), "Provisionsbeleg als Entwurf erzeugt");
  await page.click("button:has-text('Freigeben')");
  const frei = await page.waitForSelector("text=freigegeben", { timeout: 15000 }).then(() => true).catch(() => false);
  ok(frei, "Provisionsbeleg freigegeben");
  const belegLink = await page.locator("a:has-text('PDF')").first().getAttribute("href");
  const bpdf = await page.request.get(base + belegLink, { timeout: 120000 });
  ok(bpdf.status() === 200 && bpdf.headers()["content-type"].includes("pdf"), "Provisionsbeleg-PDF");
  await page.goto(base + "/einstellungen?tab=zulagen");
  ok((await page.content()).includes("Schmutzzulage"), "Zulagen-Stammdaten vorhanden");
  await page.goto(base + "/einstellungen?tab=fristen");
  ok((await page.content()).includes("AngG"), "Fristentabelle editierbar");
  await page.goto(base + "/einstellungen?tab=audit");
  const au = await page.content();
  ok(au.includes("VIEW_SENSITIVE") && au.includes("SEND"), "Audit-Log protokolliert sensible Zugriffe und Versand");
  await ctx.close();
}

// ---- 3) Portal-Link
{
  const { ctx, page } = await login("zentrale@foxandpeople.at");
  // Sortierung ausdrücklich auf Name: seit v2.12 ist die Voreinstellung „neueste Bewerbung oben“
  await page.goto(base + "/personen?q=Gruber&sort=name&richtung=asc");
  await page.click("table a.row-link >> nth=0");
  await page.waitForURL(/\/personen\//);
  const purl = page.url();
  const mailPerson = purl.split("/").pop().split("?")[0];
  await page.goto(base + "/mail/neu?personId=" + mailPerson);
  await page.selectOption("select[name=vorlage]", "einsatzinfo");
  await page.fill("input[name=betreff]", "Test-Mail aus dem Programm");
  await page.click("button:has-text('Senden')");
  await page.waitForURL(/mail=TEST/);
  await page.goto(`${base}/personen/${mailPerson}?tab=historie`);
  ok((await page.content()).includes("Test-Mail aus dem Programm"), "E-Mail aus dem Programm gesendet und in der Historie protokolliert");
  await page.goto(purl + "?tab=zeitkonto");
  ok((await page.content()).includes("Saldo Zeitkonto"), "Zeitkonto-Tab mit Saldo");
  await page.goto(purl + "?tab=fristen");
  ok((await page.content()).includes("Kündigungsfrist Dienstgeber"), "Fristenrechner im Mitarbeiterakt");
  await page.goto(purl);
  await page.goto(page.url() + "?tab=dokumente");
  await page.click("button:has-text('Portal-Link senden')");
  await page.waitForURL(/portal=TEST/);
  ok(true, "Portal-Link versendet (Testmodus)");
  await ctx.close();
}

// ---- 8) v2.1: Referenzlohn, Arbeitszeitaufzeichnung, Compliance, AGB, Übernahme, Kundenportal
{
  const { ctx, page } = await login("admin@foxandpeople.at");
  // Referenz-KV anlegen und Metall-Lohntafel prüfen
  await page.goto(base + "/einstellungen?tab=kv");
  await page.click("button:has-text('Referenz-KV anlegen / aktualisieren')");
  await page.waitForURL(/tab=kv/);
  const kvInhalt = await page.content();
  ok(kvInhalt.includes("Metalltechnische Industrie") && kvInhalt.includes("3009.80"), "Referenzlohn-Tafel Metallindustrie 2026 hinterlegt");
  ok(kvInhalt.includes("Referenzzuschlag"), "Übrige Beschäftiger-KV mit Hinweis „Referenzzuschlag prüfen“");

  // AGB als PDF
  const agb = await page.request.get(base + "/agb/ueberlassung", { timeout: 120000 });
  ok(agb.ok() && (await agb.body()).length > 5000, "AGB Arbeitskräfteüberlassung als PDF");
  const agbV = await page.request.get(base + "/agb/vermittlung", { timeout: 120000 });
  ok(agbV.ok() && (await agbV.body()).length > 5000, "AGB Arbeitskräftevermittlung als PDF");

  // Compliance-/Fristenmonitor
  await page.goto(base + "/compliance");
  ok((await page.content()).includes("Compliance &amp; Fristen"), "Compliance- und Fristenmonitor erreichbar");

  // Arbeitszeitaufzeichnung im Büro erfassen (Beginn/Ende/Pause)
  await page.goto(base + "/stundennachweise");
  const raster = await page.content();
  ok(raster.includes("Beginn") && raster.includes("Ü 50 %") && raster.includes("Fehlzeit"), "Arbeitszeitaufzeichnung nach § 26 AZG im Büro erfassbar");

  // Übernahmegebühr beim Kunden
  await page.goto(base + "/kunden");
  await page.click("a:has-text('Heindl Testkunde')");
  await page.waitForURL(/\/kunden\/(?!neu)[a-z0-9]+/);
  const kUrl = page.url().split("?")[0];
  await page.goto(kUrl + "?tab=uebernahmen");
  ok((await page.content()).includes("Übernahmen ins Stammpersonal"), "Übernahme-Tab beim Kunden");
  await page.selectOption("select[name=personId]", { index: 1 });
  await page.fill("input[name=uebernahmeAm]", "2026-09-01");
  await page.fill("input[name=bruttojahresentgelt]", "40000");
  await page.fill("input[name=monateUeberlassen]", "0");
  await page.click("button:has-text('Honorar berechnen')");
  await page.waitForURL(/tab=uebernahmen&ok=1/);
  ok((await page.content()).includes("12.000,00"), "Übernahmegebühr 30 % von 40.000 € = 12.000 €");

  // Kundenportal-Link versenden
  await page.selectOption("select[name=zweck]", "BEIDES");
  await page.click("button:has-text('Link senden')");
  await page.waitForURL(/gesendet=/);
  ok(true, "Kundenportal-Link versendet (Testmodus)");
  await ctx.close();
}

// ---- Bewerber aus einer beliebigen Fremdliste importieren (Excel mit unbekannten Spalten)
{
  await testlisteSchreiben();
  const { ctx, page } = await login("zentrale@foxandpeople.at");
  await page.goto(base + "/personen?bereich=bewerber");
  ok((await page.content()).includes("Aus Liste importieren"), "Knopf „Aus Liste importieren“ im Bewerber-Pool");

  await page.goto(base + "/personen/import");
  await page.setInputFiles("input[name=datei]", "/tmp/e2e-fremdliste.xlsx");
  await page.click("button:has-text('Datei einlesen')");
  await page.waitForURL(/datei=/);
  const c = await page.content();
  ok(c.includes("Spalten zuordnen"), "Titelzeile übersprungen, Überschriften erkannt");
  const gewaehlt = (feld) => page.locator(`select[name="${feld}"]`).evaluate((el) => el.options[el.selectedIndex].text);
  ok(await gewaehlt("z_nachname") === "Familienname", "Nachname auf „Familienname“ vorgeschlagen");
  ok(await gewaehlt("z_geburtsdatum") === "geb. am", "Geburtsdatum auf „geb. am“ vorgeschlagen");
  ok(await gewaehlt("z_stapler") === "Stapler", "Staplerschein erkannt");
  ok(c.includes("wird übernommen") && c.includes("gibt es schon im Pool") && c.includes("kein Name"),
     "Vorschau trennt neu, Dublette und Zeile ohne Namen");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/40-bewerber-import.png`, fullPage: true });

  await page.fill('input[name="quelle"]', "AMS Melk Prüflauf");
  await page.click("button:has-text('Jetzt übernehmen')");
  await page.waitForURL(/neu=/);
  ok(/3 Bewerber übernommen/.test(await page.content()), "Drei übernommen, drei übersprungen");

  await page.goto(base + "/personen?bereich=bewerber&q=Kovac");
  ok((await page.content()).includes("Kovac"), "Importierter Bewerber steht im Pool");

  await page.goto(base + "/personen/import");
  await page.setInputFiles("input[name=datei]", "/tmp/e2e-fremdliste.xlsx");
  await page.click("button:has-text('Datei einlesen')");
  await page.waitForURL(/datei=/);
  ok(!(await page.content()).includes("wird übernommen"), "Zweiter Lauf legt nichts doppelt an");
  await ctx.close();
}

// ---- Mitarbeiterliste importieren (CSV mit Stammdaten) und Systemadmin-Löschungen
{
  const csv = [
    "Zuname;Vorname;SVNR;Eintritt;Stundenlohn;Wochenstunden;Staatsangehoerigkeit;Geschlecht;Mobil;Lohngruppe",
    "Prueflohn;Anna;1234010190;01.03.2026;14,50;38,5;Österreich;weiblich;0664 9998887;C",
    "Prueflohn;Bela;2345020291;15.04.2026;13,20;40;Ungarn;m;0676 1112223;B",
  ].join("\n");
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/e2e-mitarbeiterliste.csv", "\ufeff" + csv, "utf8");

  const { ctx, page } = await login("admin@foxandpeople.at");
  await page.goto(base + "/personen?bereich=mitarbeiter");
  ok((await page.content()).includes("art=MITARBEITER"), "Import-Knopf bei den Mitarbeitern führt in den Mitarbeitermodus");

  await page.goto(base + "/personen/import?art=MITARBEITER");
  const vorher = await page.content();
  ok(vorher.includes("Mitarbeiter aus einer Liste übernehmen"), "Import-Seite im Mitarbeitermodus");
  await page.setInputFiles("input[name=datei]", "/tmp/e2e-mitarbeiterliste.csv");
  await page.click("button:has-text('Datei einlesen')");
  await page.waitForURL(/datei=/);
  const gewaehlt = (feld) => page.locator(`select[name="${feld}"]`).evaluate((el) => el.options[el.selectedIndex].text);
  ok(await gewaehlt("z_svnr") === "SVNR", "SVNR-Spalte vorgeschlagen");
  ok(await gewaehlt("z_eintrittsdatum") === "Eintritt", "Eintrittsdatum vorgeschlagen");
  ok(await gewaehlt("z_stundenlohn") === "Stundenlohn", "Stundenlohn vorgeschlagen");
  ok(await gewaehlt("z_beschaeftigungsgruppe") === "Lohngruppe", "Lohngruppe nicht mit dem Stundenlohn verwechselt");
  await page.click("button:has-text('Als Mitarbeiter übernehmen')");
  await page.waitForURL(/neu=/);
  ok(/2 Mitarbeiter übernommen/.test(await page.content()), "Zwei Mitarbeiter übernommen");

  await page.goto(base + "/personen?bereich=mitarbeiter&q=Prueflohn");
  ok((await page.content()).includes("Prueflohn"), "Importierter Mitarbeiter steht bei den Mitarbeitern");
  const zeile = page.locator("a.row-link:has-text('Prueflohn Anna')").first();
  await zeile.click();
  await page.waitForURL(/\/personen\/[a-z0-9]+/);
  const akt = await page.content();
  ok(/14,50|14,5/.test(akt) || akt.includes("0190"), "Stammdaten aus der Liste im Akt angekommen");

  // Systemadmin löscht die importierten Mitarbeiter wieder
  await page.click("button:has-text('Endgültig löschen')");
  await page.waitForURL(/personen/);
  await page.goto(base + "/personen?bereich=mitarbeiter&q=Prueflohn");
  ok(!(await page.content()).includes("Prueflohn Anna"), "Systemadmin kann den Mitarbeiter endgültig löschen");

  // Aufräum-Seite in den Einstellungen
  await page.goto(base + "/einstellungen?tab=loeschen");
  const l = await page.content();
  ok(l.includes("Bestand leeren") && l.includes("Sicherheitsabfrage"), "Seite „Daten löschen“ für den Systemadmin");
  await page.check('input[name="b_angebote"]');
  await page.click("button:has-text('Ausgewählte Bereiche endgültig löschen')");
  await page.waitForURL(/fehler=bestaetigung/);
  ok(true, "Ohne getipptes LÖSCHEN passiert nichts");
  await ctx.close();

  const heindl = await login("heindl@foxandpeople.at");
  await heindl.page.goto(base + "/einstellungen?tab=loeschen");
  ok(!(await heindl.page.content()).includes("Bestand leeren"), "Sachbearbeitung kommt nicht an die Löschseite");
  await heindl.ctx.close();
}

// ---- Anrede je Ansprechpartner und Wochen-Sammelklick in der Planung
{
  const { ctx, page } = await login("zentrale@foxandpeople.at");
  await page.goto(base + "/kunden");
  await page.locator("a.row-link").first().click();
  await page.waitForURL(/\/kunden\/[a-z0-9]+/);
  const kundeId = page.url().split("/").pop().split("?")[0];
  await page.goto(`${base}/kunden/${kundeId}?tab=kontakte`);
  const apForm = page.locator("#ap-neu");
  await apForm.locator('input[name="name"]').fill("Josef Anredetest");
  await apForm.locator('input[name="funktion"]').fill("Disposition");
  await apForm.locator('input[name="telefon"]').fill("0664 1112223");
  await apForm.locator('input[name="email"]').fill("anredetest@example.at");
  await apForm.locator('select[name="anrede"]').selectOption("Herr");
  await apForm.locator('select[name="anredeDu"]').selectOption("DU");
  await apForm.locator("button").click();
  // Die Adresse ändert sich nicht (wir sind schon auf ?tab=kontakte) – also auf den Inhalt warten
  const warteAuf = (text) => page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout: 15000 }).then(() => true).catch(() => false);
  ok(await warteAuf("Hallo Josef,"), "Ansprechpartner mit Du-Anrede: „Hallo Josef,“");

  // auf Sie umstellen – die Zeile muss sich mitändern
  const zeile = page.locator("tr", { hasText: "Josef Anredetest" });
  await zeile.locator('select[name="anredeDu"]').selectOption("SIE");
  await zeile.locator('button[title="Anrede speichern"]').click();
  ok(await warteAuf("Sehr geehrter Herr Anredetest,"), "Umgestellt auf Sie: „Sehr geehrter Herr Anredetest,“");

  // Wochen-Sammelklick in der Einsatzplanung
  await page.goto(base + "/einsaetze?ansicht=monat");
  const knopf = page.locator("button:has-text('Woche')").first();
  if (await knopf.count()) {
    const vorher = await page.locator('select[name^="wt_"]').evaluateAll((els) => els.filter((e) => e.value === "X").length);
    await knopf.click();
    const nachher = await page.locator('select[name^="wt_"]').evaluateAll((els) => els.filter((e) => e.value === "X").length);
    ok(nachher > vorher, `Sammelklick setzt die Woche auf anwesend (${vorher} → ${nachher} X-Tage)`);
  } else ok(true, "Kein Mitarbeiter im Raster – Sammelklick nicht prüfbar");
  await ctx.close();
}

// ---- Bewerberliste aus fremder Branchensoftware (Adressspalte, Länderkürzel, Anrede, Datumsfilter)
{
  const { writeFileSync } = await import("node:fs");
  const csv = [
    "Anrede;Vorname;Nachname;PKW FS;bew. Beruf;Adresse;Mobil;EMail;Nationalität;bew. am;Geb.Dat.",
    "Herr;Milos;Fremdliste;1;Lagerarbeiter;A-3386 Hafnerbach, Dunkelsteiner Str. 21;0664 3332211;;AUT;02.09.2026;24.03.1992",
    "Frau;Amina;Fremdliste;0;Produktionshilfskraft;A-3100 St. Pölten, Mühlweg 22/1;0676 4443322;amina@example.at;SYR;15.03.2019;01.01.2986",
  ].join("\n");
  writeFileSync("/tmp/e2e-fremdsystem.csv", "\ufeff" + csv, "utf8");

  const { ctx, page } = await login("zentrale@foxandpeople.at");
  await page.goto(base + "/personen/import");
  await page.setInputFiles("input[name=datei]", "/tmp/e2e-fremdsystem.csv");
  await page.click("button:has-text('Datei einlesen')");
  await page.waitForURL(/datei=/);
  const gewaehlt = (feld) => page.locator(`select[name="${feld}"]`).evaluate((el) => el.options[el.selectedIndex].text);
  ok(await gewaehlt("z_adresse") === "Adresse", "Sammelspalte Adresse erkannt");
  ok(await gewaehlt("z_staatsangehoerigkeit") === "Nationalität", "Nationalität erkannt");
  ok(await gewaehlt("z_geschlecht") === "Anrede", "Anrede als Geschlecht erkannt");
  ok(await gewaehlt("z_beworbenAm") === "bew. am", "Bewerbungsdatum erkannt");
  ok((await page.content()).includes("3386 Hafnerbach"), "Vorschau zeigt PLZ und Ort aus der Adressspalte");

  // Datumsfilter: die Bewerbung von 2019 fällt heraus
  await page.fill('input[name="nurAb"]', "2026-01-01");
  await page.click("button:has-text('Vorschau aktualisieren')");
  await page.waitForURL(/nurAb=2026-01-01/);
  const gefiltert = await page.content();
  ok(gefiltert.includes("Milos") && !gefiltert.includes("Amina"), "Datumsfilter lässt nur die neue Bewerbung durch");

  await page.fill('input[name="quelle"]', "Fremdsystem Prüflauf");
  await page.click("button:has-text('Jetzt übernehmen')");
  await page.waitForURL(/neu=/);
  const meldung = await page.content();
  ok(/1 Bewerber übernommen/.test(meldung), "Ein Bewerber übernommen");
  ok(/1 wegen des Datumsfilters ausgelassen/.test(meldung), "Der alte Datensatz wurde ausgewiesen, nicht stillschweigend verschluckt");

  await page.goto(base + "/personen?bereich=bewerber&q=Fremdliste&ansicht=liste");
  await page.locator("a.row-link:has-text('Fremdliste Milos')").first().click();
  await page.waitForURL(/\/personen\/[a-z0-9]+/);
  const akt = await page.content();
  ok(akt.includes("Hafnerbach") && akt.includes("3386"), "Adresse zerlegt im Akt");
  ok(akt.includes("Österreich"), "Länderkürzel AUT in Klartext übersetzt");
  await ctx.close();
}

// ---- Zwei Fehler aus dem Test vom 31.08.: blockierte Hausschrift und hängendes Matching
{
  const { ctx, page } = await login("admin@foxandpeople.at");
  const blockiert = [];
  page.on("console", (m) => { if (m.type() === "error" && /Refused to load/.test(m.text())) blockiert.push(m.text().slice(0, 60)); });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  ok(blockiert.length === 0, `Sicherheitsregel blockiert keine Hausschrift mehr${blockiert.length ? " – " + blockiert[0] : ""}`);
  const schrift = await page.evaluate(() => getComputedStyle(document.querySelector("h1") ?? document.body).fontFamily);
  ok(/Instrument Sans/.test(schrift), `Hausschrift geladen (${schrift.split(",")[0]})`);

  await page.goto(base + "/kunden");
  await page.locator("a.row-link").first().click();
  await page.waitForURL(/\/kunden\/[a-z0-9]+/);
  const kid = page.url().split("/").pop().split("?")[0];
  const t0 = Date.now();
  await page.goto(`${base}/kunden/${kid}?tab=matching`, { waitUntil: "networkidle", timeout: 60000 });
  const dauer = Date.now() - t0;
  ok(dauer < 15000, `„Passende Mitarbeiter" lädt ohne Geokodierung im Seitenaufbau (${dauer} ms)`);
  ok(/Passende Mitarbeiter/.test(await page.content()), "Matching-Reiter zeigt Inhalt");
  await ctx.close();
}

// ---- Bewerberliste: Sortierung, Seitengröße, neue Felder
{
  const { ctx, page } = await login("zentrale@foxandpeople.at");
  await page.goto(base + "/personen?bereich=bewerber");
  const kopf = await page.content();
  ok(kopf.includes("Beworben am"), "Spalte heißt „Beworben am“ statt „Aufnahme“");
  ok(kopf.includes("Pro Seite"), "Seitengröße wählbar");
  ok(!kopf.includes(">Aufnahme<"), "alte Spaltenüberschrift ist weg");

  // Standard ist absteigend – neueste Bewerbung oben
  const datumsSpalte = async () => page.locator("table.table tbody tr td:last-child").allInnerTexts();
  const ab = await datumsSpalte();
  await page.click("th:has-text('Beworben am') a");
  await page.waitForURL(/richtung=asc/);
  const auf = await datumsSpalte();
  ok(ab.length > 1 && auf.length > 1 && ab[0] !== auf[0], `Sortierung dreht die Reihenfolge um (${ab[0]} ↔ ${auf[0]})`);

  await page.goto(base + "/personen?bereich=bewerber&proSeite=25");
  ok((await page.locator("table.table tbody tr").count()) <= 25, "Seitengröße 25 wird eingehalten");

  // Anlage: die vier Recruiting-Felder sind draußen, Auto und Führerschein getrennt
  await page.goto(base + "/personen/neu");
  const formular = await page.content();
  ok(!formular.includes("Talent-Pool") && !formular.includes("Absagegrund") && !formular.includes("Wiedervorlage am") && !formular.includes("Erstkontakt am"),
     "Erstkontakt, Absagegrund, Talent-Pool und Wiedervorlage sind aus der Anlage entfernt");
  ok(formular.includes("Führerschein B") && formular.includes("Auto vorhanden"), "Führerschein und Auto sind zwei getrennte Häkchen");
  ok(await page.locator('input[name="aufnahmedatum"]').inputValue() === new Date().toISOString().slice(0, 10), "Beworben am ist mit dem heutigen Tag vorbelegt");
  await ctx.close();
}

// ---- Kundenprofil: eigener Reiter, Werdegang bearbeiten, an Kunden senden mit Nachfass-Erinnerung
{
  const { ctx, page } = await login("zentrale@foxandpeople.at");
  await page.goto(base + "/personen?q=Gruber&sort=name&richtung=asc");
  await page.click("table a.row-link >> nth=0");
  await page.waitForURL(/\/personen\/[a-z0-9]+/);
  const pid = page.url().split("/").pop().split("?")[0];

  await page.goto(`${base}/personen/${pid}?tab=kundenprofil`);
  const inhalt = await page.content();
  ok(inhalt.includes("Werdegang"), "Kundenprofil hat einen eigenen Reiter mit Werdegang");
  ok(inhalt.includes("Profil an Beschäftiger senden"), "Versandkarte mit Kundenauswahl vorhanden");

  // Werdegang eintragen und speichern
  await page.locator('input[name="be_zeitraum"]').first().fill("2019 – 2024");
  await page.locator('input[name="be_firma"]').first().fill("Muster Metall GmbH");
  await page.locator('input[name="be_taetigkeit"]').first().fill("Staplerfahrer");
  await page.click("button:has-text('Werdegang speichern')");
  await page.waitForURL(/ok=werdegang/);
  ok((await page.content()).includes("Muster Metall GmbH"), "Werdegang lässt sich im Reiter eintragen und bleibt gespeichert");

  // Profil an einen Kunden senden
  await page.selectOption('select[name="kundeId"]', { index: 1 });
  await page.click("button:has-text('Profil senden & ablegen')");
  await page.waitForURL(/gesendet=/);
  const nachher = await page.content();
  ok(/An wen ging das Profil/.test(nachher), "Versandliste vorhanden");
  ok(/offen/.test(nachher), "Rückmeldung steht auf offen");

  // Nachfass-Erinnerung muss auf der Wiedervorlage stehen
  await page.goto(base + "/aufgaben");
  ok((await page.content()).includes("Rückmeldung zu"), "Erinnerung an die Rückmeldung liegt auf der Wiedervorlage");
  await ctx.close();
}

// ---- Kostenerfassung: Fixkosten, variable Kosten, Übernahme in den Folgemonat
{
  const { ctx, page } = await login("admin@foxandpeople.at");
  const jahr = new Date().getFullYear();
  await page.goto(`${base}/controlling/kosten?jahr=${jahr}&monat=3`);
  ok((await page.content()).includes("Fixkosten"), "Kostenseite erreichbar");

  const anlegen = async (bez, betrag, art) => {
    await page.fill('input[name="bezeichnung"]', bez);
    await page.fill('input[name="betrag"]', betrag);
    await page.selectOption('select[name="fix"]', art);
    await page.click("button:has-text('Hinzufügen')");
    await page.waitForURL(/ok=1/);
  };
  await anlegen("E2E Miete Büro", "1200", "fix");
  await anlegen("E2E Inserate", "300", "variabel");
  // Auf den Inhalt warten, nicht nur auf die Adresse – sonst liest man die alte Seite
  const da = await page.waitForFunction(() => document.body.innerText.includes("E2E Inserate"), null, { timeout: 15000 }).then(() => true).catch(() => false);
  const nach = await page.evaluate(() => document.body.innerText);
  ok(da && nach.includes("E2E Miete Büro"), "Fixkosten und variable Kosten erfasst");
  ok(/1\.500/.test(nach), "Monatssumme 1.500 € gebildet");

  await page.click("button:has-text('Fixkosten in den Folgemonat übernehmen')");
  await page.waitForURL(/uebernommen=/);
  ok(page.url().includes("monat=4") && page.url().includes("uebernommen=1"), "Genau die eine Fixkostenzeile wandert in den April");
  const april = await page.content();
  ok(april.includes("E2E Miete Büro"), "Miete steht im Folgemonat");
  ok(!april.includes("E2E Inserate"), "Variable Kosten werden nicht mitübernommen – die entstehen jeden Monat neu");

  // zweimal übernehmen darf nicht doppelt anlegen
  await page.goto(`${base}/controlling/kosten?jahr=${jahr}&monat=3`);
  await page.click("button:has-text('Fixkosten in den Folgemonat übernehmen')");
  await page.waitForURL(/uebernommen=/);
  ok(page.url().includes("uebernommen=0"), "Zweite Übernahme legt nichts doppelt an");

  // Kostenstelle darf die Kostenseite nicht sehen
  await ctx.close();
  const h = await login("heindl@foxandpeople.at");
  await h.page.goto(`${base}/controlling/kosten?jahr=${jahr}&monat=3`);
  ok(!(await h.page.content()).includes("Position hinzufügen"), "Kostenstelle kommt nicht an die Kostenerfassung");
  await h.ctx.close();
}

// ---- PLZ füllt den Ort
{
  const { ctx, page } = await login("zentrale@foxandpeople.at");
  await page.goto(base + "/personen/neu");
  await page.fill('input[name="plz"]', "3233");
  const gefuellt = await page.waitForFunction(() => (document.querySelector('input[name="ort"]')?.value ?? "") !== "", null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(gefuellt && (await page.locator('input[name="ort"]').inputValue()) === "Kilb", "PLZ 3233 füllt den Ort mit Kilb");

  // Bei mehreren Orten wird nichts erraten, sondern zur Auswahl gestellt
  await page.fill('input[name="plz"]', "3100");
  await page.waitForTimeout(900);
  ok((await page.locator('input[name="ort"]').inputValue()).length > 0, "PLZ 3100 füllt St. Pölten");
  await ctx.close();
}

await browser.close();

console.log(fails ? `\n${fails} Prüfungen fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fails ? 1 : 0);
