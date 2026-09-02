// Smoke-Test der Mitarbeiter-App (mobiler Viewport) + Büro-Gegenseite
import { chromium } from "playwright";
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
let fails = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fails++; };
const shots = process.env.SHOTS ? `${process.env.SHOTS}` : null;
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const shot = async (n) => { if (shots) await page.screenshot({ path: `${shots}/app-${n}.png`, fullPage: true }); };

// Login mit E-Mail → Code (Testmodus zeigt den Code)
await page.goto(base + "/app/login"); await shot("01-login");
await page.fill("input[name=eingabe]", "anna.gruber@example.at");
await page.click("button:has-text('Code anfordern')");
await page.waitForURL(/schritt=code/);
const code = new URL(page.url()).searchParams.get("test");
ok(!!code && code.length === 6, "Login-Code erzeugt (Testmodus sichtbar)");
ok(/an=a%2A%2A%2A%40|an=a\*\*\*%40/.test(page.url()), "Code geht an die E-Mail-Adresse (kein SMS-Versand)");
await page.fill("input[name=code]", "000000"); await page.click("button:has-text('Anmelden')"); await page.waitForURL(/fehler=code/);
ok(true, "Falscher Code abgewiesen");
await page.fill("input[name=code]", code); await page.click("button:has-text('Anmelden')");
await page.waitForURL((u) => u.pathname === "/app");
const home = await page.content();
ok(home.includes("Anna") && home.includes("Dein Einsatz") && home.includes("Muster Logistik"), "Startseite mit Einsatz");
await shot("02-start");
// v2.5: Stundenerfassung ist standardmäßig AUS – sie wird je Einsatz im Büro freigeschaltet
const startOhneStunden = await page.content();
ok(!startOhneStunden.includes("/app/stunden"), "Ohne Freischaltung kein Stundenzettel in der App");
await page.goto(base + "/app/stunden");
ok(new URL(page.url()).pathname === "/app", "Aufruf des Stundenzettels führt zurück zur Startseite");

// Büro: Stundenerfassung für den Einsatz freischalten
const cB = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pB = await cB.newPage();
await pB.goto(base + "/login"); await pB.fill("input[name=email]", "zentrale@foxandpeople.at"); await pB.fill("input[name=passwort]", "FoxPeople2026!"); await pB.click("form button"); await pB.waitForURL((u) => !u.pathname.startsWith("/login"));
await pB.goto(base + "/einsaetze?ansicht=liste");
await pB.click("a.row-link:has-text('Anna')");
await pB.waitForURL(/\/einsaetze\/(?!neu)[a-z0-9]+/);
await pB.check("input[name=stundenerfassungApp]");
await pB.click("button:has-text('Speichern')");
await pB.waitForLoadState("networkidle");
ok(await pB.isChecked("input[name=stundenerfassungApp]"), "Stundenerfassung im Einsatz freigeschaltet");
await cB.close();

// Stunden einreichen
await page.goto(base + "/app/stunden"); await shot("03-stunden");
ok(new URL(page.url()).pathname === "/app/stunden", "Nach der Freischaltung ist der Stundenzettel da");
// Uhrzeiten eintragen: die Stundenzahl muss die App selbst rechnen (früher gewann die vorbefüllte 8)
await page.fill("input[name=mo_beginn]", "06:00"); await page.fill("input[name=mo_ende]", "17:30"); await page.fill("input[name=mo_pause]", "30");
await page.waitForTimeout(200);
ok((await page.inputValue("input[name=mo]")) === "11", "Stunden werden aus Beginn, Ende und Pause gerechnet (11 h)");
await page.fill("input[name=mo_beginn]", ""); await page.fill("input[name=mo_ende]", ""); await page.fill("input[name=mo_pause]", "");
await page.fill("input[name=mo]", "8"); await page.fill("input[name=di]", "8.5"); await page.fill("input[name=mi]", "8"); await page.fill("input[name=do]", "8"); await page.fill("input[name=fr]", "6");
await page.fill("textarea[name=notiz]", "Di 0,5 h Überstunde");
await page.click("button:has-text('einreichen')"); await page.waitForURL(/ok=1/);
ok((await page.content()).includes("eingereicht"), "Stundennachweis eingereicht (38,5 h)");
// Krankmeldung
await page.goto(base + "/app/abwesenheit"); await shot("04-krank");
const abwSeite = await page.content();
ok(abwSeite.includes("telefonisch") && !abwSeite.includes("Jetzt krank melden"), "Krankmeldung nur telefonisch – kein Formular in der App");
// Urlaub
await page.fill("input[name=von]", "2026-12-21"); await page.fill("input[name=bis]", "2026-12-23"); await page.click("form button:has-text('Urlaub beantragen')"); await page.waitForURL(/ok=URLAUB/);
ok((await page.content()).includes("beantragt"), "Urlaubsantrag eingereicht");
// Chat
await page.goto(base + "/app/chat"); await page.fill("input[name=text]", "Hallo, wann kommt der Lohnzettel für August?"); await page.click("button[aria-label=Senden]"); await page.waitForTimeout(800);
ok((await page.content()).includes("Lohnzettel für August"), "Chat-Nachricht gesendet"); await shot("05-chat");
// Profil + Upload
await page.goto(base + "/app/profil"); await shot("06-profil");
await page.fill("input[name=notfallkontakt]", "Karl Gruber, 0664 1111111"); await page.click("button:has-text('Daten bestätigen'), button:has-text('Änderungen speichern')"); await page.waitForURL(/ok=1/);
ok((await page.content()).includes("aktualisiert"), "Profil bestätigt");
await page.selectOption("select[name=kategorie]", "Staplerschein"); await page.fill("input[name=gultigBis]", "2031-05-01");
await page.setInputFiles("input[name=datei]", { name: "staplerschein.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
await page.click("button:has-text('Hochladen')"); await page.waitForURL(/ok=upload/);
ok(true, "Dokument hochgeladen (ungeprüft)");
await page.goto(base + "/app/dokumente"); ok((await page.content()).includes("wird geprüft"), "Upload erscheint unter Unterlagen als „wird geprüft“"); await shot("07-dokumente");
// Empfehlung
await page.goto(base + "/app/empfehlen"); await shot("08-empfehlen");
const werbeCode = ((await page.content()).match(/\/w\/([a-z0-9-]+)/) ?? [])[1] ?? null;
ok(!!werbeCode, "Persönlicher Empfehlungs-Link in der App");
await page.fill("input[name=name]", "Max Beispiel"); await page.fill("input[name=telefon]", "0660 2222222"); await page.check("input[name=einverstanden]"); await page.click("button:has-text('Empfehlung senden')"); await page.waitForURL(/ok=1/);
ok((await page.content()).includes("Max Beispiel"), "Empfehlung abgegeben");
await page.goto(base + "/app/lohn"); await shot("09-lohn");

// ---- v2.2: Lohn-Vorschau, Einsatz-Details, Checkliste, Bewertung, Datenschutz
const lohn = await page.content();
ok(lohn.includes("Lohnzettel") && !lohn.includes("brutto, gesch"), "Lohnseite ohne Vorschau (nur Lohnzettel und abgerechnetes Zeitkonto)");
await page.goto(base + "/app/weg");
ok((await page.content()).includes("Weg bei uns"), "„Dein Weg bei uns“ in der App");
await page.goto(base + "/app/einsatz");
const eins = await page.content();
ok((eins.includes("Aktueller Einsatz") || eins.includes("kein Einsatz geplant")) && !eins.includes("WOCHENPLAN"), "Einsatz-Details ohne Wochenplan");
await page.goto(base + "/app");
const start = await page.content();
ok(start.includes("Freunde werben Freunde"), "Freunde-werben-Freunde-Übersicht auf der Startseite");
ok(start.includes("JETZT DRAN") || start.includes("Jetzt dran") || start.includes("Alles erledigt"), "Startseite zeigt die eine Handlung, die jetzt dran ist");
await page.goto(base + "/app/empfehlen");
const emp = await page.content();
ok(emp.includes("Dein Stand") && emp.includes("So läuft es ab"), "Prämienstand und Ablauf in der Empfehlungsseite");
await page.goto(base + "/app/checkliste");
ok((await page.content()).includes("Dein Stand"), "Onboarding-Checkliste in der App");
await page.goto(base + "/app/bewerten");
ok((await page.content()).includes("Beschäftiger"), "Beschäftiger-Bewertung in der App");
await page.goto(base + "/app/profil");
const prof = await page.content();
ok(prof.includes("Datenschutz") && prof.includes("Benachrichtigungen"), "Datenschutz-Einwilligung und Benachrichtigungen im Profil");
await page.check("input[name=ok]");
await page.click("form:has(input[name=ok]) button");
await page.waitForURL(/ok=1/);
await page.goto(base + "/app/profil");
ok((await page.locator("input[name=ok]").count()) === 0, "Datenschutzinformation bestätigt");
await ctx.close();

// ---- Büro-Seite
const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p2 = await c2.newPage();
await p2.goto(base + "/login"); await p2.fill("input[name=email]", "zentrale@foxandpeople.at"); await p2.fill("input[name=passwort]", "FoxPeople2026!"); await p2.click("form button"); await p2.waitForURL((u) => !u.pathname.startsWith("/login"));
await p2.goto(base + "/nachrichten");
ok((await p2.content()).includes("Lohnzettel für August"), "Chat im Büro-Posteingang");
await p2.fill("input[name=text]", "Hallo Anna, der Lohnzettel kommt am 15. in die App."); await p2.click("button:has-text('Senden')"); await p2.waitForURL(/person=/);
ok((await p2.content()).includes("am 15. in die App"), "Antwort gesendet");
if (shots) await p2.screenshot({ path: `${shots}/28-nachrichten-buero.png` });
await p2.goto(base + "/stundennachweise");
ok((await p2.content()).includes("38.5"), "Stundennachweis im Büro sichtbar");
if (shots) await p2.screenshot({ path: `${shots}/29-stundennachweise-buero.png` });
await p2.click("button:has-text('Bestätigen')"); await p2.waitForURL(/ok=1/);
await p2.goto(base + "/abrechnung");
// Seit v2.1 trennt die Arbeitszeitaufzeichnung Normal- und Überstunden: Di 8,5 h → 38 Normalstunden + 0,5 h Ü50.
// Liegt die Testwoche über einem Monatswechsel, verteilen sich die 38 Stunden tagesgenau auf zwei Zeilen –
// deshalb wird die Summe geprüft und nicht eine feste Zahl.
{
  // Die Testwoche kann über einen Monatswechsel laufen – dann stehen die Stunden tagesgenau auf zwei
  // Monatsseiten. Geprüft wird deshalb über beide Monate der Woche hinweg.
  const mo = new Date(); mo.setDate(mo.getDate() - ((mo.getDay() + 6) % 7));
  const so = new Date(mo); so.setDate(so.getDate() + 6);
  const monate = [...new Set([`${mo.getFullYear()}-${mo.getMonth() + 1}`, `${so.getFullYear()}-${so.getMonth() + 1}`])];
  let normal = 0, ue50 = 0;
  for (const m of monate) {
    const [j, mm] = m.split("-");
    await p2.goto(`${base}/abrechnung?jahr=${j}&monat=${mm}`);
    const zeile = await p2.locator("tr", { hasText: "Gruber" }).first().innerHTML().catch(() => "");
    normal += Number((zeile.match(/name="stunden_[a-z0-9]+"[^>]*?value="([\d.]+)"/) ?? [])[1] ?? 0);
    ue50 += Number((zeile.match(/name="ue50_[a-z0-9]+"[^>]*?value="([\d.]+)"/) ?? [])[1] ?? 0);
  }
  ok(Math.abs(normal - 38) < 0.01 && Math.abs(ue50 - 0.5) < 0.01, `Bestätigte Stunden in der Monatsabrechnung (${normal} h normal + ${ue50} h Ü50)`);
}
await p2.goto(base + "/empfehlungen");
ok((await p2.content()).includes("Max Beispiel"), "Empfehlung im Büro sichtbar");
if (shots) await p2.screenshot({ path: `${shots}/30-empfehlungen-buero.png` });
await p2.goto(base + "/aufgaben");
const auf = await p2.content();
// Krankmeldungen kommen seit v2.3 nicht mehr aus der App – geprüft werden Urlaub und Dokumentprüfung
ok(auf.includes("Urlaubsantrag") && auf.includes("Dokument"), "Wiedervorlagen für Urlaub und Dokumentprüfung");
// Büro: App-Verwaltung im Mitarbeiterakt (Zugang sperren, Datenschutz-Stand)
await p2.goto(base + "/personen?bereich=mitarbeiter&q=Gruber");
await p2.click("a.row-link:has-text('Gruber Anna')");
await p2.waitForURL(/\/personen\/(?!neu)[a-z0-9]+/);
await p2.goto(p2.url().split("?")[0] + "?tab=dokumente");
ok((await p2.content()).includes("Mitarbeiter-App"), "App-Verwaltung im Mitarbeiterakt");
// v2.4: Einladung zur App per E-Mail verschicken (der Login-Code läuft ausschließlich über E-Mail)
const aktPfad = p2.url().split("?")[0];
await p2.click("button:has-text('Einladung')");
await p2.waitForURL(/mail=/);
ok(/mail=(TEST|GESENDET)/.test(p2.url()), "App-Einladung per E-Mail verschickt");
await p2.goto(aktPfad + "?tab=profil");
ok((await p2.content()).includes("Einladung zur Mitarbeiter-App"), "Einladung steht in der Historie des Mitarbeiters");
await p2.goto(base + "/stundennachweise");
ok((await p2.content()).includes("App-Nutzung"), "App-Nutzungsstatistik im Büro");

// v2.3: persönlicher Empfehlungs-Link und öffentliche Kurzbewerbung
{
  const c3 = await browser.newContext({ viewport: { width: 400, height: 860 } }); const p3 = await c3.newPage();
  if (werbeCode) {
    await p3.goto(base + "/w/" + werbeCode);
    const wl = await p3.content();
    ok(wl.includes("empfiehlt dich"), "Empfehlungs-Link zeigt den Namen des Werbers");
    await p3.fill("input[name=name]", "Lena Freundin");
    await p3.fill("input[name=telefon]", "0660 3333333");
    await p3.check("input[name=einverstanden]");
    await p3.click("button:has-text('Absenden')");
    await p3.waitForURL(/ok=1/);
    ok((await p3.content()).includes("wir melden uns"), "Bewerbung über den Empfehlungs-Link abgeschickt");
  }
  // Allgemeine Kurzbewerbung
  await p3.goto(base + "/bewerben?q=Aushang%20Test");
  await p3.fill("input[name=name]", "Peter Aushang");
  await p3.fill("input[name=telefon]", "0660 4444444");
  await p3.check("input[name=einverstanden]");
  await p3.click("button:has-text('Absenden')");
  await p3.waitForURL(/ok=1/);
  ok(true, "Kurzbewerbung über den QR-Code abgeschickt");
  await c3.close();

  // Büro: beide landen als Bewerber mit Quelle in der Pipeline
  await p2.goto(base + "/personen?bereich=bewerber&q=Freundin");
  const bew1 = await p2.content();
  await p2.goto(base + "/personen?bereich=bewerber&q=Aushang");
  const bew2 = await p2.content();
  ok(bew1.includes("Lena") && bew2.includes("Peter"), "Beide Bewerbungen erscheinen im Bewerber-Pool");
  await p2.goto(base + "/controlling?tab=recruiting");
  ok((await p2.content()).includes("Bewerbungsquellen"), "Bewerbungsquellen im Controlling");
}

await c2.close(); await browser.close();
console.log(fails ? `\n${fails} Prüfungen fehlgeschlagen` : "\nAlle App-Prüfungen bestanden"); process.exit(fails ? 1 : 0);
