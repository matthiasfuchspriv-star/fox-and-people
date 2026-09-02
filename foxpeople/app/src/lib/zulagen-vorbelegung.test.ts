import { describe, it, expect } from "vitest";
import { zulageVorbelegt } from "./zulagen";

describe("zulageVorbelegt", () => {
  it("hakt an, was im angenommenen Angebot ausgewiesen ist", () => {
    expect(zulageVorbelegt({ kuerzel: "SCHMUTZ", imAngebot: true })).toBe(true);
  });

  it("hakt an, was zum KV des Beschäftigers gehört", () => {
    expect(zulageVorbelegt({ kuerzel: "SEG", passtKv: true })).toBe(true);
  });

  it("hakt an, was zum Schichtmodell gehört", () => {
    expect(zulageVorbelegt({ kuerzel: "NACHT", passtSchicht: true })).toBe(true);
  });

  it("lässt alles andere leer", () => {
    expect(zulageVorbelegt({ kuerzel: "SCHMUTZ" })).toBe(false);
  });

  it("respektiert die eigene Auswahl – auch das Abwählen eines Vorschlags", () => {
    // Angebot und KV sprächen dafür, der Mensch hat den Haken trotzdem entfernt
    expect(zulageVorbelegt({ kuerzel: "SCHMUTZ", ausUrl: "NACHT", imAngebot: true, passtKv: true })).toBe(false);
    expect(zulageVorbelegt({ kuerzel: "NACHT", ausUrl: "NACHT" })).toBe(true);
  });

  it("behandelt eine leere eigene Auswahl als „nichts angehakt“, nicht als „noch nicht gewählt“", () => {
    expect(zulageVorbelegt({ kuerzel: "SCHMUTZ", ausUrl: "", imAngebot: true })).toBe(false);
  });
});
