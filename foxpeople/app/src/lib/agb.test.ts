import { describe, it, expect } from "vitest";
import { uebernahmeHonorar, volleMonate } from "./agb";

describe("Übernahmegebühr (AGB Überlassung Punkt 6.1)", () => {
  it("verrechnet 30 % des Bruttojahresentgelts ohne Vorlaufmonate", () => {
    const r = uebernahmeHonorar({ bruttojahresentgelt: 40000, monateUeberlassen: 0 });
    expect(r.honorar).toBe(12000);
    expect(r.frei).toBe(false);
  });

  it("reduziert um 1/12 je vollem Überlassungsmonat", () => {
    const r = uebernahmeHonorar({ bruttojahresentgelt: 48000, monateUeberlassen: 6 });
    expect(r.honorar).toBe(7200); // 14.400 × 6/12
  });

  it("ist nach zwölf vollen Monaten kostenlos", () => {
    expect(uebernahmeHonorar({ bruttojahresentgelt: 48000, monateUeberlassen: 12 }).honorar).toBe(0);
    expect(uebernahmeHonorar({ bruttojahresentgelt: 48000, monateUeberlassen: 18 }).frei).toBe(true);
  });

  it("hält das Mindesthonorar von 2.500 € ein", () => {
    expect(uebernahmeHonorar({ bruttojahresentgelt: 30000, monateUeberlassen: 11 }).honorar).toBe(2500);
  });

  it("zählt nur volle Kalendermonate", () => {
    expect(volleMonate(new Date(2026, 0, 15), new Date(2026, 6, 14))).toBe(5);
    expect(volleMonate(new Date(2026, 0, 15), new Date(2026, 6, 15))).toBe(6);
    expect(volleMonate(new Date(2026, 5, 1), new Date(2026, 4, 1))).toBe(0);
  });
});
