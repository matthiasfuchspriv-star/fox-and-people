import { describe, it, expect } from "vitest";
import { fehlertext, tagesmailText } from "./fehler";

const seit = new Date("2026-08-31T07:00:00");
const e = (o: Partial<Parameters<typeof tagesmailText>[0][number]>) => ({
  quelle: "Hintergrundlauf", stufe: "FEHLER", meldung: "Test", anzahl: 1,
  zuerstAm: new Date("2026-08-31T09:15:00"), zuletztAm: new Date("2026-09-01T06:15:00"), ...o,
});

describe("fehlertext", () => {
  it("nimmt die Meldung eines Fehlerobjekts", () => {
    expect(fehlertext(new Error("SMTP nicht erreichbar"))).toBe("SMTP nicht erreichbar");
  });
  it("kommt auch mit einer Zeichenkette zurecht", () => {
    expect(fehlertext("kaputt")).toBe("kaputt");
  });
  it("erfindet für einen leeren Fehler eine brauchbare Meldung", () => {
    expect(fehlertext(new Error())).toBe("Error");
  });
  it("scheitert nicht an einem beliebigen Objekt", () => {
    expect(fehlertext({ a: 1 })).toContain("a");
  });
});

describe("tagesmailText", () => {
  it("schickt nichts, wenn nichts passiert ist", () => {
    // Eine tägliche „alles in Ordnung"-Mail liest nach einer Woche niemand mehr.
    expect(tagesmailText([], seit)).toBeNull();
  });

  it("nennt Anzahl, Quelle und Zeitraum", () => {
    const t = tagesmailText([e({ meldung: "SMTP nicht erreichbar", anzahl: 24 })], seit)!;
    expect(t).toContain("1 Fehler und 0 Warnungen");
    expect(t).toContain("[Hintergrundlauf] SMTP nicht erreichbar");
    expect(t).toContain("24×");
  });

  it("trennt Fehler von Warnungen", () => {
    const t = tagesmailText([e({}), e({ stufe: "WARNUNG", meldung: "Nominatim langsam" })], seit)!;
    expect(t).toContain("1 Fehler und 1 Warnungen");
    expect(t.indexOf("Fehler:")).toBeLessThan(t.indexOf("Warnungen:"));
  });

  it("verweist auf die Seite zum Abhaken", () => {
    expect(tagesmailText([e({})], seit)!).toContain("/fehler");
  });
});
