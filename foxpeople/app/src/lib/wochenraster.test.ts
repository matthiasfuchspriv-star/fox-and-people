import { describe, it, expect } from "vitest";
import { wochenGanzImMonat, wochenImMonat } from "./wochen";

/**
 * Beim Löschen einer Monatsabrechnung geht das Wochenraster dieses Monats mit. Eine Woche über den
 * Monatswechsel gehört aber zur Hälfte in den Nachbarmonat – wer sie mitlöscht, reißt Daten weg, die
 * zu einem Monat gehören, den niemand angefasst hat.
 */
describe("wochenGanzImMonat", () => {
  it("lässt die Woche über den Monatswechsel aus", () => {
    // September 2026 beginnt an einem Dienstag – die KW mit dem 1.9. ragt in den August
    const alle = wochenImMonat(2026, 9);
    const ganz = wochenGanzImMonat(2026, 9);
    expect(ganz.length).toBeLessThan(alle.length);
    expect(ganz.every((w) => alle.some((a) => a.kw === w.kw))).toBe(true);
  });

  it("liefert für jeden Monat mindestens drei volle Wochen", () => {
    for (let m = 1; m <= 12; m++) expect(wochenGanzImMonat(2026, m).length).toBeGreaterThanOrEqual(3);
  });

  it("überschneidet sich nicht zwischen zwei Monaten", () => {
    // Keine Kalenderwoche darf zweimal gelöscht werden – sonst räumt der eine Monat dem anderen ab
    const alle = new Map<string, number>();
    for (let m = 1; m <= 12; m++) for (const w of wochenGanzImMonat(2026, m)) {
      const k = `${w.jahr}-${w.kw}`;
      alle.set(k, (alle.get(k) ?? 0) + 1);
    }
    expect([...alle.values()].every((n) => n === 1)).toBe(true);
  });
});
