// Wendet die SQL-Migrationen aus prisma/migrations der Reihe nach an (ohne Prisma-Engine-Binaries).
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS "_migrationen" (name TEXT PRIMARY KEY, angewendet TIMESTAMP DEFAULT now())`);
const done = new Set((await client.query(`SELECT name FROM "_migrationen"`)).rows.map((r) => r.name));
const dir = path.resolve("prisma/migrations");
for (const d of readdirSync(dir).filter((x) => /^\d{4}_/.test(x)).sort()) {
  if (done.has(d)) continue;
  const sql = readFileSync(path.join(dir, d, "migration.sql"), "utf8");
  console.log("Migration", d);
  await client.query("BEGIN");
  try { await client.query(sql); await client.query(`INSERT INTO "_migrationen"(name) VALUES ($1)`, [d]); await client.query("COMMIT"); }
  catch (e) { await client.query("ROLLBACK"); console.error("Migration fehlgeschlagen:", d, e.message); process.exit(1); }
}
await client.end();
console.log("Datenbank aktuell.");
