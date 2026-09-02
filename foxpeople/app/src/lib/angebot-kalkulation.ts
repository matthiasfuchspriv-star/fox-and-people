import { payroll, ueberlassung, abgeleiteteSaetze, type AbgabenSaetze } from "@/engine/kalkulation";

/** Ein Monat hat im Schnitt 4,3333 Wochen (52 ÷ 12) – daraus werden aus der Wochen-Sollzeit die Monatsstunden. */
export const WOCHEN_JE_MONAT = 13 / 3;
export const monatsstunden = (wochenstunden: number | null | undefined): number | null =>
  wochenstunden == null ? null : Math.round(wochenstunden * WOCHEN_JE_MONAT * 100) / 100;

export interface PositionEingabe {
  kalkulationsart: "UEBERLASSUNG" | "PAYROLL" | "VERMITTLUNG";
  stundenlohn?: number | null;
  bruttogehalt?: number | null;
  stundenProMonat?: number | null;
  verrechnungssatz?: number | null;
  aufschlagMonat?: number | null;
  honorar?: number | null;
  anzahlPersonen?: number | null;
  mindestlohn?: number | null; // KV-Mindestlohn (Std bzw. Monat) für Warnung
}

export interface PositionKalkulation {
  kalkulationsart: PositionEingabe["kalkulationsart"];
  saetze: AbgabenSaetze;
  faktor: number;
  selbstkosten: number; // pro Std (Überlassung) bzw. pro Monat (Payroll)
  preis: number | null; // Verrechnungssatz/Std bzw. Verkaufspreis/Monat bzw. Honorar
  db1Einheit: number | null; // pro Std bzw. pro Monat
  db1Marge: number | null;
  db1Monat: number | null; // × Stunden × Personen
  db1Jahr: number | null;
  umsatzMonat: number | null;
  umsatzJahr: number | null;
  status: "positiv" | "negativ" | null;
  unterMindestlohn: boolean;
  detail: Record<string, number>;
}

export function berechneAngebotsposition(p: PositionEingabe, saetze: AbgabenSaetze): PositionKalkulation {
  const n = p.anzahlPersonen ?? 1;
  const a = abgeleiteteSaetze(saetze);
  if (p.kalkulationsart === "PAYROLL") {
    const r = payroll(p.bruttogehalt ?? 0, saetze, p.aufschlagMonat ?? null);
    const db1Monat = r.db1 == null ? null : r.db1 * n;
    return {
      kalkulationsart: "PAYROLL", saetze, faktor: a.payrollFaktor, selbstkosten: r.selbstkosten, preis: r.verkaufspreis,
      db1Einheit: r.db1, db1Marge: r.db1 != null && r.verkaufspreis ? r.db1 / r.verkaufspreis : null,
      db1Monat, db1Jahr: db1Monat == null ? null : db1Monat * 12,
      umsatzMonat: r.verkaufspreis == null ? null : r.verkaufspreis * n, umsatzJahr: r.verkaufspreis == null ? null : r.verkaufspreis * n * 12,
      status: r.db1 == null ? null : r.db1 >= 0 ? "positiv" : "negativ",
      unterMindestlohn: p.mindestlohn != null && (p.bruttogehalt ?? 0) > 0 && (p.bruttogehalt ?? 0) < p.mindestlohn,
      detail: { dgAbgaben: r.dgAbgaben, sonderzahlungen: r.sonderzahlungen, dgAufSonderzahlungen: r.dgAufSonderzahlungen, invalidenausgleichstaxe: r.invalidenausgleichstaxe, verkaufsfaktor: r.verkaufsfaktor ?? 0 },
    };
  }
  if (p.kalkulationsart === "VERMITTLUNG") {
    const h = p.honorar ?? null;
    return {
      kalkulationsart: "VERMITTLUNG", saetze, faktor: 1, selbstkosten: 0, preis: h, db1Einheit: h, db1Marge: h ? 1 : null,
      db1Monat: h == null ? null : h * n, db1Jahr: h == null ? null : h * n, umsatzMonat: h == null ? null : h * n, umsatzJahr: h == null ? null : h * n,
      status: h == null ? null : "positiv", unterMindestlohn: false, detail: {},
    };
  }
  const r = ueberlassung(p.stundenlohn ?? 0, saetze, p.verrechnungssatz ?? null, p.stundenProMonat ?? null);
  const db1Monat = r.db1ProMonat == null ? null : r.db1ProMonat * n;
  const umsatzMonat = r.verrechnungssatz == null || r.stundenProMonat == null ? null : r.verrechnungssatz * r.stundenProMonat * n;
  return {
    kalkulationsart: "UEBERLASSUNG", saetze, faktor: a.ueberlassungsFaktor, selbstkosten: r.kalkulationProStunde, preis: r.verrechnungssatz,
    db1Einheit: r.db1ProStunde, db1Marge: r.db1Marge, db1Monat, db1Jahr: db1Monat == null ? null : db1Monat * 12,
    umsatzMonat, umsatzJahr: umsatzMonat == null ? null : umsatzMonat * 12,
    status: r.status == null ? null : r.status === "DB1 positiv" ? "positiv" : "negativ",
    unterMindestlohn: p.mindestlohn != null && (p.stundenlohn ?? 0) > 0 && (p.stundenlohn ?? 0) < p.mindestlohn,
    detail: { dgAbgaben: r.dgAbgaben, abwesenheiten: r.abwesenheiten, dgAufAbwesenheiten: r.dgAufAbwesenheiten, sonderzahlungen: r.sonderzahlungen, dgAufSonderzahlungen: r.dgAufSonderzahlungen, invalidenausgleichstaxe: r.invalidenausgleichstaxe },
  };
}
