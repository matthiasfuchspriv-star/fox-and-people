import { describe, it, expect } from "vitest";
import { isoWoche, montagDerKw, feiertageAT, arbeitstageKw, wochenImMonat } from "./wochen";
import { distanzKm, plzNaeherung } from "./geo";

describe("Kalenderwochen & Feiertage", () => {
  it("ISO-Woche: 1.1.2026 liegt in KW 1, 31.12.2024 in KW 1/2025", () => {
    expect(isoWoche(new Date(2026, 0, 1))).toEqual({ jahr: 2026, kw: 1 });
    expect(isoWoche(new Date(2024, 11, 31))).toEqual({ jahr: 2025, kw: 1 });
  });
  it("Montag der KW 36/2026 ist der 31.08.2026", () => expect(montagDerKw(2026, 36).toISOString().slice(0, 10)).toBe("2026-08-31"));
  it("Feiertage 2026: Ostermontag 06.04., Fronleichnam 04.06., Nationalfeiertag 26.10.", () => {
    const f = feiertageAT(2026);
    expect(f.has("2026-04-06")).toBe(true); expect(f.has("2026-06-04")).toBe(true); expect(f.has("2026-10-26")).toBe(true); expect(f.has("2026-05-01")).toBe(true);
  });
  it("KW mit Feiertag hat 4 Arbeitstage (KW 18/2026 enthält 1. Mai)", () => expect(arbeitstageKw(2026, 18)).toBe(4));
  it("Arbeitstage auf Monat begrenzt: KW 36/2026 hat im August nur den 31.08.", () => expect(arbeitstageKw(2026, 36, { jahr: 2026, monat: 8 })).toBe(1));
  it("August 2026 berührt 6 Kalenderwochen (KW 31–36)", () => { const w = wochenImMonat(2026, 8); expect(w[0].kw).toBe(31); expect(w.length).toBe(6); });
});

describe("Entfernung", () => {
  it("Kilb → St. Pölten ca. 25–40 Straßenkilometer", () => { const km = distanzKm({ lat: 48.10, lon: 15.41 }, { lat: 48.20, lon: 15.63 }); expect(km).toBeGreaterThan(20); expect(km).toBeLessThan(45); });
  it("PLZ-Näherung liefert Koordinaten für 3233", () => expect(plzNaeherung("3233")).not.toBeNull());
});

import { werktageZwischen } from "./wochen";

describe("Werktage für die Urlaubsrechnung", () => {
  it("eine Woche Mo–So kostet 5 Tage, nicht 7", () => {
    expect(werktageZwischen(new Date("2026-09-07"), new Date("2026-09-13"))).toBe(5);
  });
  it("Feiertage werden nicht mitgezählt (26.10.2026 ist ein Montag)", () => {
    expect(werktageZwischen(new Date("2026-10-26"), new Date("2026-10-30"))).toBe(4);
  });
  it("ein einzelner Samstag kostet nichts", () => {
    expect(werktageZwischen(new Date("2026-09-12"), new Date("2026-09-12"))).toBe(0);
  });
  it("zwei Wochen inklusive Wochenenden ergeben 10 Werktage", () => {
    expect(werktageZwischen(new Date("2026-09-07"), new Date("2026-09-20"))).toBe(10);
  });
});
