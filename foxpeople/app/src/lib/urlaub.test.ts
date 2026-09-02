import { describe, it, expect } from "vitest";
import { urlaubsstand, volleMonate } from "./urlaub";

describe("Urlaub monatlich freigeschaltet", () => {
  it("2,0833 Tage je vollem Monat", () => {
    const s = urlaubsstand({ status: "VERMITTELT", eintrittsdatum: new Date(2026, 0, 1), urlaubsanspruchTage: 25 }, 0, 2026, new Date(2026, 3, 1));
    expect(s.proMonat).toBe(2.0833);
    expect(s.monate).toBe(3);
    expect(s.erworben).toBe(6.25);
  });
  it("kein Anspruch für Bewerber / gesperrte", () => {
    expect(urlaubsstand({ status: "SUCHT", eintrittsdatum: new Date(2026, 0, 1), urlaubsanspruchTage: 25 }, 0, 2026).erworben).toBe(0);
    expect(urlaubsstand({ status: "GESPERRT", eintrittsdatum: null, urlaubsanspruchTage: 25 }, 0, 2026).aktiv).toBe(false);
  });
  it("Eintritt mitten im Jahr, maximal 12 Monate, Vorgriff negativ", () => {
    const s = urlaubsstand({ status: "VERMITTELT", eintrittsdatum: new Date(2026, 6, 15), urlaubsanspruchTage: 25 }, 5, 2026, new Date(2026, 9, 20));
    expect(s.monate).toBe(3);
    expect(s.rest).toBeCloseTo(6.25 - 5, 2);
    const voll = urlaubsstand({ status: "VERMITTELT", eintrittsdatum: new Date(2020, 0, 1), urlaubsanspruchTage: 25 }, 0, 2025, new Date(2026, 5, 1));
    expect(voll.monate).toBe(12);
    expect(voll.erworben).toBe(25);
  });
  it("volleMonate", () => {
    expect(volleMonate(new Date(2026, 0, 1), new Date(2026, 1, 1))).toBe(1);
    expect(volleMonate(new Date(2026, 0, 15), new Date(2026, 1, 14))).toBe(0);
  });
});
