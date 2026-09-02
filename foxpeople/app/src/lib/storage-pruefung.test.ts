import { describe, it, expect } from "vitest";
import { dateiPruefen, darfInline, DateiAbgelehnt, MAX_DATEI } from "./storage";

/**
 * Vorher wurde jede hochgeladene Datei mit dem vom Absender angegebenen Typ direkt im Browser angezeigt.
 * Eine HTML- oder SVG-Datei hätte damit fremdes JavaScript im Browser der Dispo ausgeführt.
 */
describe("Datei-Uploads", () => {
  it("nimmt PDF und Bilder an und zeigt sie im Browser", () => {
    expect(dateiPruefen("application/pdf", "vertrag.pdf", 1000)).toEqual({ mime: "application/pdf", inline: true });
    expect(dateiPruefen("image/jpeg", "foto.jpg", 1000).inline).toBe(true);
    expect(darfInline("image/png")).toBe(true);
  });

  it("lehnt HTML und SVG ab", () => {
    expect(() => dateiPruefen("text/html", "boese.html", 100)).toThrow(DateiAbgelehnt);
    expect(() => dateiPruefen("image/svg+xml", "boese.svg", 100)).toThrow(DateiAbgelehnt);
    expect(darfInline("text/html")).toBe(false);
  });

  it("lässt sich nicht über eine harmlose Endung austricksen", () => {
    expect(() => dateiPruefen("text/html", "foto.exe", 100)).toThrow(DateiAbgelehnt);
  });

  it("liefert Word und Excel als Download aus, nicht zur Anzeige", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(dateiPruefen(docx, "brief.docx", 1000).inline).toBe(false);
  });

  it("weist zu große Dateien ab", () => {
    expect(() => dateiPruefen("image/jpeg", "riesig.jpg", MAX_DATEI + 1)).toThrow(/zu groß/);
  });
});
