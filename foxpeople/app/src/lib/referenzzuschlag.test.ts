import { describe, it, expect } from "vitest";
import { referenzKvFuer, stundenlohnAusMonat, mitReferenzzuschlag, kvKuerzelAusText } from "./referenzlohn";
import { ccListe } from "./mail";

describe("referenzKvFuer", () => {
  const kunde = { referenzKvId: "kv-arbeiter", referenzKvAngestellteId: "kv-angestellte", kollektivvertrag: "KV Metallindustrie" };

  it("nimmt für einen Arbeiter die Arbeitertafel", () => {
    expect(referenzKvFuer(kunde, false)).toBe("kv-arbeiter");
  });

  it("nimmt für Angestellte die Angestelltentafel", () => {
    expect(referenzKvFuer(kunde, true)).toBe("kv-angestellte");
  });

  it("fällt für Angestellte auf die Arbeitertafel zurück, wenn keine eigene hinterlegt ist", () => {
    // Der grobe Vergleich ist besser als gar keiner – der Hinweis „Referenzzuschlag prüfen" bleibt.
    expect(referenzKvFuer({ ...kunde, referenzKvAngestellteId: null }, true)).toBe("kv-arbeiter");
  });

  it("nimmt den freien KV-Text, wenn keine Tafel verknüpft ist", () => {
    expect(referenzKvFuer({ referenzKvId: null, referenzKvAngestellteId: null, kollektivvertrag: "KV Handel" }, false)).toBe("KV Handel");
  });

  it("liefert null ohne Kunde", () => {
    expect(referenzKvFuer(null, false)).toBeNull();
  });
});

describe("ccListe", () => {
  it("trennt bei Komma und Semikolon und wirft Leerraum weg", () => {
    expect(ccListe("a@x.at, b@y.at ;c@z.at")).toEqual(["a@x.at", "b@y.at", "c@z.at"]);
  });
  it("ignoriert Einträge ohne @, statt eine kaputte Adresse zu senden", () => {
    expect(ccListe("buchhaltung, a@x.at")).toEqual(["a@x.at"]);
  });
  it("liefert für leer eine leere Liste", () => {
    expect(ccListe(null)).toEqual([]);
    expect(ccListe("  ")).toEqual([]);
  });
});

/**
 * Gegenprobe zur Lohnverrechnung: „ArbeiterInnen der Metalltechnischen Industrie", Stichtag
 * 1.11.2025, im Einsatzbetrieb. Die Werte stammen aus dem Bildschirmfoto vom 1.9.2026 – Monatslohn,
 * Stundenlohn und der Satz einschließlich Referenzzuschlag.
 */
describe("Metalltechnische Industrie 1.11.2025 gegen die Lohnverrechnung", () => {
  const std = (monat: number) => stundenlohnAusMonat(monat, 167);
  const mitZ = (monat: number, p: number) => mitReferenzzuschlag(std(monat), p);

  const zeilen: [string, number, number, number, number][] = [
    // BG, Monatslohn, Ref.Z %, erwarteter Stundenlohn, erwartet inkl. Zuschlag
    ["A", 2568.80, 9, 15.39, 16.78],
    ["B", 2568.80, 13, 15.39, 17.39],
    ["C", 2698.59, 13, 16.16, 18.26],
    ["D", 2947.89, 18, 17.66, 20.84],
    ["E", 3396.21, 18, 20.34, 24.00],
    ["F", 3802.93, 18, 22.78, 26.88],
    ["G", 4354.45, 18, 26.08, 30.77],
    ["H", 4767.21, 18, 28.55, 33.69],
    ["I", 5804.36, 18, 34.76, 41.02],
    ["J", 6372.64, 18, 38.16, 45.03],
    ["K", 8424.77, 18, 50.45, 59.53],
  ];

  for (const [bg, monat, p, erwartetStd, erwartetMitZ] of zeilen) {
    it(`Gruppe ${bg}: ${monat} € → ${erwartetStd} €/Std, mit ${p} % → ${erwartetMitZ} €`, () => {
      expect(std(monat)).toBe(erwartetStd);
      expect(mitZ(monat, p)).toBe(erwartetMitZ);
    });
  }
});

/**
 * Die Zuordnung des freien KV-Textes am Kunden auf die hinterlegte Lohntafel.
 *
 * Der Anlass: Beim Kunden Prefa stand „KV Metallindustrie". In der Tabelle heißt derselbe KV
 * „Metalltechnische Industrie (Arbeiter/innen)". Die Suche fand nichts, die Software fiel auf die
 * Hausregel 13,90 € zurück – und ein Einsatz, der mit 13,90 statt mit dem Referenzlohn kalkuliert
 * wird, ist Lohndumping.
 */
describe("kvKuerzelAusText", () => {
  const faelle: [string, string][] = [
    ["KV Metallindustrie", "MTI"],
    ["Metallindustrie", "MTI"],
    ["Metalltechnische Industrie", "MTI"],
    ["metaller", "MTI"],
    ["KV Metallgewerbe", "METALLGEWERBE"],
    ["KV Handel", "HANDEL"],
    ["Chemische Industrie", "CHEMIE"],
    ["KV Güterbeförderung / Transport", "TRANSPORT"],
    ["Speditionsgewerbe", "SPEDITION"],
    ["Hotel- und Gastgewerbe", "GASTRO"],
    ["Elektro- und Elektronikindustrie", "EEI"],
    ["Holzindustrie", "HOLZ"],
    ["KV Angestellte Gewerbe & Handwerk", "ANG-GEWERBE"],
  ];
  for (const [text, kuerzel] of faelle) {
    it(`„${text}" → ${kuerzel}`, () => expect(kvKuerzelAusText(text)).toBe(kuerzel));
  }

  it("liefert null, wenn wirklich nichts passt – dann muss der Mensch entscheiden", () => {
    expect(kvKuerzelAusText("Kollektivvertrag für Astronauten")).toBeNull();
    expect(kvKuerzelAusText("")).toBeNull();
    expect(kvKuerzelAusText(null)).toBeNull();
  });
});

describe("Referenzzuschlag metalltechnische Industrie – gegen die Lohnverrechnung", () => {
  // Quelle: BMD-Auswahl „KV Beschäftigungsgruppe", ArbeiterInnen der Metalltechnischen Industrie,
  // Stichtag 01.11.2025. Spalten „Satz Stundenlohn", „Satz Ref. Z [%]" und „Satz + Ref. Z Stundenlohn".
  const faelle: [string, number, number, number, number][] = [
    // BG, Monatsbrutto, Ref-Z %, KV-Stundenlohn, Stundenlohn inkl. Zuschlag
    ["A", 2568.80, 9, 15.39, 16.78],
    ["B", 2568.80, 13, 15.39, 17.39],
    ["C", 2698.59, 13, 16.16, 18.26],
    ["D", 2947.89, 18, 17.66, 20.84],
    ["E", 3396.21, 18, 20.34, 24.00],
    ["F", 3802.93, 18, 22.78, 26.88],
    ["G", 4354.45, 18, 26.08, 30.77],
    ["H", 4767.21, 18, 28.55, 33.69],
    ["I", 5804.36, 18, 34.76, 41.02],
    ["J", 6372.64, 18, 38.16, 45.03],
    ["K", 8424.77, 18, 50.45, 59.53],
  ];
  for (const [bg, monat, pct, std, mitZ] of faelle) {
    it(`BG ${bg}: ${monat} € → ${std} € → +${pct} % → ${mitZ} €`, () => {
      const s = stundenlohnAusMonat(monat);
      expect(s).toBe(std);
      expect(mitReferenzzuschlag(s, pct)).toBe(mitZ);
    });
  }
});
