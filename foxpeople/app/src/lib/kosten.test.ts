import { describe, it, expect } from "vitest";
import { KOSTENKATEGORIEN } from "./kosten";

describe("Kostenkategorien", () => {
  it("deckt die Posten ab, die den DB2 wirklich belasten", () => {
    for (const k of ["Personal (eigene Angestellte)", "Miete & Betriebskosten", "Software & IT", "Fahrzeuge"]) {
      expect(KOSTENKATEGORIEN).toContain(k);
    }
  });
});
