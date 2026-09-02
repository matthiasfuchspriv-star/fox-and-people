import { db } from "./db";
import { ueberlassung } from "@/engine/kalkulation";
import { aktuelleSaetze } from "./einstellungen";
import { zulagenProStunde, type EinsatzZulage } from "./zulagen";

/**
 * Betriebswirtschaftliche Kennzahlen für das HQ: Deckungsbeitrag je Einsatz mit Ampel, Fehlzeitenquote und
 * Krankenstandskosten je Kunde, Wiedereinsatzquote, Time-to-Fill.
 *
 * Ampel für den Deckungsbeitrag je Stunde (Anteil am Verrechnungssatz):
 *   grün  ≥ 18 %   – trägt Struktur und Provision
 *   gelb  ≥ 10 %   – knapp, Satz bei nächster Gelegenheit anheben
 *   rot   < 10 %   – zu wenig; unter 0 % Verlustgeschäft
 */
export const AMPEL_GRUEN = 0.18;
export const AMPEL_GELB = 0.10;
export type Ampel = "gruen" | "gelb" | "rot";

export function ampel(marge: number | null): Ampel {
  if (marge == null) return "rot";
  return marge >= AMPEL_GRUEN ? "gruen" : marge >= AMPEL_GELB ? "gelb" : "rot";
}

export interface EinsatzDb {
  einsatzId: string;
  stundenlohn: number | null;
  zulagenProStd: number;
  verrechnungssatz: number | null;
  selbstkostenProStd: number;
  db1ProStd: number | null;
  marge: number | null;
  ampel: Ampel;
  stundenMonat: number;
  db1Monat: number | null;
  hinweise: string[];
}

/** Deckungsbeitrag eines Einsatzes – live aus Stundenlohn, Zulagen, Verrechnungssatz und den Abgabensätzen. */
export async function einsatzDb(einsatzId: string, am = new Date()): Promise<EinsatzDb | null> {
  const e = await db.einsatz.findUnique({ where: { id: einsatzId }, include: { kunde: true } });
  if (!e) return null;
  const { saetze } = await aktuelleSaetze(e.kostenstelleId, am);
  const zul = ((e.zulagen as unknown as EinsatzZulage[] | null) ?? []);
  const z = zulagenProStunde(zul, e.stundenlohn ?? 0);
  const lohnBasis = (e.stundenlohn ?? 0) + z.lohn;
  const r = ueberlassung(lohnBasis, saetze, e.verrechnungssatz ?? null, null);
  // weiterverrechnete Zulagen erhöhen auch den Erlös
  const erloes = e.verrechnungssatz != null ? e.verrechnungssatz + z.weiter : null;
  const db1 = erloes == null ? null : erloes - r.kalkulationProStunde;
  const marge = db1 == null || !erloes ? null : db1 / erloes;
  const stunden = Math.round(((e.wochenstunden || 38.5) * (e.auslastung || 100) / 100) * 13 / 3 * 10) / 10;
  const hinweise: string[] = [];
  if (e.verrechnungssatz == null) hinweise.push("Kein Verrechnungssatz hinterlegt – Angebot verknüpfen.");
  if (e.stundenlohn == null) hinweise.push("Kein Stundenlohn hinterlegt.");
  if (e.referenzzuschlag) hinweise.push(`Referenzzuschlag ${e.referenzzuschlag.toFixed(2)} €/Std ist im Lohn zu berücksichtigen.`);
  if (marge != null && marge < 0) hinweise.push("Der Einsatz ist ein Verlustgeschäft – Satz nachverhandeln oder beenden.");
  else if (marge != null && marge < AMPEL_GELB) hinweise.push("Deckungsbeitrag unter 10 % – Satz bei nächster Gelegenheit anheben.");
  return {
    einsatzId, stundenlohn: e.stundenlohn, zulagenProStd: z.lohn, verrechnungssatz: e.verrechnungssatz,
    selbstkostenProStd: Math.round(r.kalkulationProStunde * 100) / 100,
    db1ProStd: db1 == null ? null : Math.round(db1 * 100) / 100,
    marge, ampel: ampel(marge),
    stundenMonat: stunden,
    db1Monat: db1 == null ? null : Math.round(db1 * stunden * 100) / 100,
    hinweise,
  };
}

/** Mehrere Einsätze auf einmal (Liste im HQ). */
export async function einsatzDbListe(ids: string[]): Promise<Map<string, EinsatzDb>> {
  const out = new Map<string, EinsatzDb>();
  for (const id of ids) { const r = await einsatzDb(id); if (r) out.set(id, r); }
  return out;
}

export interface KundenFehlzeiten {
  kundeId: string; kunde: string;
  sollTage: number; krankTage: number; urlaubTage: number; sonstigeTage: number;
  quote: number;          // Krankenstandstage / Solltage
  kostenKrankenstand: number; // Entgeltfortzahlung (Bruttolohn × Stunden) ohne Erlös
  entgangenerUmsatz: number;
  mitarbeiter: number;
}

/**
 * Fehlzeitenquote und Krankenstandskosten je Kunde. Grundlage sind das Tagesraster der Einsatzplanung
 * (X arbeitet, K krank, U Urlaub, Z Zeitausgleich) und die Stundenlöhne bzw. Verrechnungssätze der Einsätze.
 * Krankenstand kostet doppelt: Entgeltfortzahlung an den Mitarbeiter und entgangener Umsatz beim Kunden.
 */
export async function fehlzeitenJeKunde(jahr: number, kostenstelleId?: string | null): Promise<KundenFehlzeiten[]> {
  const ws = await db.wochenstatus.findMany({
    where: { jahr, einsatzId: { not: null } },
    include: { person: { select: { id: true, stundenlohn: true, kostenstelleId: true, wochenstunden: true } } },
  });
  const einsaetze = await db.einsatz.findMany({
    where: { id: { in: [...new Set(ws.map((w) => w.einsatzId!))] }, ...(kostenstelleId ? { kostenstelleId } : {}) },
    include: { kunde: { select: { id: true, firmenname: true } } },
  });
  const eMap = new Map(einsaetze.map((e) => [e.id, e]));
  const agg = new Map<string, KundenFehlzeiten & { _personen: Set<string> }>();
  for (const w of ws) {
    const e = eMap.get(w.einsatzId!); if (!e) continue;
    const key = e.kundeId;
    if (!agg.has(key)) agg.set(key, { kundeId: key, kunde: e.kunde.firmenname, sollTage: 0, krankTage: 0, urlaubTage: 0, sonstigeTage: 0, quote: 0, kostenKrankenstand: 0, entgangenerUmsatz: 0, mitarbeiter: 0, _personen: new Set() });
    const a = agg.get(key)!;
    a._personen.add(w.personId);
    const tage = (w.tage && w.tage.length === 7 ? w.tage.split("") : [w.status, w.status, w.status, w.status, w.status, "-", "-"]);
    const stdProTag = ((e.wochenstunden || w.person.wochenstunden || 38.5) / 5);
    for (const t of tage) {
      if (t === "X") a.sollTage++;
      else if (t === "K") { a.sollTage++; a.krankTage++; a.kostenKrankenstand += (w.person.stundenlohn ?? 0) * stdProTag * 1.3; a.entgangenerUmsatz += (e.verrechnungssatz ?? 0) * stdProTag; }
      else if (t === "U") { a.sollTage++; a.urlaubTage++; }
      else if (t === "Z") { a.sollTage++; a.sonstigeTage++; }
    }
  }
  return [...agg.values()].map((a) => ({
    ...a,
    mitarbeiter: a._personen.size,
    quote: a.sollTage ? Math.round((a.krankTage / a.sollTage) * 10000) / 10000 : 0,
    kostenKrankenstand: Math.round(a.kostenKrankenstand * 100) / 100,
    entgangenerUmsatz: Math.round(a.entgangenerUmsatz * 100) / 100,
  })).sort((x, y) => y.quote - x.quote);
}

export interface RecruitingKennzahlen {
  timeToFillTage: number | null;       // Median Anfrage → Einsatzbeginn
  timeToFillAnzahl: number;
  wiedereinsatzQuote: number;          // Anteil Mitarbeiter mit mehr als einem Einsatz
  wiedereinsatzAnzahl: number;
  mitarbeiterGesamt: number;
  quellen: { quelle: string; bewerber: number; eingestellt: number; quote: number }[];
  absagegruende: { grund: string; anzahl: number }[];
  stufen: { stufe: string; anzahl: number }[];
  talentpool: number;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10; };

/** Recruiting- und Bindungskennzahlen: Time-to-Fill, Wiedereinsatzquote, Bewerbungsquellen, Absagegründe. */
export async function recruitingKennzahlen(kostenstelleId?: string | null): Promise<RecruitingKennzahlen> {
  const wo = kostenstelleId ? { kostenstelleId } : {};
  const [einsaetze, personen] = await Promise.all([
    db.einsatz.findMany({ where: wo, select: { personId: true, von: true, angefragtAm: true, besetztAm: true } }),
    db.person.findMany({ where: wo, select: { id: true, status: true, quelle: true, pipelineStufe: true, absagegrund: true, talentpool: true } }),
  ]);
  const ttf = einsaetze.filter((e) => e.angefragtAm).map((e) => Math.max(0, Math.round((e.von.getTime() - e.angefragtAm!.getTime()) / 86400000)));
  const proPerson = new Map<string, number>();
  for (const e of einsaetze) proPerson.set(e.personId, (proPerson.get(e.personId) ?? 0) + 1);
  const mitMehreren = [...proPerson.values()].filter((n) => n > 1).length;

  const quellenMap = new Map<string, { bewerber: number; eingestellt: number }>();
  for (const p of personen) {
    const q = p.quelle?.trim() || "ohne Angabe";
    if (!quellenMap.has(q)) quellenMap.set(q, { bewerber: 0, eingestellt: 0 });
    const x = quellenMap.get(q)!; x.bewerber++;
    if (p.status === "VERMITTELT" || p.pipelineStufe === "EINGESTELLT") x.eingestellt++;
  }
  const absagen = new Map<string, number>();
  for (const p of personen) if (p.absagegrund) absagen.set(p.absagegrund, (absagen.get(p.absagegrund) ?? 0) + 1);
  const stufen = new Map<string, number>();
  for (const p of personen) stufen.set(p.pipelineStufe ?? "NEU", (stufen.get(p.pipelineStufe ?? "NEU") ?? 0) + 1);

  return {
    timeToFillTage: median(ttf),
    timeToFillAnzahl: ttf.length,
    wiedereinsatzQuote: proPerson.size ? Math.round((mitMehreren / proPerson.size) * 1000) / 1000 : 0,
    wiedereinsatzAnzahl: mitMehreren,
    mitarbeiterGesamt: proPerson.size,
    quellen: [...quellenMap].map(([quelle, v]) => ({ quelle, ...v, quote: v.bewerber ? Math.round((v.eingestellt / v.bewerber) * 1000) / 1000 : 0 })).sort((a, b) => b.bewerber - a.bewerber),
    absagegruende: [...absagen].map(([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
    stufen: [...stufen].map(([stufe, anzahl]) => ({ stufe, anzahl })),
    talentpool: personen.filter((p) => p.talentpool).length,
  };
}
