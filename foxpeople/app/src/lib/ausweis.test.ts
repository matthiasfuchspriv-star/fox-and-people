import { describe, it, expect } from "vitest";
import { ausweisPruefen, type AusweisDaten } from "./einsatz";

const von = new Date("2026-09-15");
const leer: AusweisDaten = { dokumente: [], qualifikationen: [] };
const texte = (p: Partial<AusweisDaten>) => ausweisPruefen({ ...leer, ...p }, von).map((k) => k.text);
const hart = (p: Partial<AusweisDaten>) => ausweisPruefen({ ...leer, ...p }, von).some((k) => k.hart);

describe("ausweisPruefen", () => {
  it("meldet den fehlenden Ausweis, wenn nirgends einer liegt", () => {
    expect(texte({})[0]).toMatch(/Keine Ausweiskopie hinterlegt/);
    expect(hart({})).toBe(false);
  });

  it("erkennt den Ausweis als Dokument", () => {
    const p = { dokumente: [{ kategorie: "Reisepass", gultigBis: new Date("2030-01-01") }] };
    expect(texte(p)).toEqual([]);
  });

  it("erkennt den Ausweis als Qualifikation aus den alten Akten", () => {
    const p = { qualifikationen: [{ typ: "Reisepass", gultigBis: new Date("2030-01-01") }] };
    expect(texte(p)).toEqual([]);
  });

  it("meldet nicht zugleich „fehlt“ und „abgelaufen“ – der Fall aus der Einsatzplanung", () => {
    // Stammdatenfeld enthält versehentlich das Geburtsdatum, der gültige Pass liegt als Dokument
    // und als Qualifikation vor. Vorher: zwei sich widersprechende Meldungen, eine davon blockierend.
    const p = {
      ausweisArt: "Reisepass",
      ausweisGultigBis: new Date("1996-09-24"),
      geburtsdatum: new Date("1996-09-24"),
      dokumente: [{ kategorie: "Reisepass", gultigBis: new Date("2031-05-01") }],
      qualifikationen: [{ typ: "Reisepass", gultigBis: new Date("2031-05-01") }],
    };
    expect(texte(p)).toEqual([]);
    expect(hart(p)).toBe(false);
  });

  it("nennt die Quelle ohne Wortdopplung", () => {
    // Früher stand in der Meldung „Ausweis (Ausweis (Stammdaten))"
    const t = texte({ ausweisGultigBis: new Date("2026-03-01"), geburtsdatum: new Date("1990-01-01") })[0];
    expect(t).toContain("Ausweis (Stammdaten)");
    expect(t).not.toContain("Ausweis (Ausweis");
  });

  it("nennt bei bekannter Ausweisart beides – Art und Ablage", () => {
    const t = texte({ ausweisArt: "Reisepass", ausweisGultigBis: new Date("2026-03-01"), geburtsdatum: new Date("1990-01-01") })[0];
    expect(t).toContain("Ausweis (Reisepass, Stammdaten)");
  });

  it("blockiert nicht wegen eines Ablaufdatums, das vor der Geburt liegt", () => {
    const p = { ausweisArt: "Reisepass", ausweisGultigBis: new Date("1996-09-24"), geburtsdatum: new Date("1996-09-24") };
    expect(texte(p)[0]).toMatch(/kann nicht stimmen/);
    expect(hart(p)).toBe(false);
  });

  it("blockiert weiterhin einen wirklich abgelaufenen Ausweis", () => {
    const p = { ausweisArt: "Reisepass", ausweisGultigBis: new Date("2026-03-01"), geburtsdatum: new Date("1990-01-01") };
    expect(texte(p)[0]).toMatch(/läuft am 1\.3\.2026 ab/);
    expect(hart(p)).toBe(true);
  });

  it("warnt vor einem Ausweis, der innerhalb der Vorwarnzeit abläuft, ohne zu blockieren", () => {
    const p = { ausweisArt: "Personalausweis", ausweisGultigBis: new Date("2026-10-10"), geburtsdatum: new Date("1990-01-01") };
    expect(texte(p)[0]).toMatch(/läuft am 10\.10\.2026 ab/);
    expect(hart(p)).toBe(false);
  });

  it("nimmt das späteste Ablaufdatum, wenn mehrere Ausweise hinterlegt sind", () => {
    const p = {
      ausweisArt: "Personalausweis",
      ausweisGultigBis: new Date("2026-03-01"),
      geburtsdatum: new Date("1990-01-01"),
      dokumente: [{ kategorie: "Reisepass", gultigBis: new Date("2033-01-01") }],
    };
    expect(texte(p)).toEqual([]);
  });

  it("erkennt den Ausweis auch bei abweichender Schreibweise aus alten Akten", () => {
    expect(texte({ dokumente: [{ kategorie: " REISEPASS ", gultigBis: new Date("2030-01-01") }] })).toEqual([]);
  });

  it("bittet um das Ablaufdatum, wenn keines hinterlegt ist", () => {
    const p = { dokumente: [{ kategorie: "Reisepass", gultigBis: null }] };
    expect(texte(p)[0]).toMatch(/ohne Ablaufdatum/);
    expect(hart(p)).toBe(false);
  });
});
