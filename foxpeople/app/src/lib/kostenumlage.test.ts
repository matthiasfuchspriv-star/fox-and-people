import { describe, it, expect } from "vitest";

/**
 * Die Regel, nach der die erfassten Kosten gegen den DB1 gerechnet werden.
 *
 * Vorher musste jemand einen Betrag „je Mitarbeiter und Monat" schätzen und pflegen. Jetzt gilt:
 * Was im Monat wirklich an Kosten angefallen ist, wird auf die Mitarbeiter aufgeteilt, die in
 * diesem Monat tatsächlich im Einsatz waren. In Summe ist der DB2 damit exakt DB1 minus Kosten.
 */
function umlageJeMitarbeiter(monatskosten: number, aktiveMitarbeiter: number, rueckfall: number | null): number {
  if (aktiveMitarbeiter > 0 && monatskosten > 0) return monatskosten / aktiveMitarbeiter;
  return rueckfall ?? 0;
}

describe("Kostenumlage aus den erfassten Positionen", () => {
  it("teilt die Monatskosten auf die eingesetzten Mitarbeiter auf", () => {
    expect(umlageJeMitarbeiter(6000, 8, null)).toBe(750);
  });

  it("belastet bei einem einzigen Mitarbeiter die vollen Kosten", () => {
    expect(umlageJeMitarbeiter(6000, 1, null)).toBe(6000);
  });

  it("greift auf den von Hand gepflegten Satz zurück, solange keine Kosten erfasst sind", () => {
    expect(umlageJeMitarbeiter(0, 8, 500)).toBe(500);
  });

  it("rechnet ohne beides mit null statt mit einer Schätzung", () => {
    expect(umlageJeMitarbeiter(0, 8, null)).toBe(0);
  });

  it("in Summe ergibt DB2 genau DB1 minus die erfassten Kosten", () => {
    const db1JeMitarbeiter = [3000, 2500, 1800, 900];
    const kosten = 6000;
    const umlage = umlageJeMitarbeiter(kosten, db1JeMitarbeiter.length, null);
    const db2Summe = db1JeMitarbeiter.reduce((a, d) => a + (d - umlage), 0);
    expect(db2Summe).toBeCloseTo(db1JeMitarbeiter.reduce((a, d) => a + d, 0) - kosten, 6);
  });
});
