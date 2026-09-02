import { db } from "./db";
import { wochenImMonat, arbeitstageKw } from "./wochen";

/**
 * Zeitkonto (Durchrechnung): Saldo = Σ Ist-Stunden (Monatsabrechnung) − Σ Soll-Stunden (Wochenraster X × Arbeitstage × Wochenstunden/5)
 * + manuelle Buchungen (Korrektur, Zeitausgleich, Auszahlung, Übertrag) – innerhalb des Durchrechnungszeitraums der Person.
 */
export interface ZeitkontoMonat { jahr: number; monat: number; soll: number; ist: number; saldo: number }
export interface Zeitkonto {
  start: Date; ende: Date; monate: ZeitkontoMonat[];
  sollGesamt: number; istGesamt: number; buchungen: number; saldo: number;
  tageBisEnde: number;
}

export async function zeitkonto(personId: string, heute = new Date()): Promise<Zeitkonto | null> {
  const p = await db.person.findUnique({ where: { id: personId }, select: { wochenstunden: true, eintrittsdatum: true, durchrechnungStart: true, durchrechnungMonate: true } });
  if (!p) return null;
  const start = p.durchrechnungStart ?? p.eintrittsdatum ?? new Date(heute.getFullYear(), 0, 1);
  const ende = new Date(start.getFullYear(), start.getMonth() + p.durchrechnungMonate, 0);
  const wstd = p.wochenstunden ?? 38.5;
  // Nur ABGERECHNETE Monate: Das Zeitkonto zeigt erst, was HQ freigegeben und fakturiert hat –
  // nicht offene Zwischenstände (Entscheidung Matthias, 30.08.2026). Überstunden zählen zum Ist.
  const abrechnungen = await db.monatsabrechnung.findMany({ where: { personId, status: "ABGERECHNET" }, select: { jahr: true, monat: true, stunden: true, ueberstunden50: true, ueberstunden100: true } });
  const buch = await db.zeitbuchung.findMany({ where: { personId, datum: { gte: start, lte: ende } } });
  const monate: ZeitkontoMonat[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const bisMonat = new Date(Math.min(ende.getTime(), heute.getTime()));
  while (cur <= bisMonat) {
    const jahr = cur.getFullYear(), monat = cur.getMonth() + 1;
    const wochen = wochenImMonat(jahr, monat);
    const status = await db.wochenstatus.findMany({ where: { personId, OR: wochen.map((w) => ({ jahr: w.jahr, kw: w.kw })) } });
    let soll = 0;
    for (const st of status) { if (st.status !== "X") continue; const w = wochen.find((x) => x.jahr === st.jahr && x.kw === st.kw)!; soll += arbeitstageKw(w.jahr, w.kw, { jahr, monat }) * (wstd / 5); }
    const ist = abrechnungen.filter((a) => a.jahr === jahr && a.monat === monat).reduce((s, a) => s + (a.stunden ?? 0) + (a.ueberstunden50 ?? 0) + (a.ueberstunden100 ?? 0), 0);
    monate.push({ jahr, monat, soll: Math.round(soll * 10) / 10, ist, saldo: Math.round((ist - soll) * 10) / 10 });
    cur.setMonth(cur.getMonth() + 1);
  }
  const sollGesamt = monate.reduce((s, m) => s + m.soll, 0);
  const istGesamt = monate.reduce((s, m) => s + m.ist, 0);
  const buchungen = buch.reduce((s, b) => s + b.stunden, 0);
  return { start, ende, monate, sollGesamt, istGesamt, buchungen, saldo: Math.round((istGesamt - sollGesamt + buchungen) * 10) / 10, tageBisEnde: Math.ceil((ende.getTime() - heute.getTime()) / 86400000) };
}
