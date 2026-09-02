import { describe, it, expect } from "vitest";
import { PLZ_ORTE, orteAusTabelle } from "./plz-orte";

describe("Postleitzahlen-Tabelle", () => {
  it("kennt die Orte aus dem eigenen Einzugsgebiet", () => {
    expect(orteAusTabelle("3233")).toContain("Kilb");
    expect(orteAusTabelle("3100")).toContain("St. Pölten");
    expect(orteAusTabelle("1010")).toContain("Wien");
  });

  it("liefert für Unbekanntes eine leere Liste statt undefined", () => {
    expect(orteAusTabelle("9999")).toEqual([]);
    expect(orteAusTabelle("")).toEqual([]);
    expect(orteAusTabelle("abc")).toEqual([]);
  });

  it("enthält keine Dubletten und keine leeren Ortsnamen", () => {
    for (const [plz, orte] of Object.entries(PLZ_ORTE)) {
      expect(orte.length, plz).toBeGreaterThan(0);
      expect(new Set(orte.map((o) => o.toLowerCase())).size, plz).toBe(orte.length);
      for (const o of orte) expect(o.trim().length, `${plz}: "${o}"`).toBeGreaterThan(1);
    }
  });
});
