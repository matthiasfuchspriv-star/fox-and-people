import { db } from "./db";

/**
 * Referenzlohn-Datenbank je Beschäftiger-Kollektivvertrag (§ 10 Abs. 1 AÜG, KV AKÜ Abschnitt IX).
 *
 * Grundsatz: Der überlassene Mitarbeiter bekommt mindestens den Lohn, den ein vergleichbarer Stammarbeitnehmer
 * im Beschäftigerbetrieb bekäme (Referenzlohn). Liegt dieser über dem Grundlohn nach KV Arbeitskräfteüberlassung,
 * ist die Differenz als **Referenzzuschlag** auszuzahlen und auf der Lohnabrechnung gesondert auszuweisen.
 *
 * Exakt gepflegt ist derzeit nur die **metalltechnische Industrie (Arbeiter)** – die Lohntafeln ab 1.11.2025 und
 * 1.11.2026 laut WKO. Alle übrigen KV sind angelegt, aber ohne Werte: dort meldet das Programm beim Einsatz
 * „Referenzzuschlag prüfen“, damit der Lohn vor der Überlassung händisch verglichen wird.
 */

export { MONATSTEILER_STANDARD, stundenlohnAusMonat, mitReferenzzuschlag } from "./referenzlohn-rechnen";
import { MONATSTEILER_STANDARD, stundenlohnAusMonat, mitReferenzzuschlag } from "./referenzlohn-rechnen";

/**
 * Freitext-KV am Kunden → Kürzel der hinterlegten Lohntafel.
 *
 * Im Kundenstamm steht der Kollektivvertrag als Text, so wie ihn der Beschäftiger nennt: „KV
 * Metallindustrie", „Metaller", „Metalltechnische Industrie". In der Tabelle heißt derselbe KV
 * „Metalltechnische Industrie (Arbeiter/innen)" mit dem Kürzel MTI. Ohne diese Zuordnung findet die
 * Suche nichts, die Software fällt auf die Hausregel 13,90 € zurück – und ein Einsatz, der mit 13,90
 * statt mit dem Referenzlohn kalkuliert wird, ist Lohndumping. Deshalb steht diese Liste hier und
 * nicht in irgendeiner Konfiguration.
 */
const KV_SYNONYME: Record<string, string[]> = {
  MTI: ["metallindustrie", "metalltechnische industrie", "metalltechnik", "metaller", "fmti", "metallindustrie arbeiter"],
  METALLGEWERBE: ["metallgewerbe", "metallhandwerk", "schlosser"],
  "NE-METALL": ["ne-metallindustrie", "ne metall", "nichteisen"],
  EEI: ["elektroindustrie", "elektro- und elektronikindustrie", "elektronikindustrie", "elektro"],
  FAHRZEUG: ["fahrzeugindustrie", "kfz-industrie"],
  GIESSEREI: ["giessereiindustrie", "gießereiindustrie", "giesserei", "gießerei"],
  CHEMIE: ["chemische industrie", "chemieindustrie", "chemie"],
  HOLZ: ["holzindustrie", "holz verarbeitendes gewerbe", "holzverarbeitung"],
  KUNSTSTOFF: ["kunststoffverarbeitung", "kunststoffindustrie", "kunststoff"],
  PAPIER: ["papierindustrie", "papier"],
  TEXTIL: ["textilindustrie", "textil"],
  NAGE: ["nahrungs- und genussmittelindustrie", "lebensmittelindustrie", "nahrungsmittel"],
  HANDEL: ["handel", "handelsangestellte", "kv handel"],
  SPEDITION: ["speditionsgewerbe", "spedition", "logistik"],
  TRANSPORT: ["güterbeförderung", "gueterbefoerderung", "transportgewerbe", "transport", "frächter"],
  GASTRO: ["gastgewerbe", "hotel- und gastgewerbe", "gastronomie", "hotellerie"],
  REINIGUNG: ["reinigung", "gebäudereiniger", "gebaeudereiniger", "denkmal-, fassaden- und gebäudereiniger"],
  "ANG-GEWERBE": ["angestellte gewerbe", "angestellte gewerbe & handwerk", "angestellte gewerbe, handwerk und dienstleistung", "angestellte handwerk"],
};

/**
 * Findet zu einem freien KV-Text das Kürzel der hinterlegten Lohntafel. Vergleicht ohne Rücksicht
 * auf Groß-/Kleinschreibung, das führende „KV" und Sonderzeichen.
 */
export function kvKuerzelAusText(text: string | null | undefined): string | null {
  const t = (text ?? "").toLowerCase().replace(/^kv\s+/, "").replace(/[^a-zäöüß\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const [kuerzel, namen] of Object.entries(KV_SYNONYME)) {
    if (kuerzel.toLowerCase() === t) return kuerzel;
    for (const n of namen) if (t === n || t.includes(n) || n.includes(t)) return kuerzel;
  }
  return null;
}

export interface ReferenzStufe { bg: string; bezeichnung?: string; grund: number; nach2?: number; nach4?: number; refZ?: number | null }
export interface ReferenzTafel { gultigAb: string; stufen: ReferenzStufe[] }
export interface ReferenzKvDef {
  kuerzel: string;
  name: string;
  wochenstunden: number;
  monatsteiler: number;
  quelle: string;
  hinweis?: string;
  tafeln?: ReferenzTafel[];
}

const MTI_BG: Record<string, string> = {
  A: "Hilfstätigkeiten ohne Anlernzeit",
  B: "Angelernte Tätigkeiten",
  C: "Qualifiziert angelernte Tätigkeiten",
  D: "Facharbeit / abgeschlossene Lehre",
  E: "Qualifizierte Facharbeit",
  F: "Facharbeit mit Zusatzqualifikation",
  G: "Vorarbeiter / hochqualifizierte Facharbeit",
  H: "Partieführer / Meister",
  I: "Meister mit erweiterter Verantwortung",
  J: "Werkmeister",
  K: "Leitende Werkmeister",
};

/**
 * Referenzzuschlag je Beschäftigungsgruppe in Prozent (§ 10 AÜG, KV AKÜ Abschnitt IX).
 *
 * Quelle: BMD-Auswahl „KV Beschäftigungsgruppe“, ArbeiterInnen der Metalltechnischen Industrie,
 * Stichtag 01.11.2025, Spalte „Satz Ref. Z [%]“ – vom Kunden übermittelt und gegen die dortigen
 * Ergebnisspalten nachgerechnet: BG A 15,39 × 1,09 = 16,78 · BG B 15,39 × 1,13 = 17,39 ·
 * BG C 16,16 × 1,13 = 18,26 · BG D 17,66 × 1,18 = 20,84. Alle elf Gruppen stimmen auf den Cent.
 *
 * Ohne diese Sätze rechnet die Software mit dem nackten KV-Lohn – und ein Einsatz, der mit dem
 * Grundlohn statt mit dem Referenzlohn kalkuliert wird, ist Lohndumping. Deshalb stehen die Zahlen
 * hier im Code und nicht in einer Tabelle, die jemand pflegen müsste.
 */
const MTI_REF_Z: Record<string, number> = { A: 9, B: 13, C: 13, D: 18, E: 18, F: 18, G: 18, H: 18, I: 18, J: 18, K: 18 };

/** Lohntafel metalltechnische Industrie (Arbeiter/innen), Monatsbrutto je Beschäftigungsgruppe – Quelle WKO. */
const MTI_2025: ReferenzStufe[] = [
  { bg: "A", grund: 2568.8, nach2: 2608.44, nach4: 2648.08 },
  { bg: "B", grund: 2568.8, nach2: 2608.73, nach4: 2648.66 },
  { bg: "C", grund: 2698.59, nach2: 2741.24, nach4: 2783.89 },
  { bg: "D", grund: 2947.89, nach2: 3001.51, nach4: 3055.13 },
  { bg: "E", grund: 3396.21, nach2: 3458.06, nach4: 3519.91 },
  { bg: "F", grund: 3802.93, nach2: 3893.31, nach4: 3983.69 },
  { bg: "G", grund: 4354.45, nach2: 4492.58, nach4: 4630.71 },
  { bg: "H", grund: 4767.21, nach2: 4918.43, nach4: 5069.65 },
  { bg: "I", grund: 5804.36, nach2: 5988.46, nach4: 6172.56 },
  { bg: "J", grund: 6372.64, nach2: 6574.97, nach4: 6777.3 },
  { bg: "K", grund: 8424.77, nach2: 8692.26, nach4: 8825.98 },
];
const MTI_2026: ReferenzStufe[] = [
  { bg: "A", grund: 2622.74, nach2: 2662.38, nach4: 2702.02 },
  { bg: "B", grund: 2622.74, nach2: 2662.67, nach4: 2702.6 },
  { bg: "C", grund: 2755.26, nach2: 2797.91, nach4: 2840.56 },
  { bg: "D", grund: 3009.8, nach2: 3063.42, nach4: 3117.04 },
  { bg: "E", grund: 3467.53, nach2: 3529.38, nach4: 3591.23 },
  { bg: "F", grund: 3882.79, nach2: 3973.17, nach4: 4063.55 },
  { bg: "G", grund: 4445.89, nach2: 4584.02, nach4: 4722.15 },
  { bg: "H", grund: 4867.32, nach2: 5018.54, nach4: 5169.76 },
  { bg: "I", grund: 5926.25, nach2: 6110.35, nach4: 6294.45 },
  { bg: "J", grund: 6506.47, nach2: 6708.8, nach4: 6911.13 },
  { bg: "K", grund: 8601.69, nach2: 8869.18, nach4: 9002.9 },
];
const mitBezeichnung = (s: ReferenzStufe[]) => s.map((x) => ({ ...x, bezeichnung: MTI_BG[x.bg], refZ: MTI_REF_Z[x.bg] ?? null }));

/** Ohne Werte angelegte Beschäftiger-KV – der Referenzzuschlag ist dort vor jedem Einsatz händisch zu prüfen. */
const OHNE_WERTE: { kuerzel: string; name: string; wochenstunden?: number }[] = [
  { kuerzel: "METALLGEWERBE", name: "Metallgewerbe (Arbeiter/innen)" },
  { kuerzel: "EEI", name: "Elektro- und Elektronikindustrie (Arbeiter/innen)" },
  { kuerzel: "FAHRZEUG", name: "Fahrzeugindustrie (Arbeiter/innen)" },
  { kuerzel: "GIESSEREI", name: "Gießereiindustrie (Arbeiter/innen)" },
  { kuerzel: "NE-METALL", name: "NE-Metallindustrie (Arbeiter/innen)" },
  { kuerzel: "CHEMIE", name: "Chemische Industrie (Arbeiter/innen)" },
  { kuerzel: "KUNSTSTOFF", name: "Kunststoffverarbeitung (Arbeiter/innen)" },
  { kuerzel: "HOLZ", name: "Holzindustrie (Arbeiter/innen)" },
  { kuerzel: "PAPIER", name: "Papierindustrie (Arbeiter/innen)" },
  { kuerzel: "NAGE", name: "Nahrungs- und Genussmittelindustrie (Arbeiter/innen)" },
  { kuerzel: "TEXTIL", name: "Textilindustrie (Arbeiter/innen)" },
  { kuerzel: "HANDEL", name: "Handel (Arbeiter/innen)", wochenstunden: 38.5 },
  { kuerzel: "TRANSPORT", name: "Güterbeförderung / Transportgewerbe", wochenstunden: 40 },
  { kuerzel: "SPEDITION", name: "Speditionen und Logistik", wochenstunden: 38.5 },
  { kuerzel: "GASTRO", name: "Hotel- und Gastgewerbe", wochenstunden: 40 },
  { kuerzel: "REINIGUNG", name: "Denkmal-, Fassaden- und Gebäudereiniger", wochenstunden: 40 },
  { kuerzel: "ANG-GEWERBE", name: "Angestellte Gewerbe, Handwerk und Dienstleistung", wochenstunden: 38.5 },
];

export const REFERENZ_KV: ReferenzKvDef[] = [
  {
    kuerzel: "MTI",
    name: "Metalltechnische Industrie (Arbeiter/innen)",
    wochenstunden: 38.5,
    monatsteiler: MONATSTEILER_STANDARD,
    quelle: "WKO – Lohnordnung metalltechnische Industrie, Arbeiter/innen, gültig ab 1.11.2025 und 1.11.2026",
    tafeln: [
      { gultigAb: "2025-11-01", stufen: mitBezeichnung(MTI_2025) },
      { gultigAb: "2026-11-01", stufen: mitBezeichnung(MTI_2026) },
    ],
  },
  ...OHNE_WERTE.map((k) => ({
    kuerzel: k.kuerzel,
    name: k.name,
    wochenstunden: k.wochenstunden ?? 38.5,
    monatsteiler: Math.round(((k.wochenstunden ?? 38.5) * 13) / 3),
    quelle: "WKO Kollektivvertragsdatenbank",
    hinweis: "Lohntafel nicht hinterlegt – Referenzlohn des Beschäftigers vor dem Einsatz prüfen und als Referenzzuschlag ausweisen.",
  })),
];

/** Legt die Referenz-KV an bzw. bringt Stammdaten und Lohntafeln auf den aktuellen Stand (idempotent). */
export async function referenzKvSynchronisieren(): Promise<{ angelegt: number; aktualisiert: number; stufen: number }> {
  let angelegt = 0, aktualisiert = 0, stufen = 0;
  for (const def of REFERENZ_KV) {
    const daten = {
      name: def.name,
      istReferenz: true,
      wochenstunden: def.wochenstunden,
      monatsteiler: def.monatsteiler,
      quelle: def.quelle,
      hinweis: def.hinweis ?? null,
      referenzzuschlagPruefen: !def.tafeln?.length,
    };
    let kv = await db.kollektivvertrag.findFirst({ where: { kuerzel: def.kuerzel } });
    if (!kv) {
      const ab = def.tafeln?.[0]?.gultigAb ?? "2026-01-01";
      kv = await db.kollektivvertrag.create({ data: { ...daten, kuerzel: def.kuerzel, gultigAb: new Date(ab) } });
      angelegt++;
    } else {
      await db.kollektivvertrag.update({ where: { id: kv.id }, data: daten });
      aktualisiert++;
    }
    for (const t of def.tafeln ?? []) {
      const gultigAb = new Date(t.gultigAb);
      for (const s of t.stufen) {
        const vorhanden = await db.kvLohnstufe.findFirst({ where: { kvId: kv.id, beschaeftigungsgruppe: s.bg, gultigAb } });
        const werte = {
          bezeichnung: s.bezeichnung ?? null,
          mindestMonatsbrutto: s.grund,
          // Aufrunden, nicht kaufmännisch – bei einem Mindestlohn geht der Cent zum Mitarbeiter.
          mindestStundenlohn: stundenlohnAusMonat(s.grund, def.monatsteiler),
          nach2Jahren: s.nach2 ?? null,
          nach4Jahren: s.nach4 ?? null,
          referenzzuschlagProzent: s.refZ ?? null,
        };
        if (vorhanden) await db.kvLohnstufe.update({ where: { id: vorhanden.id }, data: werte });
        else await db.kvLohnstufe.create({ data: { kvId: kv.id, beschaeftigungsgruppe: s.bg, gultigAb, ...werte } });
        stufen++;
      }
    }
  }
  return { angelegt, aktualisiert, stufen };
}

export interface ReferenzlohnErgebnis {
  kvId: string; kuerzel: string; name: string;
  stundenlohn: number | null; monatsbrutto: number | null;
  beschaeftigungsgruppe: string | null; bezeichnung: string | null;
  vorrueckung: "Grundstufe" | "nach 2 Jahren" | "nach 4 Jahren";
  exakt: boolean; hinweis: string | null; gultigAb: Date | null;
  /** Referenzzuschlag dieser Beschäftigungsgruppe in Prozent (Spalte "Satz Ref. Z"), falls hinterlegt */
  zuschlagProzent: number | null;
  /** Stundenlohn einschließlich Referenzzuschlag – das ist der maßgebliche Vergleichswert */
  stundenlohnMitZuschlag: number | null;
  /** true = für diesen KV liegt eine Lohntafel vor. Fehlt trotzdem der Lohn, passt nur die Beschäftigungsgruppe nicht. */
  tafelVorhanden: boolean;
}

/** Wählt die zum Stichtag gültige Lohntafel (die jüngste mit gultigAb <= Stichtag; ohne Datum = einzige Tafel). */
function tafelZumStichtag<T extends { gultigAb: Date | null }>(stufen: T[], am: Date): T[] {
  const mitDatum = stufen.filter((s) => s.gultigAb);
  if (!mitDatum.length) return stufen;
  const gueltig = mitDatum.filter((s) => s.gultigAb!.getTime() <= am.getTime());
  const basis = gueltig.length ? gueltig : mitDatum;
  const neuestes = Math.max(...basis.map((s) => s.gultigAb!.getTime()));
  return basis.filter((s) => s.gultigAb!.getTime() === neuestes);
}

/** Dienstjahre → Vorrückungsstufe der Lohntafel. */
export function vorrueckungsstufe(eintritt?: Date | null, am = new Date()): "Grundstufe" | "nach 2 Jahren" | "nach 4 Jahren" {
  if (!eintritt) return "Grundstufe";
  const jahre = (am.getTime() - eintritt.getTime()) / (365.25 * 86400000);
  return jahre >= 4 ? "nach 4 Jahren" : jahre >= 2 ? "nach 2 Jahren" : "Grundstufe";
}

/**
 * Referenzlohn des Beschäftigers ermitteln. `kv` ist entweder die Id oder Name/Kürzel des Beschäftiger-KV
 * (Kunde.referenzKvId bzw. Kunde.kollektivvertrag).
 */
export async function referenzlohnErmitteln(opts: {
  kv?: string | null; beschaeftigungsgruppe?: string | null; am?: Date; eintritt?: Date | null; wochenstunden?: number | null;
}): Promise<ReferenzlohnErgebnis | null> {
  if (!opts.kv) return null;
  const am = opts.am ?? new Date();
  // Reihenfolge: verknüpfte Tafel (id), Kürzel, Namensbestandteil – und zuletzt die Synonymliste für
  // den Freitext aus dem Kundenstamm.
  const ausSynonym = kvKuerzelAusText(opts.kv);
  const kv = await db.kollektivvertrag.findFirst({
    where: { OR: [
      { id: opts.kv },
      { kuerzel: { equals: opts.kv, mode: "insensitive" } },
      { name: { contains: opts.kv, mode: "insensitive" } },
      ...(ausSynonym ? [{ kuerzel: { equals: ausSynonym, mode: "insensitive" as const } }] : []),
    ] },
    include: { lohntabelle: true },
  });
  if (!kv) return null;
  const bg = (opts.beschaeftigungsgruppe ?? "").trim().toUpperCase();
  const tafel = tafelZumStichtag(kv.lohntabelle, am);
  const stufe = tafel.find((l) => l.beschaeftigungsgruppe.toUpperCase() === bg)
    ?? tafel.find((l) => bg.startsWith(l.beschaeftigungsgruppe.toUpperCase() + " ") || bg.endsWith(" " + l.beschaeftigungsgruppe.toUpperCase()))
    ?? null;
  const vorrueckung = vorrueckungsstufe(opts.eintritt ?? null, am);
  let monatsbrutto: number | null = null;
  if (stufe) {
    monatsbrutto = vorrueckung === "nach 4 Jahren" ? (stufe.nach4Jahren ?? stufe.nach2Jahren ?? stufe.mindestMonatsbrutto)
      : vorrueckung === "nach 2 Jahren" ? (stufe.nach2Jahren ?? stufe.mindestMonatsbrutto)
      : stufe.mindestMonatsbrutto;
  }
  // Ein Referenz-KV mit abweichender Normalarbeitszeit rechnet mit seinem eigenen Teiler.
  const teiler = kv.monatsteiler || MONATSTEILER_STANDARD;
  const stundenlohn = monatsbrutto != null ? stundenlohnAusMonat(monatsbrutto, teiler) : (stufe?.mindestStundenlohn ?? null);
  const zuschlagProzent = stufe?.referenzzuschlagProzent ?? null;
  const stundenlohnMitZuschlag = stundenlohn != null && zuschlagProzent != null
    ? mitReferenzzuschlag(stundenlohn, zuschlagProzent)
    : stundenlohn;
  return {
    zuschlagProzent,
    stundenlohnMitZuschlag,
    tafelVorhanden: kv.lohntabelle.length > 0 && !kv.referenzzuschlagPruefen,
    kvId: kv.id, kuerzel: kv.kuerzel, name: kv.name,
    stundenlohn, monatsbrutto,
    beschaeftigungsgruppe: stufe?.beschaeftigungsgruppe ?? null,
    bezeichnung: stufe?.bezeichnung ?? null,
    vorrueckung,
    exakt: stundenlohn != null && !kv.referenzzuschlagPruefen,
    hinweis: kv.referenzzuschlagPruefen || stundenlohn == null
      ? (kv.hinweis ?? "Referenzlohn nicht hinterlegt – vor dem Einsatz beim Beschäftiger erfragen und Referenzzuschlag ausweisen.")
      : null,
    gultigAb: stufe?.gultigAb ?? kv.gultigAb,
  };
}

/**
 * Welcher Referenz-KV des Beschäftigers gilt für diese Person?
 *
 * Beschäftiger führen für Arbeiter und Angestellte getrennte Kollektivverträge – in der
 * metalltechnischen Industrie etwa „ArbeiterInnen" und „Angestellte" mit ganz unterschiedlichen
 * Lohntafeln. Wer beide über einen Kamm schert, vergleicht den Lohn eines Lagerarbeiters mit der
 * Gehaltstafel der Angestellten und kommt auf einen Mindestlohn, der mit der Wirklichkeit nichts
 * zu tun hat.
 *
 * Ist für die Angestellten nichts hinterlegt, gilt der allgemeine Eintrag – besser der grobe
 * Vergleich als gar keiner, und der Hinweis „Referenzzuschlag prüfen" erscheint ohnehin.
 */
export function referenzKvFuer(
  kunde: { referenzKvId?: string | null; referenzKvAngestellteId?: string | null; kollektivvertrag?: string | null } | null | undefined,
  angestellt: boolean | null | undefined,
): string | null {
  if (!kunde) return null;
  if (angestellt && kunde.referenzKvAngestellteId) return kunde.referenzKvAngestellteId;
  return kunde.referenzKvId ?? kunde.kollektivvertrag ?? null;
}

/**
 * Je Beschäftigungsgruppe nur die zum Stichtag gültige Zeile einer Lohntafel.
 *
 * Die Tafeln tragen mehrere Stände (z. B. Metall ab 1.11.2025 und ab 1.11.2026). Ein Auswahlfeld,
 * das alle Stände mischt, zeigt jede Gruppe doppelt – mit verschiedenen Beträgen und ohne Hinweis,
 * welcher gilt. Hier gewinnt je Gruppe der jüngste Stand mit gultigAb <= Stichtag; gibt es nur
 * künftige Stände, der früheste davon.
 */
export function aktuelleLohnstufen<T extends { beschaeftigungsgruppe: string; gultigAb: Date | null }>(stufen: T[], am = new Date()): T[] {
  const je = new Map<string, T>();
  const sortiert = [...stufen].sort((a, b) => (a.gultigAb?.getTime() ?? 0) - (b.gultigAb?.getTime() ?? 0));
  for (const st of sortiert) {
    const k = st.beschaeftigungsgruppe;
    const bisher = je.get(k);
    if (!bisher) { je.set(k, st); continue; }
    const stGilt = !st.gultigAb || st.gultigAb <= am;
    const bisherGilt = !bisher.gultigAb || bisher.gultigAb <= am;
    if (stGilt || (!bisherGilt && !stGilt && (st.gultigAb?.getTime() ?? 0) < (bisher.gultigAb?.getTime() ?? 0))) je.set(k, st);
  }
  return [...je.values()].sort((a, b) => a.beschaeftigungsgruppe.localeCompare(b.beschaeftigungsgruppe, "de"));
}
