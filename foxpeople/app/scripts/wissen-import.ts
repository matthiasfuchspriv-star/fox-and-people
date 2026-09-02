// Importiert Wissensdokumente in die Wissensbasis: npx tsx scripts/wissen-import.ts <kategorie> <datei...>
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { wissenImportieren } from "../src/lib/wissen";

const [kategorie, ...dateien] = process.argv.slice(2);
(async () => {
  for (const f of dateien) {
    const name = path.basename(f);
    const vorhanden = await db.wissenDokument.findFirst({ where: { quelle: name } });
    if (vorhanden) { console.log("übersprungen (vorhanden):", name); continue; }
    const r = await wissenImportieren(readFileSync(f), name, "", kategorie, name.replace(/[_-]+/g, " ").replace(/\.\w+$/, ""));
    console.log(name, "→", r.chunks, "Abschnitte,", r.zeichen, "Zeichen");
  }
  await db.$disconnect();
})();
