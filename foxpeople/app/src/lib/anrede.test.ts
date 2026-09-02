import { describe, it, expect } from "vitest";
import { anredeZeile, grussformel } from "./anrede";

describe("Briefanrede", () => {
  it("siezt mit Nachname, wenn die Anrede hinterlegt ist", () => {
    expect(anredeZeile({ name: "Maria Huber", anrede: "Frau" })).toBe("Sehr geehrte Frau Huber,");
    expect(anredeZeile({ name: "Josef Bauer", anrede: "Herr" })).toBe("Sehr geehrter Herr Bauer,");
  });

  it("lässt Titel weg", () => {
    expect(anredeZeile({ name: "Mag. Anna Berger", anrede: "Frau" })).toBe("Sehr geehrte Frau Berger,");
  });

  it("duzt mit Vornamen, wenn es beim Ansprechpartner so hinterlegt ist", () => {
    expect(anredeZeile({ name: "Josef Bauer", anrede: "Herr", anredeDu: true })).toBe("Hallo Josef,");
    expect(grussformel({ name: "Josef Bauer", anredeDu: true })).toBe("Liebe Grüße");
  });

  it("nimmt die Voreinstellung des Kunden, wenn beim Ansprechpartner nichts steht", () => {
    expect(anredeZeile({ name: "Josef Bauer", anrede: "Herr", anredeDu: null }, true)).toBe("Hallo Josef,");
    expect(anredeZeile({ name: "Josef Bauer", anrede: "Herr", anredeDu: null }, false)).toBe("Sehr geehrter Herr Bauer,");
    // der Ansprechpartner schlägt die Voreinstellung
    expect(anredeZeile({ name: "Josef Bauer", anrede: "Herr", anredeDu: false }, true)).toBe("Sehr geehrter Herr Bauer,");
  });

  it("fällt ohne Ansprechpartner auf die allgemeine Anrede zurück", () => {
    expect(anredeZeile(null)).toBe("Sehr geehrte Damen und Herren,");
    expect(anredeZeile(null, true)).toBe("Hallo,");
    expect(anredeZeile({ name: "Josef Bauer" })).toBe("Sehr geehrte Damen und Herren,");
  });
});
