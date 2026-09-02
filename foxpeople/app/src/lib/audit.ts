import { db } from "./db";
import { clientIp, type Session } from "./auth";

export type AuditAktion = "VIEW_SENSITIVE" | "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "SEND" | "IMPORT" | "STATUS";

export async function audit(
  s: Session | null,
  aktion: AuditAktion,
  entitaet: string,
  datensatzId?: string | null,
  beschreibung?: string,
  diff?: unknown,
  kostenstelleId?: string | null,
) {
  try {
    await db.auditLog.create({
      data: {
        nutzerId: s?.nutzerId ?? null,
        nutzerName: s?.name ?? "System",
        aktion,
        entitaet,
        datensatzId: datensatzId ?? null,
        beschreibung,
        diff: diff === undefined ? undefined : (JSON.parse(JSON.stringify(diff)) as object),
        ip: s ? await clientIp() : null,
        kostenstelleId: kostenstelleId ?? null,
      },
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}

/** Kompakter Vorher/Nachher-Diff für UPDATE-Einträge (nur geänderte Felder) */
export function diffOf<T extends Record<string, unknown>>(vorher: T, nachher: Partial<T>, ausblenden: string[] = ["svnrEnc", "passwortHash", "totpSecret"]) {
  const out: Record<string, { vorher: unknown; nachher: unknown }> = {};
  for (const k of Object.keys(nachher)) {
    if (ausblenden.includes(k)) continue;
    const a = vorher[k];
    const b = nachher[k];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) out[k] = { vorher: norm(a), nachher: norm(b) };
  }
  return Object.keys(out).length ? out : undefined;
}
