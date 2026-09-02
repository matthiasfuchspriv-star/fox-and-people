import type { Session } from "./auth";
import { istZentrale } from "./auth";
import { db } from "./db";

/** Ergebnis-Sicht: Zentrale sieht DB1/DB2, Kostenstellen sehen nur ihre Provision (Anteil am DB2 lt. Provisionsschlüssel der Kostenstelle). */
export type ErgebnisSicht = "DB1" | "PROVISION";
export const ergebnisSicht = (s: Session): ErgebnisSicht => (istZentrale(s) ? "DB1" : "PROVISION");
export const ergebnisLabel = (sicht: ErgebnisSicht) => (sicht === "PROVISION" ? "Provision" : "DB1");

export interface Provisionsschluessel { provisionUeberlassung: number; provisionVermittlung: number }
export type EinsatzArtKey = "UEBERLASSUNG" | "DIREKTVERMITTLUNG";

/** Prozentsatz je Einsatzart (20 % Überlassung, 50 % Direktvermittlung – je Kostenstelle einstellbar). Bleibt intern, wird Kostenstellen nie angezeigt. */
export const provisionPct = (k: Provisionsschluessel, art: EinsatzArtKey) => (art === "DIREKTVERMITTLUNG" ? k.provisionVermittlung : k.provisionUeberlassung);

/** Provision = Prozentsatz × DB2. Ohne hinterlegte Controlling-Kosten (kostenProMa = null) gibt es keine Provision. */
export const provision = (db2: number | null | undefined, k: Provisionsschluessel, art: EinsatzArtKey) => (db2 == null ? null : (db2 * provisionPct(k, art)) / 100);

/** DB2 = DB1 − Kostenumlage je Mitarbeiter (pro Monat). null, solange die Zentrale keine Controlling-Kosten hinterlegt hat. */
export const db2 = (db1: number | null | undefined, kostenProMa: number | null) => (db1 == null || kostenProMa == null ? null : db1 - kostenProMa);

export interface Controllingkosten { jahr: number; kostenstelleId: string; gesamtkosten: number; kostenProMitarbeiterMonat: number; kostenProVermittlung: number | null; notiz: string | null }

/**
 * Controlling-Kosten des Jahres (Zentrale). Reihenfolge: Kostenstellen-spezifisch für das Jahr → Standard ("") für das Jahr →
 * jüngstes früheres Jahr (spezifisch, dann Standard). null = noch nichts hinterlegt → keine Provision.
 */
export async function ladeControllingkosten(jahr: number, kostenstelleId?: string | null): Promise<Controllingkosten | null> {
  const ks = kostenstelleId ?? "";
  if (ks) {
    const spez = await db.controllingkosten.findUnique({ where: { jahr_kostenstelleId: { jahr, kostenstelleId: ks } } });
    if (spez) return spez;
  }
  const std = await db.controllingkosten.findUnique({ where: { jahr_kostenstelleId: { jahr, kostenstelleId: "" } } });
  if (std) return std;
  return db.controllingkosten.findFirst({ where: { jahr: { lt: jahr }, kostenstelleId: { in: ks ? [ks, ""] : [""] } }, orderBy: [{ jahr: "desc" }, { kostenstelleId: "desc" }] });
}

/** Kostenumlage je Mitarbeiter-Monat für eine Einsatzart */
export const umlage = (k: Controllingkosten | null, art: EinsatzArtKey) => (k == null ? null : art === "DIREKTVERMITTLUNG" ? (k.kostenProVermittlung ?? k.kostenProMitarbeiterMonat) : k.kostenProMitarbeiterMonat);
