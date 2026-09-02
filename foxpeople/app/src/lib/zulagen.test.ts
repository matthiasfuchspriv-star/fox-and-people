import { describe, it, expect } from "vitest";
import { zulagenProStunde, zulageProStunde, type EinsatzZulage } from "./zulagen";

const z = (p: Partial<EinsatzZulage>): EinsatzZulage =>
  ({ kuerzel: "X", name: "X", art: "EURO_STUNDE", wert: 1, weiterverrechnen: true, steuerfrei: false, ...p });

describe("Zulagen je Stunde", () => {
  it("rechnet Tag und Monat auf die Stunde herunter", () => {
    expect(zulageProStunde({ art: "EURO_TAG", wert: 26.4 }, null)).toBeCloseTo(3.3, 4);
    expect(zulageProStunde({ art: "EURO_MONAT", wert: 173 }, null)).toBeCloseTo(1, 4);
    expect(zulageProStunde({ art: "PROZENT_STUNDENLOHN", wert: 10 }, 15)).toBeCloseTo(1.5, 4);
  });

  it("verrechnet den eigenen Verkaufssatz, wenn einer hinterlegt ist", () => {
    // Lohn 0,60 €, ausgehandelt sind aber 1,20 € an den Kunden
    const r = zulagenProStunde([z({ wert: 0.6, verkaufssatz: 1.2 })], 15);
    expect(r.lohn).toBeCloseTo(0.6, 4);
    expect(r.weiter).toBeCloseTo(1.2, 4);
  });

  it("bleibt ohne eigenen Verkaufssatz bei der bisherigen Rechnung", () => {
    const r = zulagenProStunde([z({ wert: 0.6 })], 15);
    expect(r.weiter).toBeCloseTo(0.6, 4);
  });

  it("verrechnet nichts weiter, was nicht weiterverrechnet wird", () => {
    const r = zulagenProStunde([z({ wert: 0.6, verkaufssatz: 1.2, weiterverrechnen: false })], 15);
    expect(r.lohn).toBeCloseTo(0.6, 4);
    expect(r.weiter).toBe(0);
  });
});
