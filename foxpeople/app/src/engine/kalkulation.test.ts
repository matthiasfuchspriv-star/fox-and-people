import { describe, it, expect } from "vitest";
import {
  SAETZE_2023,
  abgeleiteteSaetze,
  payroll,
  ueberlassung,
  rueckstellungenJahr,
  kontrollrechnung,
  verrechnungssatzFuerMarge,
  cent,
} from "./kalkulation";

// Referenzwerte: berechnete Zellwerte aus FoxandPeople_Verrechnungstool_korrigiert.xlsx
const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("Abgeleitete Sätze (Blatt Kalkulation)", () => {
  const a = abgeleiteteSaetze(SAETZE_2023);
  it("C13 SV gesamt = 21,03 %", () => near(a.svGesamt, 0.2103));
  it("C19 DG-Abgaben gesamt = 29,99 %", () => near(a.dgAbgabenGesamt, 0.2999));
  it("C20 DG-Abgaben ohne WBF = 29,49 %", () => near(a.dgAbgabenOhneWbf, 0.2949));
  it("C25 Sonderzahlungen Payroll = 16,66 %", () => near(a.sonderzahlungenPayroll, 0.1666));
  it("C27 Payroll-Aufschlag = 52,25303 %", () => near(a.payrollAufschlag, 0.52253034));
  it("C28 Payroll-Faktor = 1,52253034", () => near(a.payrollFaktor, 1.52253034));
  it("C45 Abwesenheiten = 30 %", () => near(a.abwesenheitenGesamt, 0.3));
  it("C48 Sonderzahlungen Überlassung = 21,64 %", () => near(a.sonderzahlungenUeberlassung, 0.2164));
  it("C50 Überlassungs-Aufschlag = 98,066836 %", () => near(a.ueberlassungsAufschlag, 0.98066836));
  it("C51 Überlassungs-Faktor = 1,98066836", () => near(a.ueberlassungsFaktor, 1.98066836));
  it("Rückstellungen!D6 DG-Abgaben auf Grundlohn = 30,68 %", () => near(a.dgAbgabenAufGrundlohn, 0.3068));
});

describe("Payroll-Kalkulation (Kalkulation!B31:L31)", () => {
  it("Bruttogehalt 3.000 → Selbstkosten 4.567,59; Aufschlag 800 → DB1 800, Verkaufsfaktor", () => {
    const p = payroll(3000, SAETZE_2023, 800);
    near(p.dgAbgaben, 3000 * 0.2999);
    near(p.sonderzahlungen, 3000 * 0.1666);
    near(p.dgAufSonderzahlungen, 3000 * 0.1666 * 0.2949);
    near(p.invalidenausgleichstaxe, 3000 * 0.0069);
    expect(cent(p.selbstkosten)).toBe(4567.59);
    near(p.faktor, 1.52253034);
    expect(cent(p.verkaufspreis!)).toBe(5367.59);
    expect(cent(p.db1!)).toBe(800);
    near(p.verkaufsfaktor!, 5367.59102 / 3000, 1e-6);
  });
  it("ohne Aufschlag bleiben Verkaufspreis/DB1 leer (Excel: \"\")", () => {
    const p = payroll(2500, SAETZE_2023);
    expect(p.verkaufspreis).toBeNull();
    expect(p.db1).toBeNull();
  });
});

describe("Überlassungskalkulation (Kalkulation!B54:I54, B63:I63)", () => {
  it("Stundenlohn 15 → Kalkulation/Std 29,71; Verrechnungssatz 34 → DB1 4,29, Marge 12,6 %, positiv", () => {
    const u = ueberlassung(15, SAETZE_2023, 34, 160);
    expect(cent(u.kalkulationProStunde)).toBe(cent(15 * 1.98066836));
    expect(cent(u.kalkulationProStunde)).toBe(29.71);
    expect(cent(u.db1ProStunde!)).toBe(4.29);
    near(u.db1Marge!, (34 - 15 * 1.98066836) / 34);
    expect(cent(u.db1ProMonat!)).toBe(cent((34 - 15 * 1.98066836) * 160));
    expect(cent(u.db1ProJahr!)).toBe(cent((34 - 15 * 1.98066836) * 160 * 12));
    expect(u.status).toBe("DB1 positiv");
  });
  it("Verrechnungssatz unter Selbstkosten → DB1 negativ", () => {
    const u = ueberlassung(15, SAETZE_2023, 25);
    expect(u.status).toBe("DB1 negativ");
    expect(u.db1ProStunde!).toBeLessThan(0);
  });
  it("ohne Verrechnungssatz kein Status (Excel: \"\")", () => {
    expect(ueberlassung(15, SAETZE_2023).status).toBeNull();
  });
  it("Zielmarge-Umkehrung: Satz für 20 % Marge ergibt wieder 20 %", () => {
    const satz = verrechnungssatzFuerMarge(18, SAETZE_2023, 0.2);
    near(ueberlassung(18, SAETZE_2023, satz).db1Marge!, 0.2);
  });
});

describe("Rückstellungen & DB1 je Monat (Blätter Rückstellungen/Monatsabrechnung, Zeile Huber Karl)", () => {
  // Excel: Verrechnung Jan 4.874,73 / Feb 4.378,00; Bruttolohn Jan 2.425,55 / Feb 2.321,30
  const verrechnung = [4874.73, 4378, ...Array(10).fill(null)];
  const grundlohn = [2425.55, 2321.3, ...Array(10).fill(null)];
  const j = rueckstellungenJahr(verrechnung, grundlohn, SAETZE_2023, { sonderzahlungsRueckstellung: true });
  it("Rückstellungen!D9 DG-Abgaben Jän = 744,15874", () => near(j.monate[0].dgAbgaben, 744.1587400000002, 1e-6));
  it("Rückstellungen!Q9 RSt Urlaubsgeld Jän = 256,1123 (Basis = Ø der erfassten Monate)", () =>
    near(j.monate[0].rueckstellungUrlaubsgeld, 256.1123360416666, 1e-6));
  it("Rückstellungen!AD9 RSt Weihnachtsgeld Jän = 256,1123", () =>
    near(j.monate[0].rueckstellungWeihnachtsgeld, 256.1123360416666, 1e-6));
  it("Monatsabrechnung!E11 DB1 Jän = 1.192,7966", () => near(j.monate[0].db1, 1192.7965879166659, 1e-6));
  it("Rückstellungen!P9 DG-Abgaben Jahr = 1.456,33358", () => near(j.dgAbgabenJahr, 1456.3335800000004, 1e-6));
  it("Rückstellungen!AC9 / AP9 RSt Jahr = 512,2247", () => {
    near(j.rueckstellungUrlaubsgeldJahr, 512.2246720833332, 1e-6);
    near(j.rueckstellungWeihnachtsgeldJahr, 512.2246720833332, 1e-6);
  });
  it("Rückstellungen!AQ9 Abgaben & Rückstellungen Jahr = 2.480,7829", () =>
    near(j.abgabenUndRueckstellungenJahr, 2480.782924166667, 1e-6));
  it("Monatsabrechnung!Q11 DB1 Jahr = 2.025,0971 und R11 Marge = 21,886 %", () => {
    near(j.db1Jahr, 2025.0970758333324, 1e-6);
    near(j.db1Marge, 0.21886481890569945, 1e-9);
  });
  it("nicht erfasste Monate erzeugen keine Rückstellung", () => {
    expect(j.monate[5].rueckstellungUrlaubsgeld).toBe(0);
    expect(j.monate[5].db1).toBe(0);
  });
});

describe("Kontrollrechnung Payroll-Faktor vs. Grundlohn + Abgaben + Rückstellungen", () => {
  it("Abweichung < 0,01 % (Excel: SZ-Satz 8,33 % vs. Rückstellungssatz 1/12)", () => {
    const k = kontrollrechnung(2500, SAETZE_2023);
    expect(Math.abs(k.differenz) / k.links).toBeLessThan(0.0001);
  });
  it("exakt gleich, wenn Rückstellungssatz = Sonderzahlungssatz", () => {
    const k = kontrollrechnung(2500, { ...SAETZE_2023, rueckstellungUrlaubsgeld: 0.0833, rueckstellungWeihnachtsgeld: 0.0833 });
    near(k.differenz, 0, 1e-9);
  });
});
