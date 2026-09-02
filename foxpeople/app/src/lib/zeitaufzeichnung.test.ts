import { describe, it, expect } from "vitest";
import { minutenAusZeit, stundenAusZeit, pflichtpauseMinuten, berechneWoche } from "./zeitaufzeichnung";
import { tageDerKw } from "./wochen";

describe("Arbeitszeitaufzeichnung (AZG)", () => {
  it("liest Uhrzeiten und rechnet Netto-Arbeitszeit inkl. Pause", () => {
    expect(minutenAusZeit("07:30")).toBe(450);
    expect(minutenAusZeit("")).toBeNull();
    expect(stundenAusZeit("07:00", "16:00", 30)).toBe(8.5);
    expect(stundenAusZeit("07:00", "15:30", 30)).toBe(8);
  });

  it("rechnet Nachtschichten über Mitternacht", () => {
    expect(stundenAusZeit("22:00", "06:00", 30)).toBe(7.5);
  });

  it("verlangt ab mehr als 6 Stunden eine halbe Stunde Pause", () => {
    expect(pflichtpauseMinuten(6)).toBe(0);
    expect(pflichtpauseMinuten(8.5)).toBe(30);
  });

  it("teilt eine normale Woche in Normal- und 50-%-Überstunden", () => {
    const daten = tageDerKw(2026, 36);
    const w = berechneWoche(
      [0, 1, 2, 3, 4].map(() => ({ beginn: "07:00", ende: "16:00", pauseMin: 30 })),
      { daten, tagesnormal: 8, wochennormal: 38.5 },
    );
    expect(w.summe).toBe(42.5);
    expect(w.normal).toBe(38.5);
    expect(w.ue50).toBe(4);
    expect(w.ue100).toBe(0);
  });

  it("wertet Sonntagsstunden als 100-%-Überstunden", () => {
    const daten = tageDerKw(2026, 36);
    const e = Array.from({ length: 7 }, (_, i) => (i === 6 ? { beginn: "08:00", ende: "12:00", pauseMin: 0 } : {}));
    const w = berechneWoche(e, { daten });
    expect(w.ue100).toBe(4);
    expect(w.normal).toBe(0);
  });

  it("warnt bei fehlender Pause, zu langem Tag und zu kurzer Ruhezeit", () => {
    const w = berechneWoche([{ beginn: "06:00", ende: "20:00", pauseMin: 0 }, { beginn: "05:00", ende: "13:00", pauseMin: 30 }], { daten: tageDerKw(2026, 36) });
    expect(w.warnungen.some((x) => /Pause/.test(x))).toBe(true);
    expect(w.warnungen.some((x) => /12 Stunden/.test(x))).toBe(true);
    expect(w.warnungen.some((x) => /Ruhezeit/.test(x))).toBe(true);
  });

  it("lässt händisch eingetragene Überstunden unangetastet", () => {
    const w = berechneWoche([{ gesamt: 10, normal: 8, ue50: 2 }], { daten: tageDerKw(2026, 36) });
    expect(w.normal).toBe(8);
    expect(w.ue50).toBe(2);
  });
});
