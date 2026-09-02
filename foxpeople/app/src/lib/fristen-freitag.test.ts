import { describe, it, expect } from "vitest";
import { endeBeiKuendigung, FRISTEN_DEFAULT } from "./fristen";

describe("Kündigungsfristen Arbeiter – zum Freitag", () => {
  const eintritt = new Date(2025, 0, 7);
  it("Dienstgeber: 21 Tage, Ende am nächsten Freitag", () => {
    const r = endeBeiKuendigung(FRISTEN_DEFAULT.arbeiterDienstgeber, eintritt, new Date(2026, 8, 1)); // Di 1.9.2026
    expect(r.ende.getDay()).toBe(5);
    expect(r.ende >= new Date(2026, 8, 22)).toBe(true); // 1.9. + 21 Tage = 22.9. (Di) → Fr 25.9.
    expect(r.ende.getDate()).toBe(25);
  });
  it("Dienstnehmer: 14 Tage, Ende am Freitag", () => {
    const r = endeBeiKuendigung(FRISTEN_DEFAULT.arbeiterDienstnehmer, eintritt, new Date(2026, 8, 4)); // Fr 4.9.2026 → 18.9. ist Freitag
    expect(r.ende.getDay()).toBe(5);
    expect(r.ende.getDate()).toBe(18);
  });
});
