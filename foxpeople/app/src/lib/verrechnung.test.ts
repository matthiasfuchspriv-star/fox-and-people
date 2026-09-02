import { describe, it, expect } from "vitest";

/**
 * Reine Rechenprüfung der Verrechnungsformel – ohne Datenbank, mit denselben Regeln wie
 * `verrechnungAufschluesseln`. Der Anlass: In der Stundenbestätigung standen die Zuschläge fest
 * verdrahtet auf 35 und 70 Prozent, statt aus der Kundenkondition zu kommen. Bei jedem Kunden mit
 * abweichenden Zuschlägen wurde dadurch zu wenig verrechnet.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

function summe(o: { satz: number; zuschlag50: number; zuschlag100: number; normal: number; ue50: number; ue100: number; zulageProStunde?: number }) {
  const std = o.normal + o.ue50 + o.ue100;
  return r2(
    r2(o.normal * o.satz) +
    r2(o.ue50 * o.satz * (1 + o.zuschlag50)) +
    r2(o.ue100 * o.satz * (1 + o.zuschlag100)) +
    r2(std * (o.zulageProStunde ?? 0)),
  );
}

describe("Verrechnung je Einsatz", () => {
  it("rechnet mit den Standardzuschlägen 35 und 70 Prozent", () => {
    expect(summe({ satz: 25, zuschlag50: 0.35, zuschlag100: 0.7, normal: 160, ue50: 10, ue100: 0 })).toBe(4337.5);
  });

  it("nimmt abweichende Zuschläge der Kundenkondition – das war der Fehler", () => {
    const standard = summe({ satz: 25, zuschlag50: 0.35, zuschlag100: 0.7, normal: 160, ue50: 10, ue100: 5 });
    const kunde = summe({ satz: 25, zuschlag50: 0.5, zuschlag100: 1.0, normal: 160, ue50: 10, ue100: 5 });
    expect(kunde).toBeGreaterThan(standard);
    expect(kunde - standard).toBe(75); // 10 h × 25 × 0,15 + 5 h × 25 × 0,30
  });

  it("verrechnet Zulagen nur mit der erfassten Menge lt. Stundenzettel – nicht mehr pauschal auf alle Stunden", () => {
    // 160 Normalstunden, aber nur 62 Stunden in der 2. Schicht: verrechnet werden 62 × Zulagensatz.
    const zulage = r2(62 * 0.87);
    expect(zulage).toBe(53.94);
    // Keine Menge erfasst = keine Zulagenzeile (vorher: automatisch 160 Stunden angenommen).
    expect(summe({ satz: 25, zuschlag50: 0.35, zuschlag100: 0.7, normal: 160, ue50: 0, ue100: 0 })).toBe(4000);
  });

  it("liefert null Euro, wenn keine Stunden da sind", () => {
    expect(summe({ satz: 25, zuschlag50: 0.35, zuschlag100: 0.7, normal: 0, ue50: 0, ue100: 0 })).toBe(0);
  });
});

import { zulagenMengenLesen, konditionFuerRolle } from "./verrechnung";
import { zulageEinzelpreisVerkauf, zulageEinheit } from "./zulagen";

describe("Zulagen-Mengen", () => {
  it("liest nur positive Zahlen aus dem Json-Feld", () => {
    expect(zulagenMengenLesen({ SCHICHT2: 62, TAGGELD: 4, KAPUTT: "x", NEGATIV: -3, NULL: 0 })).toEqual({ SCHICHT2: 62, TAGGELD: 4 });
    expect(zulagenMengenLesen(null)).toEqual({});
    expect(zulagenMengenLesen([1, 2])).toEqual({});
  });
  it("Tagespauschalen zählen in Tagen, alles andere in Stunden", () => {
    expect(zulageEinheit({ art: "EURO_TAG" })).toBe("Tage");
    expect(zulageEinheit({ art: "EURO_STUNDE" })).toBe("Std.");
    expect(zulageEinheit({ art: "PROZENT_STUNDENLOHN" })).toBe("Std.");
  });
  it("Verkaufs-Einzelpreis: €/Std bzw. €/Tag, eigener Verkaufssatz je Stunde wird für den Tag ×8 gerechnet", () => {
    expect(zulageEinzelpreisVerkauf({ kuerzel: "SCHMUTZ", name: "", art: "EURO_STUNDE", wert: 0.6, weiterverrechnen: true, steuerfrei: true }, 15)).toBe(0.6);
    expect(zulageEinzelpreisVerkauf({ kuerzel: "SCHICHT2", name: "", art: "PROZENT_STUNDENLOHN", wert: 5, weiterverrechnen: true, steuerfrei: false }, 16)).toBe(0.8);
    expect(zulageEinzelpreisVerkauf({ kuerzel: "TAGGELD", name: "", art: "EURO_TAG", wert: 26.4, weiterverrechnen: true, steuerfrei: true }, 15)).toBe(26.4);
    expect(zulageEinzelpreisVerkauf({ kuerzel: "TAGGELD", name: "", art: "EURO_TAG", wert: 26.4, weiterverrechnen: true, steuerfrei: true, verkaufssatz: 4 }, 15)).toBe(32);
  });
});

describe("Kundenkondition zur Rolle", () => {
  const heute = new Date("2026-09-01");
  it("nur exakte Rollen-Übereinstimmung – kein stiller Rückfall auf eine fremde Rolle", () => {
    const konditionen = [{ rolle: "Schweißer", gultigVon: null, gultigBis: null }];
    expect(konditionFuerRolle(konditionen, "Staplerfahrer", heute)).toBeUndefined();
    expect(konditionFuerRolle(konditionen, "schweißer", heute)?.rolle).toBe("Schweißer");
  });
  it("abgelaufene Konditionen zählen nicht mehr", () => {
    const konditionen = [{ rolle: "Staplerfahrer", gultigVon: new Date("2025-01-01"), gultigBis: new Date("2025-12-31") }];
    expect(konditionFuerRolle(konditionen, "Staplerfahrer", heute)).toBeUndefined();
  });
});
