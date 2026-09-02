import { describe, it, expect } from "vitest";
import { cent, ustBetrag, summen } from "./geld";

/**
 * Der Anlass: Der Nettobetrag der Rechnung wurde aus ungerundeten Werten gebildet, die Positionen
 * aber einzeln gerundet – bis zu fünf Cent Abweichung wurden stillschweigend hingenommen. Auf dem
 * PDF summierten sich die Einzelposten damit nicht auf den ausgewiesenen Nettobetrag.
 */
describe("Geldbeträge", () => {
  it("rundet kaufmännisch, auch bei halben Cent", () => {
    expect(cent(1.005)).toBe(1.01);
    expect(cent(2.675)).toBe(2.68);
    expect(cent(0.145)).toBe(0.15);
    expect(cent(-1.005)).toBe(-1.01);
  });

  it("rechnet die Umsatzsteuer auf Cent", () => {
    expect(ustBetrag(1234.56, 20)).toBe(246.91);
    expect(ustBetrag(0, 20)).toBe(0);
  });

  it("bildet den Nettobetrag als Summe der Positionen – nicht umgekehrt", () => {
    const p = [{ betrag: 33.333 }, { betrag: 33.333 }, { betrag: 33.334 }];
    const s = summen(p, 20);
    const summeDerZeilen = p.reduce((a, x) => a + cent(x.betrag), 0);
    expect(s.netto).toBe(cent(summeDerZeilen));
    // 33,33 + 33,33 + 33,33 = 99,99 – und genau das steht auf der Rechnung. Vorher stand dort 100,00,
    // während die Positionen 99,99 ergaben; genau diese Abweichung soll es nicht mehr geben.
    expect(s.netto).toBe(99.99);
  });

  it("stellt sicher, dass Netto plus Umsatzsteuer exakt Brutto ergibt", () => {
    for (const betrag of [1, 19.99, 100.005, 4337.5, 12345.67]) {
      const s = summen([{ betrag }], 20);
      expect(cent(s.netto + s.ust)).toBe(s.brutto);
    }
  });

  it("kommt bei vielen Positionen ohne Cent-Drift aus", () => {
    const p = Array.from({ length: 250 }, () => ({ betrag: 12.345 }));
    const s = summen(p, 20);
    expect(s.netto).toBe(cent(250 * 12.35)); // jede Zeile einzeln gerundet
    expect(cent(s.netto + s.ust)).toBe(s.brutto);
  });
});
