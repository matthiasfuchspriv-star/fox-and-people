import { describe, it, expect } from "vitest";
import { berechneWoche, wochentage } from "./zeitaufzeichnung";

/**
 * Der Fehler, der diesen Test nötig macht: Das Stundenfeld war mit 8 vorbelegt und hatte Vorrang vor
 * Beginn und Ende. Wer 06:00 bis 17:30 mit 30 Minuten Pause eintrug und die 8 stehen ließ, bekam
 * 8 Stunden abgerechnet statt 11. Seit v2.5 gewinnen die Uhrzeiten.
 */
const woche = (eintraege: Parameters<typeof berechneWoche>[0]) =>
  berechneWoche(eintraege, { daten: wochentage(2026, 36).map((t) => t.datum), wochennormal: 38.5 });

describe("Stundenberechnung: Uhrzeiten schlagen die Handeingabe", () => {
  it("rechnet aus Beginn, Ende und Pause – auch wenn im Stundenfeld noch etwas steht", () => {
    const w = woche([{ beginn: "06:00", ende: "17:30", pauseMin: 30, gesamt: 8 }]);
    expect(w.tage[0].gesamt).toBe(11);
  });

  it("nimmt die Handeingabe nur, wenn keine Uhrzeiten da sind", () => {
    const w = woche([{ gesamt: 4 }]);
    expect(w.tage[0].gesamt).toBe(4);
  });

  it("zieht die Pause ab und kommt über Mitternacht zurecht", () => {
    expect(woche([{ beginn: "07:00", ende: "16:00", pauseMin: 30 }]).tage[0].gesamt).toBe(8.5);
    expect(woche([{ beginn: "22:00", ende: "06:00", pauseMin: 30 }]).tage[0].gesamt).toBe(7.5);
  });

  it("zählt eine 11-Stunden-Schicht als 8 Normalstunden plus 3 Überstunden mit 50 Prozent", () => {
    const w = woche([{ beginn: "06:00", ende: "17:30", pauseMin: 30 }]);
    expect(w.tage[0].normal).toBe(8);
    expect(w.tage[0].ue50).toBe(3);
    expect(w.tage[0].ue100).toBe(0);
  });

  it("warnt bei einer Tagesarbeitszeit über zwölf Stunden", () => {
    const w = woche([{ beginn: "05:00", ende: "18:30", pauseMin: 30 }]);
    expect(w.tage[0].gesamt).toBe(13);
    expect(w.warnungen.join(" ")).toMatch(/12 Stunden/);
  });
});
