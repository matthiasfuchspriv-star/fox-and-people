/**
 * Notfall: Passwort eines Nutzers zurücksetzen (am Server ausführen).
 *
 *   docker compose exec app npx tsx scripts/passwort-reset.ts zentrale@foxandpeople.at
 *
 * Das erzeugte Einmalpasswort steht danach auf dem Bildschirm. Es gehört nirgendwo sonst hin – nicht
 * in einen Chat, nicht in eine E-Mail. Nach dem Anmelden sofort ein eigenes Passwort setzen.
 *
 * Alles läuft in `main()`. Ohne diese Klammer stünde `await` auf der obersten Ebene der Datei, und
 * genau daran ist das Skript im Container gescheitert ("Top-level await is currently not supported
 * with the cjs output format") – ausgerechnet das Werkzeug, das gebraucht wird, wenn sonst nichts
 * mehr geht.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    const alle = await db.nutzer.findMany({ select: { email: true, rolle: true, aktiv: true }, orderBy: { email: "asc" } });
    console.error("Aufruf: npx tsx scripts/passwort-reset.ts <email>\n\nVorhandene Zugänge:");
    for (const n of alle) console.error(`  ${n.email}  (${n.rolle}${n.aktiv ? "" : ", gesperrt"})`);
    process.exit(1);
  }
  const n = await db.nutzer.findUnique({ where: { email } });
  if (!n) { console.error(`Kein Nutzer mit ${email}`); process.exit(1); }
  const pw = randomBytes(9).toString("base64url");
  await db.nutzer.update({ where: { id: n.id }, data: { passwortHash: await hashPassword(pw), fehlversuche: 0, gesperrtBis: null, totpSecret: null } });
  console.log(`\nNeues Einmalpasswort für ${email}:\n\n    ${pw}\n`);
  console.log("Damit anmelden, dann sofort in den Einstellungen ein eigenes Passwort setzen.");
  console.log("Der zweite Faktor wurde zurückgesetzt und muss neu eingerichtet werden.");
  console.log("Dieses Passwort gehört in keinen Chat und in keine E-Mail.\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
