import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/muster", { recursive: true });
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(base + "/app/login");
await p.fill("input[name=eingabe]", process.env.APP_DEMO_MAIL ?? "thomas.berger@example.at");
await p.click("button:has-text('Code anfordern')");
await p.waitForURL(/schritt=code/);
const html = await p.content();
const m = html.match(/dein Code ist <b[^>]*>(\d{6})/);
if (!m) { console.log("kein Testcode gefunden"); console.log(html.slice(0, 800)); process.exit(1); }
await p.fill("input[name=code]", m[1]);
await p.click("button:has-text('Anmelden')");
await p.waitForURL((u) => !u.pathname.includes("/login"));
const seiten = [["/app", "app-10-start"], ["/app/einsatz", "app-11-einsatz"], ["/app/stunden", "app-12-stunden-azg"], ["/app/lohn", "app-13-lohn"], ["/app/weg", "app-14-weg"], ["/app/empfehlen", "app-15-empfehlen"], ["/app/abwesenheit", "app-16-urlaub"], ["/app/checkliste", "app-17-checkliste"], ["/app/profil", "app-18-profil"]];
for (const [url, datei] of seiten) { await p.goto(base + url); await p.waitForTimeout(700); await p.screenshot({ path: `/tmp/muster/${datei}.png`, fullPage: true }); console.log("ok", datei); }
// Öffentliche Bewerbungsstrecke (ohne Login)
const c2 = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
const q = await c2.newPage();
await q.goto(base + "/bewerben"); await q.waitForTimeout(500);
await q.screenshot({ path: "/tmp/muster/app-19-kurzbewerbung.png", fullPage: true }); console.log("ok app-19-kurzbewerbung");
await b.close();
