import { describe, it, expect } from "vitest";
import { brauchtAblaufdatum, istAusweis, istBewilligung, KATEGORIEN } from "./dokumente";

describe("Dokumentkategorien", () => {
  it("verlangt bei Ausweisen und Bewilligungen ein Ablaufdatum", () => {
    for (const k of ["Reisepass", "Personalausweis", "Aufenthaltstitel", "Arbeitserlaubnis", "Führerschein B"]) {
      expect(brauchtAblaufdatum(k), k).toBe(true);
    }
    for (const k of ["Lohnzettel", "Dienstvertrag", "Sonstiges", "Rechnung"]) {
      expect(brauchtAblaufdatum(k), k).toBe(false);
    }
  });

  it("erkennt Identitätsnachweis und Arbeitsmarktzugang getrennt", () => {
    expect(istAusweis("Reisepass")).toBe(true);
    expect(istAusweis("Arbeitserlaubnis")).toBe(false);
    expect(istBewilligung("Arbeitserlaubnis")).toBe(true);
    // Der Aufenthaltstitel ist beides – Ausweis und Arbeitsmarktzugang
    expect(istAusweis("Aufenthaltstitel") && istBewilligung("Aufenthaltstitel")).toBe(true);
  });

  it("bietet alle Pflicht-Kategorien auch in der Auswahlliste an", () => {
    for (const k of ["Reisepass", "Personalausweis", "Aufenthaltstitel", "Arbeitserlaubnis", "Führerschein B"]) {
      expect(KATEGORIEN).toContain(k);
    }
  });
});
