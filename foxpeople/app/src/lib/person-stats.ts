import type { Abwesenheit } from "@/generated/prisma/client";

/** Krankenstandstage der letzten 365 Tage (anteilig, wenn ein Krankenstand in den Zeitraum hineinragt) */
export function kranktage365(abw: Pick<Abwesenheit, "typ" | "von" | "bis" | "tage">[], heute = new Date()): number {
  const start = new Date(heute.getTime() - 365 * 86400000);
  let sum = 0;
  for (const a of abw) {
    if (a.typ !== "KRANKENSTAND") continue;
    if (a.bis < start || a.von > heute) continue;
    const von = a.von < start ? start : a.von; const bis = a.bis > heute ? heute : a.bis;
    const gesamt = Math.max(1, Math.round((a.bis.getTime() - a.von.getTime()) / 86400000) + 1);
    const teil = Math.max(1, Math.round((bis.getTime() - von.getTime()) / 86400000) + 1);
    sum += a.tage * (teil / gesamt);
  }
  return Math.round(sum * 10) / 10;
}
export const alter = (geb: Date | null | undefined, heute = new Date()) => geb ? Math.floor((heute.getTime() - new Date(geb).getTime()) / (365.25 * 86400000)) : null;
