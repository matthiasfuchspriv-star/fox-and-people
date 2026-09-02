/**
 * Kalkulations-Engine – Fox & People
 * ----------------------------------
 * 1:1-Umsetzung des Excel-Tools "FoxandPeople_Verrechnungstool" (Blätter
 * "Kalkulation", "Rückstellungen", "Monatsabrechnung"), Basis WIFI-NÖ-
 * Kalkulationsschema Arbeitskräfteüberlassung 2023.
 *
 * Reines, DB-freies Modul: Eingabe = Satz-Set + Werte, Ausgabe = Ergebnis.
 * Jede Formel verweist auf die Excel-Zelle, die sie nachbildet.
 */

/** Alle Prozentsätze als Dezimalzahl (0.1255 = 12,55 %). Excel: Kalkulation!C7–C49 */
export interface AbgabenSaetze {
  // A) Dienstgeber-Abgaben
  pensionsversicherung: number; // C7
  krankenversicherung: number; // C8
  unfallversicherung: number; // C9
  arbeitslosenversicherung: number; // C10
  iesg: number; // C11
  wohnbaufoerderung: number; // C12
  swf: number; // C14
  mitarbeitervorsorge: number; // C15
  dienstgeberbeitrag: number; // C16
  dz: number; // C17 – Zuschlag zum DB, je Bundesland
  kommunalsteuer: number; // C18
  // B) Payroll (Angestellte, 12×/Jahr)
  urlaubszuschussPayroll: number; // C23
  weihnachtsremunerationPayroll: number; // C24
  invalidenausgleichstaxePayroll: number; // C26
  // C) Überlassung (pro Leistungsstunde)
  abwUrlaub: number; // C39
  abwFeiertage: number; // C40
  abwKrankheit: number; // C41
  abwSonstige: number; // C42
  abwStehzeiten: number; // C43
  abwKvFeiertage: number; // C44
  urlaubszuschussUeberlassung: number; // C46
  weihnachtsremunerationUeberlassung: number; // C47
  invalidenausgleichstaxeUeberlassung: number; // C49
  // E) Rückstellungssätze (Stammdaten!C5/C6)
  rueckstellungUrlaubsgeld: number; // Stammdaten!C5
  rueckstellungWeihnachtsgeld: number; // Stammdaten!C6
}

/** Referenz-Sätze WIFI NÖ 2023 – exakt die Werte aus dem Excel */
export const SAETZE_2023: AbgabenSaetze = {
  pensionsversicherung: 0.1255,
  krankenversicherung: 0.0378,
  unfallversicherung: 0.011,
  arbeitslosenversicherung: 0.03,
  iesg: 0.001,
  wohnbaufoerderung: 0.005,
  swf: 0.0035,
  mitarbeitervorsorge: 0.0153,
  dienstgeberbeitrag: 0.037,
  dz: 0.0038,
  kommunalsteuer: 0.03,
  urlaubszuschussPayroll: 0.0833,
  weihnachtsremunerationPayroll: 0.0833,
  invalidenausgleichstaxePayroll: 0.0069,
  abwUrlaub: 0.125,
  abwFeiertage: 0.06,
  abwKrankheit: 0.08,
  abwSonstige: 0.01,
  abwStehzeiten: 0.02,
  abwKvFeiertage: 0.005,
  urlaubszuschussUeberlassung: 0.1082,
  weihnachtsremunerationUeberlassung: 0.1082,
  invalidenausgleichstaxeUeberlassung: 0.0095,
  rueckstellungUrlaubsgeld: 1 / 12,
  rueckstellungWeihnachtsgeld: 1 / 12,
};

/** DZ-Sätze (Zuschlag zum DB) je Bundesland – Referenz 2023, admin-editierbar */
export const DZ_BUNDESLAND: Record<string, number> = {
  Burgenland: 0.0042,
  Kärnten: 0.0039,
  Niederösterreich: 0.0038,
  Oberösterreich: 0.0034,
  Salzburg: 0.0039,
  Steiermark: 0.0037,
  Tirol: 0.0041,
  Vorarlberg: 0.0037,
  Wien: 0.0038,
};

export interface AbgeleiteteSaetze {
  svGesamt: number; // C13
  dgAbgabenGesamt: number; // C19
  dgAbgabenOhneWbf: number; // C20
  sonderzahlungenPayroll: number; // C25
  payrollAufschlag: number; // C27
  payrollFaktor: number; // C28
  abwesenheitenGesamt: number; // C45
  sonderzahlungenUeberlassung: number; // C48
  ueberlassungsAufschlag: number; // C50
  ueberlassungsFaktor: number; // C51
  dgAbgabenAufGrundlohn: number; // Rückstellungen!D6 = C19 + C26
}

/** Abgeleitete Summen & Faktoren – Excel Kalkulation!C13, C19, C20, C25, C27, C28, C45, C48, C50, C51 */
export function abgeleiteteSaetze(s: AbgabenSaetze): AbgeleiteteSaetze {
  const svGesamt =
    s.pensionsversicherung + s.krankenversicherung + s.unfallversicherung +
    s.arbeitslosenversicherung + s.iesg + s.wohnbaufoerderung; // C13
  const dgAbgabenGesamt =
    svGesamt + s.swf + s.mitarbeitervorsorge + s.dienstgeberbeitrag + s.dz + s.kommunalsteuer; // C19
  const dgAbgabenOhneWbf = dgAbgabenGesamt - s.wohnbaufoerderung; // C20
  const sonderzahlungenPayroll = s.urlaubszuschussPayroll + s.weihnachtsremunerationPayroll; // C25
  const payrollAufschlag =
    dgAbgabenGesamt + sonderzahlungenPayroll + sonderzahlungenPayroll * dgAbgabenOhneWbf +
    s.invalidenausgleichstaxePayroll; // C27
  const abwesenheitenGesamt =
    s.abwUrlaub + s.abwFeiertage + s.abwKrankheit + s.abwSonstige + s.abwStehzeiten + s.abwKvFeiertage; // C45
  const sonderzahlungenUeberlassung =
    s.urlaubszuschussUeberlassung + s.weihnachtsremunerationUeberlassung; // C48
  const ueberlassungsAufschlag =
    dgAbgabenGesamt + abwesenheitenGesamt + abwesenheitenGesamt * dgAbgabenGesamt +
    sonderzahlungenUeberlassung + sonderzahlungenUeberlassung * dgAbgabenGesamt +
    s.invalidenausgleichstaxeUeberlassung; // C50
  return {
    svGesamt,
    dgAbgabenGesamt,
    dgAbgabenOhneWbf,
    sonderzahlungenPayroll,
    payrollAufschlag,
    payrollFaktor: 1 + payrollAufschlag, // C28
    abwesenheitenGesamt,
    sonderzahlungenUeberlassung,
    ueberlassungsAufschlag,
    ueberlassungsFaktor: 1 + ueberlassungsAufschlag, // C51
    dgAbgabenAufGrundlohn: dgAbgabenGesamt + s.invalidenausgleichstaxePayroll, // Rückstellungen!D6
  };
}

// ---------------------------------------------------------------------------
// B) Payroll-Kalkulation (Angestellte, Monatsbasis) – Kalkulation!B31:L31
// ---------------------------------------------------------------------------
export interface PayrollErgebnis {
  bruttogehalt: number; // B
  dgAbgaben: number; // C = B*C19
  sonderzahlungen: number; // D = B*C25
  dgAufSonderzahlungen: number; // E = D*C20
  invalidenausgleichstaxe: number; // F = B*C26
  selbstkosten: number; // G = B+C+D+E+F
  faktor: number; // H = G/B
  aufschlag: number | null; // I (Eingabe)
  verkaufspreis: number | null; // J = G+I
  db1: number | null; // K = J-G
  verkaufsfaktor: number | null; // L = J/B
}

export function payroll(bruttogehalt: number, s: AbgabenSaetze, aufschlag: number | null = null): PayrollErgebnis {
  const a = abgeleiteteSaetze(s);
  const dgAbgaben = bruttogehalt * a.dgAbgabenGesamt;
  const sonderzahlungen = bruttogehalt * a.sonderzahlungenPayroll;
  const dgAufSonderzahlungen = sonderzahlungen * a.dgAbgabenOhneWbf;
  const invalidenausgleichstaxe = bruttogehalt * s.invalidenausgleichstaxePayroll;
  const selbstkosten = bruttogehalt + dgAbgaben + sonderzahlungen + dgAufSonderzahlungen + invalidenausgleichstaxe;
  const verkaufspreis = aufschlag == null ? null : selbstkosten + aufschlag;
  return {
    bruttogehalt,
    dgAbgaben,
    sonderzahlungen,
    dgAufSonderzahlungen,
    invalidenausgleichstaxe,
    selbstkosten,
    faktor: bruttogehalt ? selbstkosten / bruttogehalt : 0,
    aufschlag,
    verkaufspreis,
    db1: verkaufspreis == null ? null : verkaufspreis - selbstkosten,
    verkaufsfaktor: verkaufspreis == null || !bruttogehalt ? null : verkaufspreis / bruttogehalt,
  };
}

// ---------------------------------------------------------------------------
// C) + D) Überlassungskalkulation pro Leistungsstunde – Kalkulation!B54:I54, B63:I63
// ---------------------------------------------------------------------------
export interface UeberlassungErgebnis {
  stundenlohn: number; // B54
  dgAbgaben: number; // C54 = B*C19
  abwesenheiten: number; // D54 = B*C45
  dgAufAbwesenheiten: number; // E54 = D*C19
  sonderzahlungen: number; // F54 = B*C48
  dgAufSonderzahlungen: number; // G54 = F*C19
  invalidenausgleichstaxe: number; // H54 = B*C49
  kalkulationProStunde: number; // I54 = Summe
  faktor: number; // I54/B54
  verrechnungssatz: number | null; // C63 (Eingabe)
  db1ProStunde: number | null; // D63 = C63-B63
  db1Marge: number | null; // E63 = D63/C63
  stundenProMonat: number | null; // F63 (Eingabe)
  db1ProMonat: number | null; // G63 = D63*F63
  db1ProJahr: number | null; // H63 = G63*12
  status: "DB1 positiv" | "DB1 negativ" | null; // I63
}

export function ueberlassung(
  stundenlohn: number,
  s: AbgabenSaetze,
  verrechnungssatz: number | null = null,
  stundenProMonat: number | null = null,
): UeberlassungErgebnis {
  const a = abgeleiteteSaetze(s);
  const dgAbgaben = stundenlohn * a.dgAbgabenGesamt;
  const abwesenheiten = stundenlohn * a.abwesenheitenGesamt;
  const dgAufAbwesenheiten = abwesenheiten * a.dgAbgabenGesamt;
  const sonderzahlungen = stundenlohn * a.sonderzahlungenUeberlassung;
  const dgAufSonderzahlungen = sonderzahlungen * a.dgAbgabenGesamt;
  const invalidenausgleichstaxe = stundenlohn * s.invalidenausgleichstaxeUeberlassung;
  const kalkulationProStunde =
    stundenlohn + dgAbgaben + abwesenheiten + dgAufAbwesenheiten + sonderzahlungen + dgAufSonderzahlungen + invalidenausgleichstaxe;
  const db1ProStunde = verrechnungssatz == null ? null : verrechnungssatz - kalkulationProStunde;
  const db1ProMonat = db1ProStunde == null || stundenProMonat == null ? null : db1ProStunde * stundenProMonat;
  return {
    stundenlohn,
    dgAbgaben,
    abwesenheiten,
    dgAufAbwesenheiten,
    sonderzahlungen,
    dgAufSonderzahlungen,
    invalidenausgleichstaxe,
    kalkulationProStunde,
    faktor: stundenlohn ? kalkulationProStunde / stundenlohn : 0,
    verrechnungssatz,
    db1ProStunde,
    db1Marge: db1ProStunde == null || !verrechnungssatz ? null : db1ProStunde / verrechnungssatz,
    stundenProMonat,
    db1ProMonat,
    db1ProJahr: db1ProMonat == null ? null : db1ProMonat * 12,
    status: db1ProStunde == null ? null : db1ProStunde >= 0 ? "DB1 positiv" : "DB1 negativ",
  };
}

/** Umkehrung: welcher Verrechnungssatz ist für eine Ziel-DB1-Marge nötig? */
export function verrechnungssatzFuerMarge(stundenlohn: number, s: AbgabenSaetze, zielMarge: number): number {
  const k = ueberlassung(stundenlohn, s).kalkulationProStunde;
  return zielMarge >= 1 ? Infinity : k / (1 - zielMarge);
}

// ---------------------------------------------------------------------------
// E) Rückstellungen & DB1 je Mitarbeiter/Monat – Blätter "Rückstellungen" + "Monatsabrechnung"
// ---------------------------------------------------------------------------

/** 12 Monatswerte, Index 0 = Jänner. null = nicht erfasst (Excel: leere Zelle) */
export type Monatswerte = (number | null)[];

export interface RueckstellungMonat {
  monat: number; // 1–12
  verrechnung: number; // Monatsabrechnung Zeile "Verrechnung"
  grundlohn: number; // Zeile "Bruttolohn lt. Lohnzettel"
  dgAbgaben: number; // Rückstellungen!D9 = Grundlohn * D6
  rueckstellungUrlaubsgeld: number; // Rückstellungen!Q9
  rueckstellungWeihnachtsgeld: number; // Rückstellungen!AD9
  /** Anteil für UZ/WR, der diesen Monat belastet: die Zuführung, im Excel-Vergleich der Jahresdurchschnitt */
  sonderzahlungsanteil: number;
  selbstkostenGesamt: number; // Grundlohn + DG-Abgaben + Anteil UZ/WR
  db1: number; // Monatsabrechnung Zeile "DB1"
  sonderzahlung: number; // ausbezahlte Sonderzahlung (UZ/WR inkl. Abgaben) lt. Lohnprogramm – löst die Rückstellung auf
  rueckstellungZufuehrung: number; // anteilige UZ/WR-Rückstellung je verrechnetem Monat
  rueckstellungAufloesung: number; // = sonderzahlung
  rueckstellungStand: number; // kumuliert im Jahr
}

export interface RueckstellungJahr {
  monate: RueckstellungMonat[];
  verrechnungJahr: number; // Monatsabrechnung!Q9
  grundlohnJahr: number; // Q10 ("Selbstkosten Jahr" in Kunden-Auswertung)
  dgAbgabenJahr: number; // Rückstellungen!P9
  rueckstellungUrlaubsgeldJahr: number; // AC9
  rueckstellungWeihnachtsgeldJahr: number; // AP9
  abgabenUndRueckstellungenJahr: number; // AQ9
  /** Summe der monatlich belasteten UZ/WR-Anteile */
  sonderzahlungsanteilJahr: number;
  db1Jahr: number; // Q11
  db1Marge: number; // R11 = Q11/Q9
  rueckstellungZufuehrungJahr: number;
  rueckstellungAufloesungJahr: number;
  rueckstellungStand: number; // Zuführung − Auflösung (offene UZ/WR-Rückstellung Jahresende)
}

/**
 * Basis für die Sonderzahlungs-Rückstellung – exakt wie Excel Rückstellungen!Q9:
 * AVERAGE über die erfassten Grundlöhne der Monate Jän–Mai, Jul–Okt, Dez
 * (Juni und November – die Auszahlungsmonate von UZ/WR – bleiben außen vor).
 * Leere Monate werden wie in Excel AVERAGE ignoriert.
 */
export function rueckstellungsBasis(grundlohn: Monatswerte): number {
  const idx = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11];
  const werte = idx.map((i) => grundlohn[i]).filter((v): v is number => v != null);
  if (werte.length === 0) return 0;
  return werte.reduce((a, b) => a + b, 0) / werte.length;
}

export interface RueckstellungOptionen {
  /** Tatsächliche Selbstkosten je Monat lt. Lohnüberweisung/Lohnbüro (inkl. DG-Abgaben). Wenn gesetzt, ersetzen sie Grundlohn + kalkulierte Abgaben. */
  selbstkostenIst?: Monatswerte;
  /** davon Sonderzahlung (UZ/WR inkl. Abgaben) je Monat – wird aus den Ist-Kosten herausgerechnet und löst die Rückstellung auf. */
  sonderzahlungIst?: Monatswerte;
  /** Rückstellungen für Urlaubs-/Weihnachtsgeld im DB mitrechnen (Excel-Logik). Standard: nein – UZ/WR laufen als Rückstellungskonto außerhalb des DB. */
  sonderzahlungsRueckstellung?: boolean;
}

export function rueckstellungenJahr(
  verrechnung: Monatswerte,
  grundlohn: Monatswerte,
  s: AbgabenSaetze,
  opt: RueckstellungOptionen = {},
): RueckstellungJahr {
  const a = abgeleiteteSaetze(s);
  const basis = rueckstellungsBasis(grundlohn);
  const monate: RueckstellungMonat[] = [];
  let stand = 0;
  for (let i = 0; i < 12; i++) {
    const ist = opt.selbstkostenIst?.[i] ?? null;
    const gl = grundlohn[i] ?? (ist != null ? 0 : null);
    const v = verrechnung[i] ?? 0;
    const erfasst = gl != null;
    const g = gl ?? 0;
    // Ist-Selbstkosten vorhanden → Abgaben = Differenz zum Grundlohn, keine kalkulatorischen Rückstellungen
    const sz = opt.sonderzahlungIst?.[i] ?? 0;
    const dg = ist != null ? Math.max(0, ist - sz - g) : g * a.dgAbgabenAufGrundlohn; // D9 – Sonderzahlung bleibt außerhalb des DB
    const rst = opt.sonderzahlungsRueckstellung === true && ist == null;
    const ug = rst && erfasst ? basis * s.rueckstellungUrlaubsgeld * (1 + a.dgAbgabenOhneWbf) : 0; // Q9
    const wg = rst && erfasst ? basis * s.rueckstellungWeihnachtsgeld * (1 + a.dgAbgabenOhneWbf) : 0; // AD9
    // Rückstellungskonto UZ/WR: je verrechnetem Monat anteilig zuführen (auf Basis des
    // Monatsgrundlohns), bei Auszahlung auflösen.
    const zuf = erfasst && g > 0 ? g * (s.rueckstellungUrlaubsgeld + s.rueckstellungWeihnachtsgeld) * (1 + a.dgAbgabenOhneWbf) : 0;
    stand += zuf - sz;

    // Was der Monat wirklich kostet.
    //
    // Urlaubs- und Weihnachtsgeld werden im Juni und November ausbezahlt, verdient werden sie aber
    // das ganze Jahr über. Wer sie nur in den Auszahlungsmonaten belastet, hat zehn Monate mit einem
    // zu schönen DB1 und zwei Monate, in denen der Einsatz plötzlich ein Verlustgeschäft scheint.
    // Für die Preisfindung ist das unbrauchbar. Deshalb trägt jeder Monat seinen Anteil (die
    // Zuführung), und die Auszahlung selbst belastet nicht noch einmal – sie löst die Rückstellung
    // auf (`dg` rechnet die Sonderzahlung aus den Ist-Kosten heraus).
    //
    // Der Excel-Vergleich (`sonderzahlungsRueckstellung: true`) rechnet weiter mit dem
    // Jahresdurchschnitt aus dem WIFI-Schema – damit die Kontrollrechnung gegen die Vorlage stimmt.
    // Nie beides: sonst wären die Sonderzahlungen doppelt drin.
    const sonderzahlungsanteil = rst ? ug + wg : zuf;
    monate.push({
      sonderzahlung: sz,
      rueckstellungZufuehrung: zuf,
      rueckstellungAufloesung: sz,
      rueckstellungStand: stand,
      monat: i + 1,
      verrechnung: v,
      grundlohn: g,
      dgAbgaben: dg,
      rueckstellungUrlaubsgeld: ug,
      rueckstellungWeihnachtsgeld: wg,
      /** Anteil für UZ/WR, der diesen Monat belastet – aus dem Excel-Schema oder als Zuführung */
      sonderzahlungsanteil,
      selbstkostenGesamt: g + dg + sonderzahlungsanteil,
      db1: v - g - dg - sonderzahlungsanteil, // Monatsabrechnung!E11
    });
  }
  const sum = (f: (m: RueckstellungMonat) => number) => monate.reduce((acc, m) => acc + f(m), 0);
  const verrechnungJahr = sum((m) => m.verrechnung);
  const db1Jahr = sum((m) => m.db1);
  const dgJ = sum((m) => m.dgAbgaben);
  const ugJ = sum((m) => m.rueckstellungUrlaubsgeld);
  const wgJ = sum((m) => m.rueckstellungWeihnachtsgeld);
  const szJ = sum((m) => m.sonderzahlungsanteil);
  return {
    monate,
    verrechnungJahr,
    grundlohnJahr: sum((m) => m.grundlohn),
    dgAbgabenJahr: dgJ,
    rueckstellungUrlaubsgeldJahr: ugJ,
    rueckstellungWeihnachtsgeldJahr: wgJ,
    abgabenUndRueckstellungenJahr: dgJ + szJ,
    sonderzahlungsanteilJahr: szJ,
    db1Jahr,
    db1Marge: verrechnungJahr ? db1Jahr / verrechnungJahr : 0,
    rueckstellungZufuehrungJahr: sum((m) => m.rueckstellungZufuehrung),
    rueckstellungAufloesungJahr: sum((m) => m.rueckstellungAufloesung),
    rueckstellungStand: stand,
  };
}

/**
 * Kontrollrechnung (Prompt, Abschnitt E): Bei 12 gleichen Monatslöhnen muss
 * Grundlohn × 12 × Payroll-Faktor der Summe aus Grundlohn + DG-Abgaben + RSt UG + RSt WG entsprechen.
 */
export function kontrollrechnung(grundlohnMonat: number, s: AbgabenSaetze): { links: number; rechts: number; differenz: number } {
  const a = abgeleiteteSaetze(s);
  const links = grundlohnMonat * 12 * a.payrollFaktor;
  const j = rueckstellungenJahr(Array(12).fill(0), Array(12).fill(grundlohnMonat), s, { sonderzahlungsRueckstellung: true });
  const rechts = j.grundlohnJahr + j.abgabenUndRueckstellungenJahr;
  return { links, rechts, differenz: links - rechts };
}

/** Rundung auf Cent (kaufmännisch) – nur für die Anzeige, intern wird ungerundet gerechnet */
export const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
