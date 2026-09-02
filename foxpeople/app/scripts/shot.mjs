// Screenshot-Verifikation: node scripts/shot.mjs <email> <pfad>[,<pfad>...] [breite]
import { chromium } from "playwright";
const [,, email = "zentrale@foxandpeople.at", paths = "/", width = "1440"] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/login");
await page.fill('input[name=email]', email);
await page.fill('input[name=passwort]', process.env.SEED_PASSWORD ?? "FoxPeople2026!");
await page.click('button[type=submit], form button');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
for (const p of paths.split(",")) {
  await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const name = (p === "/" ? "dashboard" : p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")) + (width !== "1440" ? "-" + width : "");
  await page.screenshot({ path: `/home/claude/foxpeople/shots/${name}.png`, fullPage: true });
  console.log("shot", name, page.url());
}
await browser.close();
