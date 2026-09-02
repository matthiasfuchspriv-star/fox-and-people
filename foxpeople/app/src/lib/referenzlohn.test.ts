import { describe, it, expect } from "vitest";
import { REFERENZ_KV, vorrueckungsstufe, MONATSTEILER_STANDARD } from "./referenzlohn";
import { mindestlohnAbsolut } from "./mindestlohn-regel";

describe("Referenzlohn-Datenbank", () => {
  it("hat die metalltechnische Industrie mit zwei Lohntafeln und den Gruppen A–K", () => {
    const mti = REFERENZ_KV.find((k) => k.kuerzel === "MTI")!;
    expect(mti.tafeln).toHaveLength(2);
    expect(mti.tafeln![0].gultigAb).toBe("2025-11-01");
    expect(mti.tafeln![1].gultigAb).toBe("2026-11-01");
    for (const t of mti.tafeln!) expect(t.stufen.map((s) => s.bg)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
  });

  it("rechnet den Monatslohn der Gruppe D mit dem Teiler 167 in einen Stundenlohn um", () => {
    const mti = REFERENZ_KV.find((k) => k.kuerzel === "MTI")!;
    const d2026 = mti.tafeln![1].stufen.find((s) => s.bg === "D")!;
    expect(d2026.grund).toBe(3009.8);
    expect(Math.round((d2026.grund / MONATSTEILER_STANDARD) * 100) / 100).toBe(18.02);
  });

  it("liegt in jeder Gruppe über der Hausregel von 13,90 €", () => {
    const mti = REFERENZ_KV.find((k) => k.kuerzel === "MTI")!;
    for (const s of mti.tafeln![1].stufen) expect(s.grund / MONATSTEILER_STANDARD).toBeGreaterThan(mindestlohnAbsolut(new Date("2026-08-30")));
  });

  it("markiert alle übrigen KV als „Referenzzuschlag prüfen“", () => {
    for (const k of REFERENZ_KV.filter((x) => x.kuerzel !== "MTI")) {
      expect(k.tafeln).toBeUndefined();
      expect(k.hinweis).toMatch(/Referenzzuschlag/);
    }
  });

  it("ermittelt die Vorrückungsstufe aus dem Eintrittsdatum", () => {
    const am = new Date("2026-08-30");
    expect(vorrueckungsstufe(new Date("2026-01-01"), am)).toBe("Grundstufe");
    expect(vorrueckungsstufe(new Date("2023-01-01"), am)).toBe("nach 2 Jahren");
    expect(vorrueckungsstufe(new Date("2020-01-01"), am)).toBe("nach 4 Jahren");
    expect(vorrueckungsstufe(null, am)).toBe("Grundstufe");
  });
});

import { aktuelleLohnstufen } from "./referenzlohn";

describe("Lohntafel: nur der zum Stichtag gültige Stand", () => {
  const stufen = [
    { beschaeftigungsgruppe: "A", gultigAb: new Date("2025-11-01"), mindestStundenlohn: 15.39 },
    { beschaeftigungsgruppe: "A", gultigAb: new Date("2026-11-01"), mindestStundenlohn: 15.71 },
    { beschaeftigungsgruppe: "B", gultigAb: new Date("2025-11-01"), mindestStundenlohn: 15.39 },
    { beschaeftigungsgruppe: "B", gultigAb: new Date("2026-11-01"), mindestStundenlohn: 15.71 },
  ];
  it("vor dem Stichtag gilt der alte Stand – jede Gruppe genau einmal", () => {
    const heute = aktuelleLohnstufen(stufen, new Date("2026-09-01"));
    expect(heute).toHaveLength(2);
    expect(heute.find((s) => s.beschaeftigungsgruppe === "A")?.mindestStundenlohn).toBe(15.39);
  });
  it("ab dem Stichtag gilt der neue Stand", () => {
    const spaeter = aktuelleLohnstufen(stufen, new Date("2026-11-01"));
    expect(spaeter.find((s) => s.beschaeftigungsgruppe === "A")?.mindestStundenlohn).toBe(15.71);
  });
  it("gibt es nur künftige Stände, gilt der früheste davon", () => {
    const nurZukunft = aktuelleLohnstufen(stufen.filter((s) => s.gultigAb!.getFullYear() === 2026), new Date("2026-01-01"));
    expect(nurZukunft.find((s) => s.beschaeftigungsgruppe === "A")?.mindestStundenlohn).toBe(15.71);
  });
});
