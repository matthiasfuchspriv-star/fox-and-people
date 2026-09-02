import { feiertageAT, tageDerKw } from "./wochen";

/**
 * Arbeitszeitaufzeichnung nach § 26 AZG: Für jeden Tag werden Beginn, Ende und Pausen festgehalten, daraus ergeben
 * sich Gesamt-, Normal- und Überstunden. Grundlage ist die Wochenvorlage „Stundennachweis“ von Fox & People:
 * Tag · Datum · Ort · Beginn · Ende · Pause · Gesamtstd. · Normalstd. · Ü-Std. 50 % · Ü-Std. 100 % · Fehlzeit · Anmerkung.
 *
 * Aufteilungsregel (voreingestellt, je Einsatz über die Normalarbeitszeit steuerbar):
 *   • Stunden an Sonn- und Feiertagen        → Überstunden 100 %
 *   • Stunden über der täglichen Normalarbeitszeit oder über der Wochennormalarbeitszeit → Überstunden 50 %
 *   • alles übrige                            → Normalstunden
 * Händisch eingetragene Werte in normal/ue50/ue100 haben immer Vorrang vor der Automatik.
 */

export const FEHLZEITEN: { code: string; label: string }[] = [
  { code: "", label: "–" },
  { code: "K", label: "Krankenstand" },
  { code: "U", label: "Urlaub" },
  { code: "Z", label: "Zeitausgleich" },
  { code: "FT", label: "Feiertag" },
  { code: "F", label: "frei / kein Einsatz" },
  { code: "P", label: "Pflegefreistellung" },
  { code: "S", label: "Sonstige (siehe Anmerkung)" },
];

export interface Tageseintrag {
  ort?: string | null;
  beginn?: string | null;   // "07:00"
  ende?: string | null;     // "16:30"
  pauseMin?: number | null; // Pause in Minuten
  gesamt?: number | null;   // Stunden – aus Beginn/Ende/Pause errechnet, kann überschrieben werden
  normal?: number | null;
  ue50?: number | null;
  ue100?: number | null;
  fehlzeit?: string | null;
  anmerkung?: string | null;
}

export interface TagesBerechnung { gesamt: number; normal: number; ue50: number; ue100: number }
export interface WochenBerechnung {
  tage: TagesBerechnung[];
  summe: number; normal: number; ue50: number; ue100: number;
  warnungen: string[];
}

const TAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "07:30" → 450 Minuten. Leere oder ungültige Angaben ergeben null. */
export function minutenAusZeit(z?: string | null): number | null {
  if (!z) return null;
  const m = String(z).trim().match(/^(\d{1,2})[:.,]?(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Netto-Arbeitsstunden aus Beginn, Ende und Pause. Ende vor Beginn = Nachtschicht über Mitternacht. */
export function stundenAusZeit(beginn?: string | null, ende?: string | null, pauseMin?: number | null): number | null {
  const a = minutenAusZeit(beginn), b = minutenAusZeit(ende);
  if (a == null || b == null) return null;
  let dauer = b - a;
  if (dauer < 0) dauer += 24 * 60; // über Mitternacht
  dauer -= Math.max(0, pauseMin ?? 0);
  return r2(Math.max(0, dauer) / 60);
}

/** Pflichtruhepause § 11 AZG: Ab mehr als 6 Stunden Tagesarbeitszeit sind mindestens 30 Minuten zu halten. */
export function pflichtpauseMinuten(bruttoStunden: number): number {
  return bruttoStunden > 6 ? 30 : 0;
}

export interface AufteilungOptionen {
  /** tägliche Normalarbeitszeit, Standard 8 h */
  tagesnormal?: number;
  /** wöchentliche Normalarbeitszeit, Standard 38,5 h */
  wochennormal?: number;
  /** Datum je Wochentag Mo–So – für Feiertagserkennung */
  daten?: Date[];
}

/**
 * Berechnet eine Woche: fehlende Gesamtstunden aus Beginn/Ende/Pause, danach die Aufteilung in Normal-, 50-%- und
 * 100-%-Überstunden sowie die arbeitszeitrechtlichen Warnungen.
 */
export function berechneWoche(eintraege: (Tageseintrag | null | undefined)[], opts: AufteilungOptionen = {}): WochenBerechnung {
  const tagesnormal = opts.tagesnormal ?? 8;
  const wochennormal = opts.wochennormal ?? 38.5;
  const daten = opts.daten ?? [];
  const feiertage = new Set<string>();
  for (const d of daten) for (const f of feiertageAT(d.getUTCFullYear())) feiertage.add(f);

  const warnungen: string[] = [];
  const tage: WochenBerechnung["tage"] = [];
  let restWoche = wochennormal;

  for (let i = 0; i < 7; i++) {
    const e = eintraege[i] ?? {};
    const brutto = (() => {
      const a = minutenAusZeit(e.beginn), b = minutenAusZeit(e.ende);
      if (a == null || b == null) return null;
      let d = b - a; if (d < 0) d += 24 * 60;
      return r2(d / 60);
    })();
    // Beginn und Ende haben Vorrang: wer eine Uhrzeit einträgt, meint sie auch so. Der Wert im Feld
    // „Stunden" gilt nur, wenn keine Zeiten angegeben sind (§ 26 AZG verlangt ohnehin die Zeiten).
    const ausZeit = stundenAusZeit(e.beginn, e.ende, e.pauseMin);
    const gesamt = ausZeit != null ? ausZeit : (e.gesamt != null ? r2(e.gesamt) : 0);

    // Warnungen nach AZG
    if (brutto != null && brutto > 6 && (e.pauseMin ?? 0) < pflichtpauseMinuten(brutto))
      warnungen.push(`${TAGE_KURZ[i]}: Tagesarbeitszeit über 6 Stunden – mindestens 30 Minuten Pause eintragen (§ 11 AZG).`);
    if (gesamt > 12) warnungen.push(`${TAGE_KURZ[i]}: ${gesamt.toLocaleString("de-AT")} Stunden – Höchstgrenze der Tagesarbeitszeit ist 12 Stunden (§ 9 AZG).`);
    const vorher = eintraege[i - 1];
    if (i > 0 && vorher) {
      const endeVor = minutenAusZeit(vorher.ende), beginnHeute = minutenAusZeit(e.beginn);
      if (endeVor != null && beginnHeute != null) {
        const ruhe = (24 * 60 - endeVor + beginnHeute) / 60;
        if (ruhe > 0 && ruhe < 11) warnungen.push(`${TAGE_KURZ[i]}: nur ${ruhe.toLocaleString("de-AT", { maximumFractionDigits: 1 })} Stunden Ruhezeit nach dem Vortag – 11 Stunden sind vorgeschrieben (§ 12 AZG).`);
      }
    }

    // Aufteilung
    let normal = e.normal ?? null, ue50 = e.ue50 ?? null, ue100 = e.ue100 ?? null;
    if (normal == null && ue50 == null && ue100 == null) {
      const d = daten[i];
      const istSonnOderFeiertag = i === 6 || (d ? feiertage.has(d.toISOString().slice(0, 10)) : false);
      if (istSonnOderFeiertag) { normal = 0; ue50 = 0; ue100 = gesamt; }
      else {
        const ueberTag = Math.max(0, gesamt - tagesnormal);
        const rest = gesamt - ueberTag;
        const alsNormal = Math.min(rest, Math.max(0, restWoche));
        normal = r2(alsNormal);
        ue50 = r2(ueberTag + (rest - alsNormal));
        ue100 = 0;
        restWoche -= alsNormal;
      }
    } else {
      normal = normal ?? 0; ue50 = ue50 ?? 0; ue100 = ue100 ?? 0;
      restWoche -= normal;
    }
    tage.push({ gesamt: r2(gesamt), normal: r2(normal), ue50: r2(ue50), ue100: r2(ue100) });
  }

  const summe = r2(tage.reduce((a, t) => a + t.gesamt, 0));
  if (summe > 60) warnungen.push(`Wochenarbeitszeit ${summe.toLocaleString("de-AT")} Stunden – die Höchstgrenze liegt bei 60 Stunden (§ 9 AZG).`);
  return {
    tage, summe,
    normal: r2(tage.reduce((a, t) => a + t.normal, 0)),
    ue50: r2(tage.reduce((a, t) => a + t.ue50, 0)),
    ue100: r2(tage.reduce((a, t) => a + t.ue100, 0)),
    warnungen,
  };
}

/** Liest die sieben Tageseinträge aus einem Formular (Feldnamen `d<i>_beginn`, `d<i>_ende`, …). */
export function eintraegeAusForm(fd: FormData, prefix = "d"): Tageseintrag[] {
  const num = (v: FormDataEntryValue | null) => { const x = String(v ?? "").replace(",", ".").trim(); return x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null; };
  const txt = (v: FormDataEntryValue | null) => { const x = String(v ?? "").trim(); return x === "" ? null : x; };
  return Array.from({ length: 7 }, (_, i) => ({
    ort: txt(fd.get(`${prefix}${i}_ort`)),
    beginn: txt(fd.get(`${prefix}${i}_beginn`)),
    ende: txt(fd.get(`${prefix}${i}_ende`)),
    pauseMin: num(fd.get(`${prefix}${i}_pause`)),
    gesamt: num(fd.get(`${prefix}${i}_gesamt`)),
    normal: num(fd.get(`${prefix}${i}_normal`)),
    ue50: num(fd.get(`${prefix}${i}_ue50`)),
    ue100: num(fd.get(`${prefix}${i}_ue100`)),
    fehlzeit: txt(fd.get(`${prefix}${i}_fehlzeit`)),
    anmerkung: txt(fd.get(`${prefix}${i}_anmerkung`)),
  }));
}

/** Sichert Alt-Nachweise ab: aus reinen Tagesstunden werden Einträge ohne Beginn/Ende. */
export function eintraegeAusTagen(tage: number[]): Tageseintrag[] {
  return Array.from({ length: 7 }, (_, i) => ({ gesamt: tage[i] ?? 0 }));
}

/** Wochentage mit Datum für die Erfassungsmaske. */
export function wochentage(jahr: number, kw: number): { kurz: string; datum: Date; feiertag: boolean }[] {
  const ds = tageDerKw(jahr, kw);
  return ds.map((d, i) => ({ kurz: TAGE_KURZ[i], datum: d, feiertag: feiertageAT(d.getUTCFullYear()).has(d.toISOString().slice(0, 10)) }));
}
