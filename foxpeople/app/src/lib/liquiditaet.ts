import { db } from "./db";
import { einstellung } from "./einstellungen";
import { aktuelleSaetze } from "./einstellungen";
import { abgeleiteteSaetze } from "@/engine/kalkulation";

/**
 * Liquiditätsvorschau (8 Wochen): Zahlungseingänge aus offenen Rechnungen (Fälligkeit, überfällige mit Verzögerung),
 * erwartete Rechnungen aus der laufenden Monatsabrechnung (Monatsende + Zahlungsziel), Auszahlungen: Löhne (15.), DG-Abgaben/ÖGK (15. des Folgemonats),
 * Lohnsteuer/DB/DZ/KommSt (15.), Provisionen freigegeben, sonstige Fixkosten (Gemeinkosten ÷ 12 monatlich).
 */
export interface LiquiWoche { von: Date; bis: Date; eingaenge: number; loehne: number; abgaben: number; fixkosten: number; provisionen: number; saldo: number; kumuliert: number; positionen: string[] }
export interface Liquiditaet { kontostand: number; kontostandDatum: Date | null; wochen: LiquiWoche[]; minimum: { betrag: number; woche: Date } | null; hinweise: string[] }

export async function liquiditaet(kostenstelleId?: string, heute = new Date()): Promise<Liquiditaet> {
  const kw = kostenstelleId ? { kostenstelleId } : {};
  const konto = await einstellung<{ betrag: number; datum: string | null }>("kontostand", { betrag: 0, datum: null });
  const start = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  const wochen: LiquiWoche[] = Array.from({ length: 8 }, (_, i) => { const von = new Date(start.getTime() + i * 7 * 86400000); const bis = new Date(von.getTime() + 6 * 86400000 + 86399000); return { von, bis, eingaenge: 0, loehne: 0, abgaben: 0, fixkosten: 0, provisionen: 0, saldo: 0, kumuliert: 0, positionen: [] }; });
  const wocheFuer = (d: Date) => wochen.find((w) => d >= w.von && d <= w.bis) ?? (d < start ? wochen[0] : null);
  const hinweise: string[] = [];

  // Zahlungseingänge: offene Rechnungen
  const rechnungen = await db.rechnung.findMany({ where: { ...kw, status: { in: ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"] } }, include: { kunde: { select: { firmenname: true } } } });
  for (const r of rechnungen) {
    const offen = r.brutto - (r.bezahltBetrag ?? 0);
    if (offen <= 0) continue;
    // überfällige: Annahme Eingang in 14 Tagen (Mahnlauf)
    const erwartet = r.faelligAm < start ? new Date(start.getTime() + 14 * 86400000) : r.faelligAm;
    const w = wocheFuer(erwartet); if (!w) continue;
    w.eingaenge += offen; w.positionen.push(`+ ${r.nummer} ${r.kunde.firmenname} ${Math.round(offen)} €${r.faelligAm < start ? " (überfällig)" : ""}`);
  }
  // erwartete Rechnungen aus laufender Abrechnung (Monatsende + Zahlungsziel)
  const firma = await einstellung<{ zahlungszielTage?: number }>("firma", {});
  const ziel = firma.zahlungszielTage ?? 0;
  const laufend = await db.monatsabrechnung.findMany({ where: { ...kw, status: "OFFEN", rechnungId: null, OR: [{ jahr: heute.getFullYear(), monat: { gte: heute.getMonth() } }, { jahr: heute.getFullYear() + 1 }] }, include: { kunde: { select: { firmenname: true } } } });
  const jeKundeMonat = new Map<string, { betrag: number; datum: Date; kunde: string }>();
  for (const m of laufend) {
    if (!m.verrechnung) continue;
    const key = `${m.kundeId}|${m.jahr}-${m.monat}`;
    const monatsende = new Date(m.jahr, m.monat, 0);
    const datum = new Date(monatsende.getTime() + (ziel + 5) * 86400000); // + Rechnungslauf ca. 5 Tage
    const e = jeKundeMonat.get(key) ?? { betrag: 0, datum, kunde: m.kunde.firmenname };
    e.betrag += m.verrechnung * 1.2; jeKundeMonat.set(key, e);
  }
  for (const e of jeKundeMonat.values()) { const w = wocheFuer(e.datum); if (!w) continue; w.eingaenge += e.betrag; w.positionen.push(`+ erwartete Rechnung ${e.kunde} ${Math.round(e.betrag)} €`); }

  // Auszahlungen: Löhne = letzter abgerechneter Monat (Bruttolöhne) zum 15., Abgaben zum 15. des Folgemonats
  const letzte = await db.monatsabrechnung.findMany({ where: { ...kw, bruttolohn: { not: null } }, orderBy: [{ jahr: "desc" }, { monat: "desc" }], take: 200 });
  const key0 = letzte[0] ? `${letzte[0].jahr}-${letzte[0].monat}` : null;
  const bruttoMonat = letzte.filter((m) => `${m.jahr}-${m.monat}` === key0).reduce((s, m) => s + (m.bruttolohn ?? 0), 0);
  if (!bruttoMonat) hinweise.push("Noch keine Bruttolöhne in der Monatsabrechnung – Lohn- und Abgabenauszahlungen können nicht geschätzt werden.");
  const { saetze } = await aktuelleSaetze(null);
  const a = abgeleiteteSaetze(saetze);
  const dgQuote = a.dgAbgabenGesamt ?? 0.3;
  const netto = bruttoMonat * 0.72; // Nettolohn-Näherung (Auszahlung an Mitarbeiter)
  const dnAbgaben = bruttoMonat - netto; // DN-SV + Lohnsteuer werden mit den DG-Abgaben abgeführt
  for (let m = 0; m < 3; m++) {
    const f15 = new Date(heute.getFullYear(), heute.getMonth() + m, 15);
    const w = wocheFuer(f15); if (!w || f15 < start) continue;
    w.loehne += netto; w.positionen.push(`− Nettolöhne 15.${f15.getMonth() + 1}. ≈ ${Math.round(netto)} €`);
    const abg = bruttoMonat * dgQuote + dnAbgaben;
    w.abgaben += abg; w.positionen.push(`− ÖGK/Lohnabgaben (DG + DN) ≈ ${Math.round(abg)} €`);
  }
  // Fixkosten aus Controlling (Gemeinkosten ÷ 12, zum 1.)
  const kosten = await db.controllingkosten.findFirst({ where: { kostenstelleId: kostenstelleId ?? "" , jahr: { lte: heute.getFullYear() } }, orderBy: { jahr: "desc" } }) ?? await db.controllingkosten.findFirst({ where: { kostenstelleId: "", jahr: { lte: heute.getFullYear() } }, orderBy: { jahr: "desc" } });
  if (kosten) for (let m = 0; m < 3; m++) { const d = new Date(heute.getFullYear(), heute.getMonth() + m + 1, 1); const w = wocheFuer(d); if (!w) continue; w.fixkosten += kosten.gesamtkosten / 12; w.positionen.push(`− Gemeinkosten ≈ ${Math.round(kosten.gesamtkosten / 12)} €`); }
  else hinweise.push("Keine Controlling-Kosten hinterlegt – Gemeinkosten fehlen in der Vorschau.");
  // freigegebene Provisionen (Auszahlung zum Monatsende)
  const prov = await db.provisionsabrechnung.findMany({ where: { status: "FREIGEGEBEN", ...(kostenstelleId ? { kostenstelleId } : {}) }, include: { kostenstelle: { select: { name: true } } } });
  for (const p of prov) { const d = new Date(heute.getFullYear(), heute.getMonth() + 1, 0); const w = wocheFuer(d); if (!w) continue; w.provisionen += p.betrag; w.positionen.push(`− Provision ${p.kostenstelle.name} ${p.monat}/${p.jahr} ${Math.round(p.betrag)} €`); }

  let kum = konto.betrag;
  let minimum: Liquiditaet["minimum"] = null;
  for (const w of wochen) { w.saldo = w.eingaenge - w.loehne - w.abgaben - w.fixkosten - w.provisionen; kum += w.saldo; w.kumuliert = kum; if (!minimum || kum < minimum.betrag) minimum = { betrag: kum, woche: w.von }; }
  if (!konto.datum) hinweise.push("Kontostand nicht hinterlegt – die Vorschau startet bei 0 €.");
  return { kontostand: konto.betrag, kontostandDatum: konto.datum ? new Date(konto.datum) : null, wochen, minimum, hinweise };
}
