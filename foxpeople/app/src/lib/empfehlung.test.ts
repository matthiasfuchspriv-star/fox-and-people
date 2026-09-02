import { describe, it, expect } from "vitest";
import { empfehlungStand, EMPFEHLUNG_DEFAULT } from "./empfehlung";

const e = (status: string) => ({ status });

describe("Freunde werben Freunde – Prämienstand", () => {
  it("zählt nur erfolgreiche Empfehlungen", () => {
    const s = empfehlungStand([e("NEU"), e("KONTAKTIERT"), e("ABGELEHNT"), e("EINGESTELLT")], EMPFEHLUNG_DEFAULT);
    expect(s.eingereicht).toBe(4);
    expect(s.erfolgreich).toBe(1);
  });

  it("trennt ausbezahlte und noch offene Prämien", () => {
    const s = empfehlungStand([e("AUSBEZAHLT"), e("AUSBEZAHLT"), e("PRAEMIE_FAELLIG")], EMPFEHLUNG_DEFAULT);
    expect(s.ausbezahlt).toBe(200);
    expect(s.offen).toBe(100);
  });

  it("gibt je fünf erfolgreichen Empfehlungen 100 € Bonus", () => {
    const vier = empfehlungStand(Array.from({ length: 4 }, () => e("AUSBEZAHLT")), EMPFEHLUNG_DEFAULT);
    expect(vier.bonusBetrag).toBe(0);
    expect(vier.bisZumBonus).toBe(1);

    const fuenf = empfehlungStand(Array.from({ length: 5 }, () => e("AUSBEZAHLT")), EMPFEHLUNG_DEFAULT);
    expect(fuenf.bonusErreicht).toBe(1);
    expect(fuenf.bonusBetrag).toBe(100);
    expect(fuenf.gesamt).toBe(600); // 5 × 100 € Prämie + 100 € Bonus

    const elf = empfehlungStand(Array.from({ length: 11 }, () => e("AUSBEZAHLT")), EMPFEHLUNG_DEFAULT);
    expect(elf.bonusErreicht).toBe(2);
    expect(elf.bisZumBonus).toBe(4);
  });
});
