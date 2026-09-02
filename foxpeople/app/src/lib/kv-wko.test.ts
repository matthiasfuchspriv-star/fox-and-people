import { describe, it, expect } from "vitest";
import { KV_WKO, naechsterTermin } from "./kv-wko";
import { REFERENZ_KV } from "./referenzlohn";

describe("KV-Übersicht", () => {
  it("kennt zu jedem hinterlegten Referenz-KV eine WKO-Quelle", () => {
    const fehlend = REFERENZ_KV.map((k) => k.kuerzel).filter((k) => !KV_WKO[k]);
    expect(fehlend).toEqual([]);
  });

  it("jede Quelle hat einen Link auf wko.at", () => {
    for (const [k, info] of Object.entries(KV_WKO)) {
      expect(info.url, k).toMatch(/^https:\/\/www\.wko\.at\//);
      expect(info.titel.length, k).toBeGreaterThan(10);
    }
  });

  it("ein unbestätigter Termin behauptet kein Datum", () => {
    for (const [k, info] of Object.entries(KV_WKO)) {
      if (!info.bestaetigt && info.turnus) expect(info.stand, `${k}: unbestätigt, aber mit Turnus`).toBeDefined();
    }
  });

  it("rechnet den nächsten Termin auf den kommenden Stichtag", () => {
    // Metall erhöht am 1.11. – im September 2026 ist der nächste Termin der 1.11.2026,
    // im Dezember 2026 bereits der 1.11.2027.
    expect(naechsterTermin(KV_WKO.MTI, new Date("2026-09-01T00:00:00Z"))?.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(naechsterTermin(KV_WKO.MTI, new Date("2026-12-01T00:00:00Z"))?.toISOString().slice(0, 10)).toBe("2027-11-01");
    // Handel am 1.1.
    expect(naechsterTermin(KV_WKO.HANDEL, new Date("2026-09-01T00:00:00Z"))?.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("ohne Turnus wird kein Termin erfunden", () => {
    expect(naechsterTermin(KV_WKO.GASTRO, new Date("2026-09-01T00:00:00Z"))).toBeNull();
    expect(naechsterTermin(KV_WKO.TEXTIL, new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });
});
