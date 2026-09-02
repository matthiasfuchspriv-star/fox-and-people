/**
 * Kündigungs- und Fristenrechner (Österreich).
 * Die Fristentabellen sind Referenzwerte und in Einstellungen → Fristen anpassbar (KV-Änderungen!).
 * Angestellte: § 20 AngG (Dienstgeber: 6 Wochen bis 5 Monate zum Quartalsende, sofern nicht 15./Letzter vereinbart; Dienstnehmer: 1 Monat zum Monatsletzten).
 * Arbeiter (KV Arbeitskräfteüberlassung): Referenzstufen – bitte mit der aktuellen KV-Fassung abgleichen.
 * Behaltefrist nach Lehre: § 18 BAG – 3 Monate ab Lehrzeitende.
 */
export type Termin = "TAG" | "FREITAG" | "MONATSENDE" | "QUARTALSENDE" | "FUENFZEHNTER_ODER_LETZTER";
export interface Fristenstufe { abJahren: number; frist: { tage?: number; wochen?: number; monate?: number }; termin: Termin }
export interface Fristentabelle {
  arbeiterDienstgeber: Fristenstufe[];
  arbeiterDienstnehmer: Fristenstufe[];
  angestellteDienstgeber: Fristenstufe[];
  angestellteDienstnehmer: Fristenstufe[];
  probezeitTage: number;
  behaltefristMonate: number;
  hinweis: string;
}

export const FRISTEN_DEFAULT: Fristentabelle = {
  // Vorgabe Fox & People (30.08.2026): Kündigung durch den Dienstgeber 21 Tage, durch den Dienstnehmer 14 Tage – immer zum Freitag
  arbeiterDienstgeber: [{ abJahren: 0, frist: { tage: 21 }, termin: "FREITAG" }],
  arbeiterDienstnehmer: [{ abJahren: 0, frist: { tage: 14 }, termin: "FREITAG" }],
  angestellteDienstgeber: [
    { abJahren: 0, frist: { wochen: 6 }, termin: "QUARTALSENDE" },
    { abJahren: 2, frist: { monate: 2 }, termin: "QUARTALSENDE" },
    { abJahren: 5, frist: { monate: 3 }, termin: "QUARTALSENDE" },
    { abJahren: 15, frist: { monate: 4 }, termin: "QUARTALSENDE" },
    { abJahren: 25, frist: { monate: 5 }, termin: "QUARTALSENDE" },
  ],
  angestellteDienstnehmer: [{ abJahren: 0, frist: { monate: 1 }, termin: "MONATSENDE" }],
  probezeitTage: 30,
  behaltefristMonate: 3,
  hinweis: "Arbeiter: DG 21 Tage / DN 14 Tage, jeweils zum Freitag (Hausregel Fox & People, KV AKÜ). Angestellte: AngG § 20.",
};

const addTage = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonate = (d: Date, n: number) => { const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if (x.getDate() !== d.getDate()) x.setDate(0); return x; };
const monatsende = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const quartalsende = (d: Date) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);

export const dienstjahre = (eintritt: Date, am: Date) => Math.max(0, (am.getTime() - eintritt.getTime()) / (365.25 * 86400000));

export function stufeFuer(stufen: Fristenstufe[], eintritt: Date, am: Date) {
  const j = dienstjahre(eintritt, am);
  return [...stufen].sort((a, b) => b.abJahren - a.abJahren).find((s) => j >= s.abJahren) ?? stufen[0];
}

const fristEnde = (ab: Date, f: Fristenstufe["frist"]) => addMonate(addTage(ab, (f.tage ?? 0) + (f.wochen ?? 0) * 7), f.monate ?? 0);

/** Nächstmöglicher Termin ab einem Datum (inkl. desselben Tages) */
function naechsterTermin(ab: Date, termin: Termin) {
  if (termin === "TAG") return ab;
  if (termin === "FREITAG") { const d = new Date(ab); const w = d.getDay(); const plus = (5 - w + 7) % 7; d.setDate(d.getDate() + plus); return d; }
  if (termin === "MONATSENDE") return monatsende(ab);
  if (termin === "QUARTALSENDE") return quartalsende(ab);
  const f = new Date(ab.getFullYear(), ab.getMonth(), 15);
  return ab.getDate() <= 15 ? f : monatsende(ab);
}

export const fristText = (f: Fristenstufe["frist"]) => f.monate ? `${f.monate} Monat${f.monate > 1 ? "e" : ""}` : f.wochen ? `${f.wochen} Wochen` : `${f.tage} Tage`;
export const terminText = (t: Termin) => ({ TAG: "zu jedem Tag", FREITAG: "zum Freitag", MONATSENDE: "zum Monatsletzten", QUARTALSENDE: "zum Quartalsende", FUENFZEHNTER_ODER_LETZTER: "zum 15. oder Letzten" })[t];

/** Wird am `ausgesprochenAm` gekündigt: frühestmögliches Ende des Dienstverhältnisses */
export function endeBeiKuendigung(stufen: Fristenstufe[], eintritt: Date, ausgesprochenAm: Date) {
  const st = stufeFuer(stufen, eintritt, ausgesprochenAm);
  const fruehestens = fristEnde(ausgesprochenAm, st.frist);
  return { ende: naechsterTermin(fruehestens, st.termin), stufe: st };
}

/** Soll das Dienstverhältnis am `zielEnde` enden: letzter Tag, an dem die Kündigung ausgesprochen werden muss (rückwärts gesucht) */
export function letzterKuendigungstag(stufen: Fristenstufe[], eintritt: Date, zielEnde: Date) {
  for (let i = 0; i < 400; i++) {
    const tag = addTage(zielEnde, -i);
    const { ende } = endeBeiKuendigung(stufen, eintritt, tag);
    if (ende.getTime() <= zielEnde.getTime()) return { tag, stufe: stufeFuer(stufen, eintritt, tag) };
  }
  return null;
}

export interface FristenUebersicht {
  probezeitEnde: Date | null;
  behaltefristEnde: Date | null;
  dienstjahre: number;
  dgStufe: Fristenstufe; dnStufe: Fristenstufe;
  dgEndeHeute: Date; dnEndeHeute: Date;
  naechsteStufe: { ab: Date; stufe: Fristenstufe } | null;
}

/** Komplette Fristenübersicht für eine Person */
export function fristenUebersicht(t: Fristentabelle, p: { eintrittsdatum: Date | null; angestellt: boolean; lehreEndeAm: Date | null }, heute = new Date()): FristenUebersicht | null {
  if (!p.eintrittsdatum) return null;
  const e = p.eintrittsdatum;
  const dg = p.angestellt ? t.angestellteDienstgeber : t.arbeiterDienstgeber;
  const dn = p.angestellt ? t.angestellteDienstnehmer : t.arbeiterDienstnehmer;
  const dgH = endeBeiKuendigung(dg, e, heute);
  const dnH = endeBeiKuendigung(dn, e, heute);
  const jetzt = stufeFuer(dg, e, heute);
  const spaeter = [...dg].sort((a, b) => a.abJahren - b.abJahren).find((s) => s.abJahren > jetzt.abJahren);
  return {
    probezeitEnde: addTage(e, t.probezeitTage),
    behaltefristEnde: p.lehreEndeAm ? addMonate(p.lehreEndeAm, t.behaltefristMonate) : null,
    dienstjahre: dienstjahre(e, heute),
    dgStufe: dgH.stufe, dnStufe: dnH.stufe,
    dgEndeHeute: dgH.ende, dnEndeHeute: dnH.ende,
    naechsteStufe: spaeter ? { ab: addMonate(e, Math.round(spaeter.abJahren * 12)), stufe: spaeter } : null,
  };
}
