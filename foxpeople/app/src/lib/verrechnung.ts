import { db } from "./db";
import { zulagenProStunde, zulageEinzelpreisVerkauf, zulageEinheit, type EinsatzZulage } from "./zulagen";
import { cent } from "./geld";

/**
 * Monatsverrechnung je Einsatz aufgeschlüsselt: Normalstunden, 50 %-Überstunden, 100 %-Überstunden und weiterverrechnete
 * Zulagen – jede Zeile wird eine eigene Rechnungsposition. Zuschläge kommen aus der Kundenkondition der Rolle
 * (Standard +35 % / +70 % auf den Verrechnungssatz).
 *
 * Zulagen werden NICHT mehr pauschal auf alle Stunden gerechnet: Je Zulage zählt die tatsächliche
 * Menge lt. Stundenzettel (Stunden; beim Taggeld/Kilometergeld Tage), erfasst in der Monatsabrechnung
 * (`zulagenMengen`). Ohne erfasste Menge wird die Zulage nicht verrechnet – vorher wurde z. B. die
 * Schichtzulage automatisch für sämtliche Stunden angenommen, auch wenn nur ein Teil in der Schicht lag.
 */
export interface VerrechnungAufschluesselung {
  satz: number;
  zuschlag50: number; zuschlag100: number; // Anteil, z. B. 0.35
  zeilen: { typ: "NORMAL" | "UE50" | "UE100" | "ZULAGE"; beschreibung: string; menge: number; einheit: string; einzelpreis: number; betrag: number }[];
  summe: number;
  zulagenProStd: number;
  /** Zulagen des Einsatzes, die weiterverrechnet würden – fürs Formular (Mengeneingabe) */
  zulagen: { kuerzel: string; name: string; einheit: string; einzelpreis: number }[];
  /** true = der Einsatz hat weiterverrechenbare Zulagen, aber es ist keine Menge erfasst */
  zulagenOhneMenge: boolean;
}

/** Kundenkondition zur Rolle: nur exakte Rollen-Übereinstimmung und nur im Gültigkeitszeitraum – sonst Standard 35/70. */
export function konditionFuerRolle<T extends { rolle: string; gultigVon?: Date | null; gultigBis?: Date | null }>(konditionen: T[], rolle: string, am = new Date()): T | undefined {
  return konditionen.find((k) => k.rolle.toLowerCase() === rolle.toLowerCase()
    && (!k.gultigVon || k.gultigVon <= am) && (!k.gultigBis || k.gultigBis >= am));
}

/** Zulagen-Mengen aus dem Json-Feld der Monatsabrechnung lesen (defensiv – fremde Werte ignorieren). */
export function zulagenMengenLesen(roh: unknown): Record<string, number> {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (typeof v === "number" && isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export async function verrechnungAufschluesseln(einsatzId: string, w: { stunden?: number | null; ueberstunden50?: number | null; ueberstunden100?: number | null; zulagenMengen?: unknown }): Promise<VerrechnungAufschluesselung | null> {
  const e = await db.einsatz.findUnique({ where: { id: einsatzId }, include: { kunde: { include: { konditionen: true } } } });
  if (!e || e.art === "DIREKTVERMITTLUNG" || !e.verrechnungssatz) return null;
  // Keine stille Übernahme einer fremden Rolle mehr: Passt keine Kondition exakt (inkl. Gültigkeitszeitraum),
  // gelten die Standard-Zuschläge 35/70 – nicht die Zuschläge irgendeiner anderen Rolle des Kunden.
  const kond = konditionFuerRolle(e.kunde.konditionen, e.rolleImEinsatz);
  const zuschlag50 = kond?.ueberstundenZuschlag ?? 0.35, zuschlag100 = kond?.wochenendZuschlag ?? 0.7;
  const satz = e.verrechnungssatz;
  const zul = ((e.zulagen as unknown as EinsatzZulage[] | null) ?? []).filter((z) => z.weiterverrechnen);
  const zulagenProStd = zulagenProStunde(zul, e.stundenlohn).weiter;
  const r2 = cent; // eine Rundungsfunktion für alle Geldbeträge (siehe lib/geld.ts)
  const normal = w.stunden ?? 0, u50 = w.ueberstunden50 ?? 0, u100 = w.ueberstunden100 ?? 0;
  const mengen = zulagenMengenLesen(w.zulagenMengen);
  const zeilen: VerrechnungAufschluesselung["zeilen"] = [];
  if (normal > 0) zeilen.push({ typ: "NORMAL", beschreibung: "Normalstunden", menge: normal, einheit: "Std.", einzelpreis: satz, betrag: r2(normal * satz) });
  // Betrag = Menge × GERUNDETER Einzelpreis: exakt die Rechnung, die später auf dem Papier steht.
  // Mit dem ungerundeten Preis gerechnet wichen Monatsabrechnung (DB1) und Rechnungsposition um Cents ab.
  const p50 = r2(satz * (1 + zuschlag50)), p100 = r2(satz * (1 + zuschlag100));
  if (u50 > 0) zeilen.push({ typ: "UE50", beschreibung: `Überstunden 50 % (Zuschlag ${Math.round(zuschlag50 * 100)} %)`, menge: u50, einheit: "Std.", einzelpreis: p50, betrag: r2(u50 * p50) });
  if (u100 > 0) zeilen.push({ typ: "UE100", beschreibung: `Überstunden 100 % (Zuschlag ${Math.round(zuschlag100 * 100)} %)`, menge: u100, einheit: "Std.", einzelpreis: p100, betrag: r2(u100 * p100) });
  const gesamtStd = normal + u50 + u100;
  let mengeErfasst = false;
  const zulagenInfo: VerrechnungAufschluesselung["zulagen"] = [];
  for (const z of zul) {
    const einzelpreis = zulageEinzelpreisVerkauf(z, e.stundenlohn);
    zulagenInfo.push({ kuerzel: z.kuerzel, name: z.name, einheit: zulageEinheit(z), einzelpreis: r2(einzelpreis) });
    const menge = mengen[z.kuerzel] ?? 0;
    if (menge > 0) mengeErfasst = true;
    const ep = r2(einzelpreis);
    if (menge > 0 && ep > 0) zeilen.push({ typ: "ZULAGE", beschreibung: z.name, menge, einheit: zulageEinheit(z), einzelpreis: ep, betrag: r2(menge * ep) });
  }
  return {
    satz, zuschlag50, zuschlag100, zeilen,
    summe: r2(zeilen.reduce((a, z) => a + z.betrag, 0)),
    zulagenProStd,
    zulagen: zulagenInfo,
    zulagenOhneMenge: zul.length > 0 && gesamtStd > 0 && !mengeErfasst,
  };
}
