import { describe, it, expect } from "vitest";
import { rueckstellungenJahr, SAETZE_2023, cent } from "./kalkulation";

const leer = () => Array(12).fill(null) as (number | null)[];

/**
 * Der Fall aus der Monatsabrechnung vom 1.9.2026 (TEST TEST bei Vet-Concept):
 * 169,4 h × 32,21 € = 5.456,37 Verrechnung, Bruttolohn 2.354,66, Lohnkosten lt. Lohnprogramm 3.018.
 *
 * Vorher zeigte die Software einen DB1 von 2.438,37 – das war die Verrechnung minus die
 * Lohnkosten des Monats. Darin fehlt der Anteil für Urlaubs- und Weihnachtsgeld: Der wird im Juni
 * und November ausbezahlt, verdient wird er aber jeden Monat.
 */
describe("UZ/WR im DB1 der Monatsabrechnung", () => {
  const v = leer(); v[8] = 5456.37;
  const g = leer(); g[8] = 2354.66;
  const ist = leer(); ist[8] = 3018;

  it("belastet den Monat mit dem anteiligen Urlaubs- und Weihnachtsgeld", () => {
    const j = rueckstellungenJahr(v, g, SAETZE_2023, { selbstkostenIst: ist });
    const m = j.monate[8];
    // 2.354,66 × (1/12 + 1/12) × (1 + DG-Abgaben ohne Wohnbauförderung 29,49 %)
    expect(cent(m.sonderzahlungsanteil)).toBeCloseTo(508.18, 1);
    expect(cent(m.dgAbgaben)).toBeCloseTo(663.34, 2);
    expect(cent(m.selbstkostenGesamt)).toBeCloseTo(3526.18, 1);
    // Vorher 2.438,37 – die Differenz ist genau der UZ/WR-Anteil
    expect(cent(m.db1)).toBeCloseTo(1930.19, 1);
    expect(m.db1 / m.verrechnung).toBeCloseTo(0.354, 2);
  });

  it("belastet die Auszahlung nicht ein zweites Mal", () => {
    // Juni: Urlaubszuschuss ausbezahlt, in den Ist-Lohnkosten enthalten
    const v2 = leer(); v2[5] = 5456.37; v2[8] = 5456.37;
    const g2 = leer(); g2[5] = 2354.66; g2[8] = 2354.66;
    const ist2 = leer(); ist2[5] = 3018 + 2800; ist2[8] = 3018;
    const sz2 = leer(); sz2[5] = 2800;
    const j = rueckstellungenJahr(v2, g2, SAETZE_2023, { selbstkostenIst: ist2, sonderzahlungIst: sz2 });
    // Der Juni trägt denselben Anteil wie der September – die Auszahlung geht gegen die Rückstellung
    expect(cent(j.monate[5].db1)).toBeCloseTo(cent(j.monate[8].db1), 1);
    expect(cent(j.monate[5].rueckstellungAufloesung)).toBe(2800);
  });

  it("führt dem Rückstellungskonto genau das zu, was den DB1 belastet", () => {
    const j = rueckstellungenJahr(v, g, SAETZE_2023, { selbstkostenIst: ist });
    expect(cent(j.monate[8].rueckstellungZufuehrung)).toBe(cent(j.monate[8].sonderzahlungsanteil));
  });

  it("rechnet auch ohne Ist-Lohnkosten mit dem Anteil", () => {
    const j = rueckstellungenJahr(v, g, SAETZE_2023);
    expect(j.monate[8].sonderzahlungsanteil).toBeGreaterThan(500);
    expect(j.monate[8].db1).toBeLessThan(5456.37 - 2354.66);
  });

  it("belastet einen Monat ohne Lohn nicht", () => {
    const j = rueckstellungenJahr(leer(), leer(), SAETZE_2023);
    expect(j.sonderzahlungsanteilJahr).toBe(0);
    expect(j.db1Jahr).toBe(0);
  });

  it("rechnet im Excel-Vergleich weiter nach dem WIFI-Schema", () => {
    // Diese Betriebsart hält die Kontrollrechnung gegen die Vorlage – dort kommt der
    // Jahresdurchschnitt zum Tragen, nicht die monatliche Zuführung. Nie beides zugleich.
    const g3 = Array(12).fill(2354.66) as number[];
    const j = rueckstellungenJahr(Array(12).fill(0), g3, SAETZE_2023, { sonderzahlungsRueckstellung: true });
    expect(cent(j.monate[0].sonderzahlungsanteil)).toBe(cent(j.monate[0].rueckstellungUrlaubsgeld + j.monate[0].rueckstellungWeihnachtsgeld));
  });
});
