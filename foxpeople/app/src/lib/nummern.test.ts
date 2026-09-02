import { describe, it, expect, vi, beforeEach } from "vitest";

// Die Freigabe-Logik ist die Stelle, an der ein Nummernkreis lückenhaft werden kann. Sie wird hier
// ohne Datenbank geprüft: der Zähler wird nur zurückgedreht, wenn es wirklich die letzte Nummer war.
const stand = { letzteNummer: 0, freieNummern: [] as number[], format: "{jahr}{nnn}" };

vi.mock("./db", () => ({
  db: {
    kostenstelle: { findFirst: async () => ({ id: "ks-zentrale" }) },
    nummernkreis: {
      findFirst: async () => ({ id: "nk", jahr: 2026, ...stand }),
      findUnique: async () => ({ id: "nk", ...stand }),
      update: async ({ data }: { data: { letzteNummer?: number; freieNummern?: number[] } }) => {
        if (data.letzteNummer !== undefined) stand.letzteNummer = data.letzteNummer;
        if (data.freieNummern !== undefined) stand.freieNummern = data.freieNummern;
        return { id: "nk", ...stand };
      },
    },
  },
}));

const { nummerFreigeben, nummerAusText } = await import("./nummern");

describe("nummerAusText", () => {
  it("trennt Jahr und laufende Nummer im Rechnungsformat", () => {
    expect(nummerAusText("{jahr}{nnn}", "2026007")).toBe(7);
    expect(nummerAusText("{jahr}{nnn}", "2026142")).toBe(142);
  });
  it("liest die Nummer aus dem Angebotsformat", () => {
    expect(nummerAusText("{typ}-{kuerzel}-{jahr}-{nnnn}", "AN-HQ-2026-0012")).toBe(12);
  });
  it("faellt bei fremden Nummern auf die letzte Zifferngruppe zurueck", () => {
    expect(nummerAusText("{jahr}{nnn}", "Alt-2019-44")).toBe(44);
  });
});

describe("nummerFreigeben", () => {
  beforeEach(() => { stand.letzteNummer = 0; stand.freieNummern = []; stand.format = "{jahr}{nnn}"; });

  it("dreht den Zähler zurück, wenn die letzte Nummer freigegeben wird", async () => {
    stand.letzteNummer = 7;
    expect(await nummerFreigeben("ks", "RE", 2026, "2026007")).toBe(true);
    expect(stand.letzteNummer).toBe(6);
    expect(stand.freieNummern).toEqual([]);
  });

  it("nimmt beim Zurückdrehen die davor freigewordenen Nummern mit", async () => {
    stand.letzteNummer = 9;
    stand.freieNummern = [7, 8];
    await nummerFreigeben("ks", "RE", 2026, "2026009");
    expect(stand.letzteNummer).toBe(6);
    expect(stand.freieNummern).toEqual([]);
  });

  it("merkt eine Nummer aus der Mitte als frei, sortiert", async () => {
    stand.letzteNummer = 9;
    stand.freieNummern = [5];
    expect(await nummerFreigeben("ks", "RE", 2026, "2026003")).toBe(true);
    expect(stand.letzteNummer).toBe(9);
    expect(stand.freieNummern).toEqual([3, 5]);
  });

  it("gibt dieselbe Nummer nicht zweimal frei", async () => {
    stand.letzteNummer = 9;
    stand.freieNummern = [3];
    expect(await nummerFreigeben("ks", "RE", 2026, "2026003")).toBe(false);
    expect(stand.freieNummern).toEqual([3]);
  });

  it("greift auch beim Angebotsformat mit vierstelliger Nummer", async () => {
    stand.format = "{typ}-{kuerzel}-{jahr}-{nnnn}";
    stand.letzteNummer = 12;
    expect(await nummerFreigeben("ks", "AN", 2026, "AN-HQ-2026-0012")).toBe(true);
    expect(stand.letzteNummer).toBe(11);
  });
});

import { jahrAusNummer } from "./nummern";

describe("Jahr aus der Rechnungsnummer", () => {
  it("liest das Jahr aus dem Rechnungsformat JJJJNNN", () => {
    expect(jahrAusNummer("{jahr}{nnn}", "2025007")).toBe(2025);
    expect(jahrAusNummer("{jahr}{nnn}", "2026123")).toBe(2026);
  });
  it("liest das Jahr aus dem Vertrags-/Angebotsformat", () => {
    expect(jahrAusNummer("{typ}-{kuerzel}-{jahr}-{nnnn}", "VT-HQ-2026-0012")).toBe(2026);
  });
  it("gibt null zurück, wenn nichts passt", () => {
    expect(jahrAusNummer("{jahr}{nnn}", "AR-7")).toBeNull();
  });
});
