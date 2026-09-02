/**
 * Erzeugt aus dem Prisma-Schema die PostgreSQL-DDL (Ersatz für `prisma migrate`
 * in Umgebungen ohne Zugriff auf die Prisma-Engine-Binaries).
 * Aufruf: npx tsx scripts/gen-sql.ts > prisma/migrations/0001_init/migration.sql
 */
import { getDMMF } from "@prisma/internals";
import { readFileSync } from "node:fs";

const datamodel = readFileSync("prisma/schema.prisma", "utf8");

const typeMap: Record<string, string> = {
  String: "TEXT",
  Int: "INTEGER",
  Float: "DOUBLE PRECISION",
  Boolean: "BOOLEAN",
  DateTime: "TIMESTAMP(3)",
  Json: "JSONB",
  BigInt: "BIGINT",
  Decimal: "DECIMAL(65,30)",
  Bytes: "BYTEA",
};

function defaultSql(field: any): string {
  const d = field.default;
  if (d === undefined) return "";
  if (typeof d === "object" && d !== null && "name" in d) {
    if (d.name === "now") return " DEFAULT CURRENT_TIMESTAMP";
    if (d.name === "cuid" || d.name === "uuid" || d.name === "autoincrement") return ""; // vom Client gesetzt
    return "";
  }
  if (typeof d === "string") return field.kind === "enum" ? ` DEFAULT '${d}'` : ` DEFAULT '${d.replace(/'/g, "''")}'`;
  if (typeof d === "boolean") return ` DEFAULT ${d ? "true" : "false"}`;
  if (typeof d === "number") return ` DEFAULT ${d}`;
  return "";
}

(async () => {
  const dmmf = await getDMMF({ datamodel });
  const out: string[] = [];
  for (const e of dmmf.datamodel.enums) {
    out.push(`CREATE TYPE "${e.name}" AS ENUM (${e.values.map((v) => `'${v.name}'`).join(", ")});`);
  }
  const fks: string[] = [];
  for (const m of dmmf.datamodel.models) {
    const cols: string[] = [];
    for (const f of m.fields) {
      if (f.kind === "object") continue;
      const t = f.kind === "enum" ? `"${f.type}"` : typeMap[f.type] ?? "TEXT";
      const notNull = f.isRequired ? " NOT NULL" : "";
      cols.push(`  "${f.name}" ${t}${notNull}${defaultSql(f)}`);
    }
    const pk = m.fields.filter((f) => f.isId).map((f) => `"${f.name}"`);
    if (pk.length) cols.push(`  CONSTRAINT "${m.name}_pkey" PRIMARY KEY (${pk.join(", ")})`);
    out.push(`CREATE TABLE "${m.name}" (\n${cols.join(",\n")}\n);`);
    for (const f of m.fields) {
      if (f.isUnique && f.kind !== "object") out.push(`CREATE UNIQUE INDEX "${m.name}_${f.name}_key" ON "${m.name}"("${f.name}");`);
    }
    for (const u of m.uniqueFields) out.push(`CREATE UNIQUE INDEX "${m.name}_${u.join("_")}_key" ON "${m.name}"(${u.map((c) => `"${c}"`).join(", ")});`);
    for (const f of m.fields) {
      if (f.kind === "object" && f.relationFromFields && f.relationFromFields.length) {
        const onDelete = f.relationOnDelete === "Cascade" ? "CASCADE" : f.isRequired ? "RESTRICT" : "SET NULL";
        fks.push(
          `ALTER TABLE "${m.name}" ADD CONSTRAINT "${m.name}_${f.relationFromFields.join("_")}_fkey" FOREIGN KEY (${f.relationFromFields.map((c) => `"${c}"`).join(", ")}) REFERENCES "${f.type}"(${f.relationToFields!.map((c) => `"${c}"`).join(", ")}) ON DELETE ${onDelete} ON UPDATE CASCADE;`,
        );
      }
    }
  }
  // @@index aus dem Schema-Text (DMMF liefert sie nicht in allen Versionen)
  const modelRe = /model (\w+) \{([\s\S]*?)\n\}/g;
  let mm: RegExpExecArray | null;
  while ((mm = modelRe.exec(datamodel))) {
    const idxRe = /@@index\(\[([^\]]+)\]\)/g;
    let im: RegExpExecArray | null;
    while ((im = idxRe.exec(mm[2]))) {
      const cols = im[1].split(",").map((c) => c.trim());
      out.push(`CREATE INDEX "${mm[1]}_${cols.join("_")}_idx" ON "${mm[1]}"(${cols.map((c) => `"${c}"`).join(", ")});`);
    }
  }
  out.push(...fks);
  process.stdout.write(out.join("\n\n") + "\n");
})();
