import { describe, it, expect } from "vitest";
import { monatsstunden, WOCHEN_JE_MONAT } from "./angebot-kalkulation";

describe("Wöchentliche Sollarbeitszeit", () => {
  it("rechnet Wochenstunden in Monatsstunden um", () => {
    expect(WOCHEN_JE_MONAT).toBeCloseTo(4.3333, 4);
    expect(monatsstunden(38.5)).toBe(166.83);
    expect(monatsstunden(40)).toBe(173.33);
    expect(monatsstunden(20)).toBe(86.67);
  });

  it("lässt leere Eingaben leer, statt null zu 0 zu machen", () => {
    expect(monatsstunden(null)).toBeNull();
    expect(monatsstunden(undefined)).toBeNull();
  });
});

describe("Zuschläge im Angebot", () => {
  // Entscheidung Matthias 31.08.2026: 50-%-Überstunde = +35 % auf den Verkaufssatz, 100 % = +70 %.
  // Genauso rechnet die Rechnung (Kondition.ueberstundenZuschlag / wochenendZuschlag) – Angebot und
  // Rechnung dürfen nie auseinanderlaufen.
  const satz = (grund: number, zuschlag: number) => Math.round(grund * (1 + zuschlag) * 100) / 100;
  it("rechnet die Überstundensätze wie die Rechnung", () => {
    expect(satz(24.5, 0.35)).toBe(33.08);
    expect(satz(24.5, 0.7)).toBe(41.65);
    expect(satz(27.53, 0.35)).toBe(37.17);
  });
});
