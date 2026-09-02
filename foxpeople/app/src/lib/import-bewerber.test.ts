import { describe, it, expect } from "vitest";
import { leseTabelle, vorschlagZuordnung, felderFuer, adresseZerlegen, MAX_ZELLE, MAX_SPALTEN, MAX_ZEILEN } from "./import-bewerber";

/** Listen von außen sehen selten schön aus: Titelzeile, Leerzeile, eigenwillige Überschriften. */
const csv = (s: string) => Buffer.from(s, "utf8");

describe("Bewerber aus einer Liste einlesen", () => {
  it("überspringt Titel- und Leerzeilen und findet die Überschriften", async () => {
    const t = await leseTabelle(csv("AMS Liste Bezirk Melk\n\nFamilienname;Vorname;Mobiltelefon\nNovak;Peter;0664 1234567\n"), "liste.csv");
    expect(t.spalten).toEqual(["Familienname", "Vorname", "Mobiltelefon"]);
    expect(t.zeilen).toEqual([["Novak", "Peter", "0664 1234567"]]);
  });

  it("kommt mit Komma statt Semikolon und mit Anführungszeichen zurecht", async () => {
    const t = await leseTabelle(csv('Name,Ort,Notiz\n"Bauer, Andrea",Purgstall,"sagt ""jederzeit"" verfügbar"\n'), "liste.csv");
    expect(t.zeilen[0]).toEqual(["Bauer, Andrea", "Purgstall", 'sagt "jederzeit" verfügbar']);
  });

  it("schlägt die Spalten anhand der Überschriften vor", () => {
    const z = vorschlagZuordnung(["Familienname", "Vorname", "Mobiltelefon", "E-Mail Adresse", "geb. am", "Tätigkeit", "FS B", "Stapler"]);
    expect(z.nachname).toBe(0);
    expect(z.vorname).toBe(1);
    expect(z.telefon).toBe(2);
    expect(z.email).toBe(3);
    expect(z.geburtsdatum).toBe(4);
    expect(z.standardrolle).toBe(5);
    expect(z.fuehrerschein).toBe(6);
    expect(z.stapler).toBe(7);
  });

  it("nimmt eine gemeinsame Namensspalte nur, wenn Vor- und Nachname nicht getrennt sind", () => {
    expect(vorschlagZuordnung(["Name", "Telefon"]).name).toBe(0);
    expect(vorschlagZuordnung(["Nachname", "Vorname", "Name"]).name).toBeUndefined();
  });

  it("meldet eine leere Datei verständlich", async () => {
    await expect(leseTabelle(csv(""), "leer.csv")).rejects.toThrow(/leer/i);
  });
});

describe("Grenzen gegen überlastende Dateien", () => {
  it("weist Dateien mit zu vielen Zeilen ab", async () => {
    const kopf = "Nachname;Vorname\n";
    const viele = Array.from({ length: MAX_ZEILEN + 100 }, (_, i) => `Muster${i};Max`).join("\n");
    await expect(leseTabelle(csv(kopf + viele), "gross.csv")).rejects.toThrow(/zu groß/i);
  });

  it("lässt eine echte Bewerberliste mit knapp 5.000 Zeilen durch", async () => {
    const kopf = "Nachname;Vorname\n";
    const viele = Array.from({ length: 4853 }, (_, i) => `Muster${i};Max`).join("\n");
    const t = await leseTabelle(csv(kopf + viele), "liste.csv");
    expect(t.zeilen.length).toBe(4853);
  });

  it("weist Dateien mit zu vielen Zellen ab, auch wenn die Zeilenzahl passt", async () => {
    const spalten = Array.from({ length: 100 }, (_, i) => `S${i}`).join(";");
    const zeile = Array.from({ length: 100 }, () => "x").join(";");
    const viele = Array.from({ length: 5000 }, () => zeile).join("\n");
    await expect(leseTabelle(csv(spalten + "\n" + viele), "breit.csv")).rejects.toThrow(/zu groß/i);
  });

  it("schneidet überlange Zellen ab, statt sie zu übernehmen", async () => {
    const lang = "A".repeat(2000);
    const t = await leseTabelle(csv(`Nachname;Notiz\nMuster;${lang}\n`), "lang.csv");
    expect(t.zeilen[0][1].length).toBe(MAX_ZELLE);
  });

  it("begrenzt die Anzahl der Spalten", async () => {
    const kopf = Array.from({ length: 300 }, (_, i) => `S${i}`).join(";");
    const t = await leseTabelle(csv(`${kopf}\n${Array.from({ length: 300 }, () => "x").join(";")}\n`), "breit.csv");
    expect(t.spalten.length).toBe(MAX_SPALTEN);
    expect(t.zeilen[0].length).toBe(MAX_SPALTEN);
  });
});

describe("Mitarbeiterliste", () => {
  it("bietet die Stammdatenfelder nur für Mitarbeiter an", () => {
    const bewerber = felderFuer("BEWERBER").map((f) => f.key);
    const mitarbeiter = felderFuer("MITARBEITER").map((f) => f.key);
    expect(bewerber).not.toContain("svnr");
    expect(bewerber).not.toContain("stundenlohn");
    expect(mitarbeiter).toContain("svnr");
    expect(mitarbeiter).toContain("eintrittsdatum");
    expect(mitarbeiter).toContain("stundenlohn");
    // die Basisfelder bleiben in beiden Fällen vorne, damit die Zuordnung gleich aussieht
    expect(mitarbeiter.slice(0, bewerber.length)).toEqual(bewerber);
  });

  it("erkennt die typischen Überschriften einer Lohnliste", () => {
    const z = vorschlagZuordnung(
      ["Zuname", "Vorname", "SVNR", "Eintritt", "Austritt", "Stundenlohn", "Wochenstunden", "Staatsangehörigkeit", "Geschlecht"],
      "MITARBEITER",
    );
    expect(z.nachname).toBe(0);
    expect(z.svnr).toBe(2);
    expect(z.eintrittsdatum).toBe(3);
    expect(z.austrittsdatum).toBe(4);
    expect(z.stundenlohn).toBe(5);
    expect(z.wochenstunden).toBe(6);
    expect(z.staatsangehoerigkeit).toBe(7);
    expect(z.geschlecht).toBe(8);
  });

  it("verwechselt die Lohngruppe nicht mit dem Stundenlohn", () => {
    const z = vorschlagZuordnung(["Nachname", "Lohngruppe", "Stundenlohn"], "MITARBEITER");
    expect(z.beschaeftigungsgruppe).toBe(1);
    expect(z.stundenlohn).toBe(2);
  });

  it("legt dieselben Spalten im Bewerbermodus nicht auf Mitarbeiterfelder", () => {
    const z = vorschlagZuordnung(["Zuname", "Vorname", "SVNR", "Stundenlohn"], "BEWERBER");
    expect(z.svnr).toBeUndefined();
    expect(z.stundenlohn).toBeUndefined();
  });
});

describe("Listen aus fremder Branchensoftware", () => {
  it("zerlegt die Adresse aus einer einzigen Spalte", () => {
    expect(adresseZerlegen("A-3386 Hafnerbach, Dunkelsteiner Str. 21")).toEqual({ plz: "3386", ort: "Hafnerbach", strasse: "Dunkelsteiner Str. 21" });
    expect(adresseZerlegen("A-3180 Lilienfeld , Marktstraße 9/4")).toEqual({ plz: "3180", ort: "Lilienfeld", strasse: "Marktstraße 9/4" });
    expect(adresseZerlegen("3100 St. Pölten, Mühlweg 22/1")).toEqual({ plz: "3100", ort: "St. Pölten", strasse: "Mühlweg 22/1" });
    // umgekehrte Reihenfolge
    expect(adresseZerlegen("Hauptplatz 1, 3233 Kilb")).toEqual({ plz: "3233", ort: "Kilb", strasse: "Hauptplatz 1" });
  });

  it("lässt eine Adresse ohne PLZ als Straße stehen, statt sie zu verlieren", () => {
    expect(adresseZerlegen("Irgendwo im Nirgendwo")).toEqual({ plz: null, ort: null, strasse: "Irgendwo im Nirgendwo" });
    expect(adresseZerlegen("")).toEqual({ plz: null, ort: null, strasse: null });
  });

  it("erkennt die Überschriften eines Bewerberexports", () => {
    const z = vorschlagZuordnung(
      ["Anrede", "Vorname", "Nachname", "PKW", "PKW FS", "# Fachl", "erl. Beruf", "FK", "bew. Beruf", "FK",
       "Adresse", "Mobil", "Tel.", "EMail", "Nationalität", "Fam.Stand", "bew. am", "einsatzbereit ab", "Team", "Betreuer", "Geb.Dat.", "Sperre"],
    );
    expect(z.geschlecht).toBe(0);
    expect(z.vorname).toBe(1);
    expect(z.nachname).toBe(2);
    expect(z.fuehrerschein).toBe(4);
    expect(z.standardrolle).toBe(8); // "bew. Beruf" schlägt "erl. Beruf"
    expect(z.adresse).toBe(10);
    expect(z.telefon).toBe(11); // Mobil vor Festnetz
    expect(z.email).toBe(13);
    expect(z.staatsangehoerigkeit).toBe(14);
    expect(z.beworbenAm).toBe(16);
    expect(z.verfuegbarAb).toBe(17);
    expect(z.geburtsdatum).toBe(20);
  });
});
