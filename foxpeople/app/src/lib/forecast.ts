import { db } from "./db";
import { ueberlassung } from "@/engine/kalkulation";
import { aktuelleSaetze } from "./einstellungen";
import type { Controlling } from "./controlling";

/**
 * Plan/Ist und Hochrechnung: Ist = Monatsabrechnung bis zum letzten abgerechneten Monat,
 * Forecast = Ist + laufende Einsätze (Wochenstunden × Auslastung × 4,33 × Verrechnungssatz bzw. Kalkulation) für die restlichen Monate.
 */
export interface Forecast {
  plan: { zielUmsatz: number; zielDb1: number; zielMitarbeiter: number } | null;
  istUmsatz: number; istDb1: number; abgerechnetBisMonat: number;
  forecastUmsatz: number; forecastDb1: number;
  offeneMonate: number;
  laufendeEinsaetze: number;
  umsatzJeMonatOffen: number; db1JeMonatOffen: number;
  zielerreichungUmsatz: number | null; zielerreichungDb1: number | null;
}

export async function forecast(jahr: number, c: Controlling, kostenstelleId?: string, heute = new Date()): Promise<Forecast> {
  const plan = await db.planwert.findUnique({ where: { jahr_kostenstelleId: { jahr, kostenstelleId: kostenstelleId ?? "" } } });
  const letzterMonat = Math.max(0, ...c.monatsreihe.filter((m) => m.umsatz || m.selbstkosten).map((m) => m.monat));
  const istUmsatz = c.gesamt.umsatz, istDb1 = c.gesamt.db1;
  const offeneMonate = jahr < heute.getFullYear() ? 0 : jahr > heute.getFullYear() ? 12 : Math.max(0, 12 - Math.max(letzterMonat, heute.getMonth()));
  const einsaetze = await db.einsatz.findMany({ where: { ...(kostenstelleId ? { kostenstelleId } : {}), status: { in: ["AKTIV", "GEPLANT"] }, art: "UEBERLASSUNG", OR: [{ bis: null }, { bis: { gte: heute } }] }, include: { kostenstelle: { select: { bundesland: true } } } });
  let uMonat = 0, dMonat = 0;
  for (const e of einsaetze) {
    if (!e.verrechnungssatz) continue;
    const std = (e.wochenstunden * 4.33 * e.auslastung) / 100;
    uMonat += std * e.verrechnungssatz;
    if (e.stundenlohn) { const { saetze } = await aktuelleSaetze(e.kostenstelle.bundesland); const k = ueberlassung(e.stundenlohn, saetze, e.verrechnungssatz, std); dMonat += k.db1ProMonat ?? 0; }
    else dMonat += std * e.verrechnungssatz * 0.15; // ohne Lohnangabe: konservative 15 % DB1
  }
  const forecastUmsatz = istUmsatz + uMonat * offeneMonate;
  const forecastDb1 = istDb1 + dMonat * offeneMonate;
  return {
    plan: plan ? { zielUmsatz: plan.zielUmsatz, zielDb1: plan.zielDb1, zielMitarbeiter: plan.zielMitarbeiter } : null,
    istUmsatz, istDb1, abgerechnetBisMonat: letzterMonat, forecastUmsatz, forecastDb1, offeneMonate, laufendeEinsaetze: einsaetze.length,
    umsatzJeMonatOffen: uMonat, db1JeMonatOffen: dMonat,
    zielerreichungUmsatz: plan?.zielUmsatz ? forecastUmsatz / plan.zielUmsatz : null,
    zielerreichungDb1: plan?.zielDb1 ? forecastDb1 / plan.zielDb1 : null,
  };
}
