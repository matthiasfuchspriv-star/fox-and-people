// Erzeugt src/lib/agb-texte.ts aus den Markdown-Vorlagen, damit die AGB-Texte im Build enthalten sind.
import { readFileSync, writeFileSync } from "node:fs";
const esc = (x) => x.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const u = readFileSync("src/vorlagen/agb-ueberlassung.md", "utf8");
const v = readFileSync("src/vorlagen/agb-vermittlung.md", "utf8");
writeFileSync("src/lib/agb-texte.ts", `/**
 * Volltext der AGB – aus src/vorlagen/agb-*.md erzeugt, damit die Texte im Build enthalten sind.
 * Bei Änderungen die Markdown-Datei bearbeiten und \`npm run agb:build\` ausführen.
 */
export const AGB_UEBERLASSUNG_MD = \`${esc(u)}\`;

export const AGB_VERMITTLUNG_MD = \`${esc(v)}\`;
`);
console.log("src/lib/agb-texte.ts geschrieben");
