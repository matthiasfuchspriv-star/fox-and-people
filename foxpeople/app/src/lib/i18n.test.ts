import { describe, it, expect } from "vitest";
import { uebersetzer, istSprache, SPRACHEN } from "./i18n";

describe("Zweisprachigkeit der Mitarbeiter-App", () => {
  it("bietet genau Deutsch und Englisch an", () => {
    expect(SPRACHEN.map((s) => s.code)).toEqual(["de", "en"]);
  });

  it("fällt bei unbekannten Sprachen auf Deutsch zurück", () => {
    expect(istSprache("hu")).toBe("de");
    expect(istSprache(null)).toBe("de");
    expect(istSprache("en")).toBe("en");
  });

  it("übersetzt und ersetzt Platzhalter", () => {
    expect(uebersetzer("de")("start.stundenEintragen", { kw: 35 })).toBe("Stunden für KW 35 eintragen");
    expect(uebersetzer("en")("start.stundenEintragen", { kw: 35 })).toBe("Enter your hours for week 35");
  });

  it("liefert den deutschen Text, wenn die Übersetzung fehlt", () => {
    const t = uebersetzer("en");
    // jeder Schlüssel muss einen Text liefern – nie den Schlüssel selbst
    expect(t("nav.start")).toBe("Home");
    expect(t("abw.krankTitel")).not.toContain("abw.");
  });

  it("weist in beiden Sprachen darauf hin, dass die Krankmeldung telefonisch läuft", () => {
    expect(uebersetzer("de")("abw.krankText")).toMatch(/telefonisch/);
    expect(uebersetzer("en")("abw.krankText")).toMatch(/call us/i);
  });
});
