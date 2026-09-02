import { db } from "./db";
import { controlling } from "./controlling";
import { kostenJahr } from "./kosten";
import { cent } from "./geld";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Monatlicher Provisionsbeleg je Kostenstelle: Snapshot der Provision aus dem Controlling (Prozentsatz × DB2 des Monats).
 * Entwurf → Freigabe durch Zentrale → ausbezahlt. Kostenstellen sehen nur freigegebene/ausbezahlte Belege.
 */
export interface BelegZeile { name: string; kunde: string; art: string; verrechnung: number; db2: number; provision: number }

export async function provisionsbelegErzeugen(kostenstelleId: string, jahr: number, monat: number) {
  const c = await controlling(jahr, kostenstelleId);
  // Grundlage für die Kostenumlage: entweder der Handsatz je Mitarbeiter (Controlling-Kosten) ODER die
  // monatlich erfassten Kostenpositionen – das Controlling rechnet mit beiden Wegen, der Beleg darf
  // deshalb nicht am fehlenden Handsatz scheitern, wenn echte Kosten erfasst sind.
  const positionen = await kostenJahr(jahr, kostenstelleId).catch(() => null);
  if (!c.kosten && !(positionen && positionen.summeJahr > 0)) return { ok: false as const, fehler: "Keine Controlling-Kosten hinterlegt (weder Satz je Mitarbeiter noch erfasste Kostenpositionen) – DB2 und Provision können nicht berechnet werden." };
  const zeilen: BelegZeile[] = c.mitarbeiter.map((m) => { const x = m.monate[monat - 1]; return { name: m.name, kunde: m.kunde, art: m.art === "DIREKTVERMITTLUNG" ? "Vermittlung" : "Überlassung", verrechnung: x.verrechnung, db2: x.db2, provision: x.provision }; }).filter((z) => z.verrechnung || z.db2);
  const sum = (f: (z: BelegZeile) => number) => cent(zeilen.reduce((s, z) => s + f(z), 0));
  const data = {
    verrechnung: sum((z) => z.verrechnung), db2: sum((z) => z.db2),
    provisionUeberlassung: sum((z) => (z.art === "Überlassung" ? z.provision : 0)), provisionVermittlung: sum((z) => (z.art === "Vermittlung" ? z.provision : 0)),
    betrag: sum((z) => z.provision), detail: zeilen as unknown as Prisma.InputJsonValue,
  };
  const vorhanden = await db.provisionsabrechnung.findUnique({ where: { kostenstelleId_jahr_monat: { kostenstelleId, jahr, monat } } });
  if (vorhanden && vorhanden.status !== "ENTWURF") return { ok: false as const, fehler: `Beleg ${monat}/${jahr} ist bereits ${vorhanden.status === "FREIGEGEBEN" ? "freigegeben" : "ausbezahlt"} und wird nicht neu berechnet.` };
  const b = await db.provisionsabrechnung.upsert({ where: { kostenstelleId_jahr_monat: { kostenstelleId, jahr, monat } }, update: data, create: { kostenstelleId, jahr, monat, ...data } });
  return { ok: true as const, beleg: b };
}

export function provisionsbelegText(b: { jahr: number; monat: number; verrechnung: number; db2: number; provisionUeberlassung: number; provisionVermittlung: number; betrag: number; detail: unknown; status: string; freigegebenVon: string | null; freigegebenAm: Date | null; kostenstelle: { name: string } }) {
  const eur = (n: number) => new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(n);
  const zeilen = (b.detail as BelegZeile[]) ?? [];
  const MON = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  let t = `# Provisionsabrechnung ${MON[b.monat - 1]} ${b.jahr}\n\n**Kostenstelle:** ${b.kostenstelle.name}\n**Status:** ${b.status === "ENTWURF" ? "Entwurf – noch nicht freigegeben" : b.status === "FREIGEGEBEN" ? `freigegeben am ${b.freigegebenAm?.toLocaleDateString("de-AT")} durch ${b.freigegebenVon}` : "ausbezahlt"}\n\n## Zusammenfassung\n\n| Position | Betrag |\n|---|---|\n| Verrechnung an Kunden (netto) | ${eur(b.verrechnung)} |\n| Provisionsbasis (Deckungsbeitrag nach Kostenumlage) | ${eur(b.db2)} |\n| Provision Überlassung | ${eur(b.provisionUeberlassung)} |\n| Provision Direktvermittlung | ${eur(b.provisionVermittlung)} |\n| **Provision gesamt** | **${eur(b.betrag)}** |\n\n## Einzelpositionen\n\n| Mitarbeiter | Kunde | Art | Verrechnung | Provision |\n|---|---|---|---|---|\n`;
  for (const z of zeilen) t += `| ${z.name} | ${z.kunde} | ${z.art} | ${eur(z.verrechnung)} | ${eur(z.provision)} |\n`;
  t += `\nDie Provision wird nach dem hinterlegten Provisionsschlüssel der Kostenstelle aus dem Deckungsbeitrag nach Kostenumlage berechnet. Nachträgliche Korrekturen von Bruttolöhnen oder Verrechnungen werden im Folgemonat berücksichtigt.\n`;
  return t;
}
