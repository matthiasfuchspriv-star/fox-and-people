import { db } from "./db";
import { cent } from "./geld";

/**
 * Kostenerfassung je Monat.
 *
 * Warum nicht weiter eine Jahressumme: „Gesamtkosten 120.000 €“ sagt nichts darüber, wofür das Geld
 * weggeht und ob es steigt. Der DB2 – und damit die Provision der Kostenstellen – hängt aber genau
 * daran. Erfasst wird deshalb Position für Position je Monat, getrennt nach Fixkosten (Miete,
 * Software, eigene Löhne) und variablen Kosten (Inserate, Fahrzeuge, Beratung).
 */
export const KOSTENKATEGORIEN = [
  "Personal (eigene Angestellte)", "Miete & Betriebskosten", "Software & IT", "Fahrzeuge",
  "Marketing & Recruiting", "Beratung (Steuer, Recht)", "Versicherungen", "Bank & Gebühren", "Sonstiges",
] as const;

export interface Monatskosten { monat: number; fix: number; variabel: number; summe: number }

/** Alle Kostenpositionen eines Jahres, nach Monat verdichtet. */
export async function kostenJahr(jahr: number, kostenstelleId = ""): Promise<{
  monate: Monatskosten[]; fixJahr: number; variabelJahr: number; summeJahr: number;
  jeKategorie: { kategorie: string; betrag: number }[];
}> {
  const pos = await db.kostenposition.findMany({ where: { jahr, kostenstelleId } });
  const monate: Monatskosten[] = Array.from({ length: 12 }, (_, i) => ({ monat: i + 1, fix: 0, variabel: 0, summe: 0 }));
  const kat = new Map<string, number>();
  for (const p of pos) {
    const m = monate[p.monat - 1];
    if (!m) continue;
    if (p.fix) m.fix = cent(m.fix + p.betrag); else m.variabel = cent(m.variabel + p.betrag);
    m.summe = cent(m.fix + m.variabel);
    kat.set(p.kategorie, cent((kat.get(p.kategorie) ?? 0) + p.betrag));
  }
  const fixJahr = cent(monate.reduce((a, m) => a + m.fix, 0));
  const variabelJahr = cent(monate.reduce((a, m) => a + m.variabel, 0));
  return {
    monate, fixJahr, variabelJahr, summeJahr: cent(fixJahr + variabelJahr),
    jeKategorie: [...kat.entries()].map(([kategorie, betrag]) => ({ kategorie, betrag })).sort((a, b) => b.betrag - a.betrag),
  };
}

/**
 * Fixkosten eines Monats in den nächsten übernehmen.
 *
 * Bewusst nur die Fixkosten und nur, was dort noch nicht steht: Miete und Software sind jeden Monat
 * gleich und sollen nicht zwölfmal getippt werden. Variable Kosten wären als Übernahme eine
 * Erfindung – die entstehen jeden Monat neu.
 */
export async function fixkostenUebernehmen(jahr: number, vonMonat: number, kostenstelleId = ""): Promise<number> {
  const zielMonat = vonMonat === 12 ? 1 : vonMonat + 1;
  const zielJahr = vonMonat === 12 ? jahr + 1 : jahr;
  const quelle = await db.kostenposition.findMany({ where: { jahr, monat: vonMonat, kostenstelleId, fix: true } });
  if (!quelle.length) return 0;
  const vorhanden = new Set((await db.kostenposition.findMany({ where: { jahr: zielJahr, monat: zielMonat, kostenstelleId }, select: { bezeichnung: true } })).map((x) => x.bezeichnung.toLowerCase().trim()));
  const neu = quelle.filter((q) => !vorhanden.has(q.bezeichnung.toLowerCase().trim()));
  if (!neu.length) return 0;
  await db.kostenposition.createMany({
    data: neu.map((q) => ({ kostenstelleId, jahr: zielJahr, monat: zielMonat, bezeichnung: q.bezeichnung, kategorie: q.kategorie, betrag: q.betrag, fix: true, notiz: q.notiz })),
  });
  return neu.length;
}
