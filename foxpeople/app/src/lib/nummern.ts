import { db } from "./db";

/** Lückenloser Nummernkreis je Kostenstelle, Typ und Jahr: AN-HQ-2026-0001 */
export async function naechsteNummer(kostenstelleIdWunsch: string, typ: "AN" | "RE" | "VT", jahr = new Date().getFullYear()): Promise<string> {
  // Rechnungen: ein firmenweiter Nummernkreis (§ 11 UStG, Format JJJJNNN) – immer über die Zentrale, unabhängig von der Kostenstelle
  const kostenstelleId = typ === "RE" ? (await db.kostenstelle.findFirst({ where: { isZentrale: true }, select: { id: true } }))?.id ?? kostenstelleIdWunsch : kostenstelleIdWunsch;
  const ks = await db.kostenstelle.findUniqueOrThrow({ where: { id: kostenstelleId } });
  const nk = await db.$transaction(async (tx) => {
    // Format vom Vorjahr übernehmen, falls für das Jahr noch kein Kreis existiert
    const vorjahr = await tx.nummernkreis.findFirst({ where: { kostenstelleId, typ }, orderBy: { jahr: "desc" } });
    await tx.nummernkreis.upsert({
      where: { kostenstelleId_typ_jahr: { kostenstelleId, typ, jahr } },
      create: { kostenstelleId, typ, jahr, letzteNummer: 0, format: vorjahr?.format ?? (typ === "RE" ? "{jahr}{nnn}" : "{typ}-{kuerzel}-{jahr}-{nnnn}") },
      update: {},
    });
    const akt = await tx.nummernkreis.findUniqueOrThrow({ where: { kostenstelleId_typ_jahr: { kostenstelleId, typ, jahr } } });
    // Frei gewordene Nummern (gelöschte Rechnungen) werden zuerst wieder vergeben – kleinste zuerst
    const frei = [...akt.freieNummern].sort((a, b) => a - b);
    if (frei.length) {
      const nr = frei.shift()!;
      await tx.nummernkreis.update({ where: { id: akt.id }, data: { freieNummern: frei } });
      return { ...akt, letzteNummer: nr };
    }
    return tx.nummernkreis.update({
      where: { kostenstelleId_typ_jahr: { kostenstelleId, typ, jahr } },
      data: { letzteNummer: { increment: 1 } },
    });
  });
  return nk.format.replace("{typ}", typ).replace("{kuerzel}", ks.kuerzel).replace("{jahr}", String(jahr)).replace("{nnnn}", String(nk.letzteNummer).padStart(4, "0")).replace("{nnn}", String(nk.letzteNummer).padStart(3, "0"));
}

/**
 * Liest die laufende Nummer aus einer fertigen Nummer heraus – anhand des hinterlegten Formats,
 * nicht anhand der letzten Ziffern. Bei Rechnungen steht die Jahreszahl direkt vor der Nummer
 * ("2026007"); wer da einfach alle Ziffern am Ende nimmt, bekommt 2026007 statt 7 und gibt die
 * Nummer nie wieder frei.
 */
export function nummerAusText(format: string, text: string): number | null {
  const muster = format
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("\\{typ\\}", "[A-Z]+")
    .replace("\\{kuerzel\\}", "[^-]+")
    .replace("\\{jahr\\}", "\\d{4}")
    .replace("\\{nnnn\\}", "(\\d+)")
    .replace("\\{nnn\\}", "(\\d+)");
  const treffer = text.match(new RegExp("^" + muster + "$"));
  if (treffer && treffer[1]) return Number(treffer[1]);
  // Formate ohne Platzhalter oder von Hand vergebene Nummern: letzte Zifferngruppe als Rückfall
  const rueck = text.match(/(\d+)$/);
  return rueck ? Number(rueck[1]) : null;
}

/**
 * Liest die Jahreszahl aus einer fertigen Nummer heraus – anhand des Formats. Wichtig für die
 * Freigabe: Eine Rechnung wird mit dem Leistungsjahr nummeriert (Dezember-Leistung → 2025007, auch
 * wenn sie im Januar 2026 erzeugt wird). Wer beim Löschen einfach das aktuelle Jahr nimmt, gibt die
 * Nummer in den falschen Kreis frei – im alten bleibt eine echte Lücke, im neuen wird eine Nummer
 * doppelt vorgemerkt.
 */
export function jahrAusNummer(format: string, text: string): number | null {
  const muster = format
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("\\{typ\\}", "[A-Z]+")
    .replace("\\{kuerzel\\}", "[^-]+")
    .replace("\\{jahr\\}", "(\\d{4})")
    .replace("\\{nnnn\\}", "\\d+")
    .replace("\\{nnn\\}", "\\d+");
  const treffer = text.match(new RegExp("^" + muster + "$"));
  return treffer && treffer[1] ? Number(treffer[1]) : null;
}

/**
 * Gibt eine vergebene Nummer wieder frei – nach einer gelöschten Rechnung oder wenn das Anlegen
 * nach dem Ziehen der Nummer doch gescheitert ist. War es die zuletzt vergebene, wird der Zähler
 * zurückgedreht (und dabei gleich die davor freigewordenen mitgenommen), sonst wird sie als freie
 * Nummer gemerkt und beim nächsten Mal zuerst wieder vergeben. So bleibt der Kreis lückenlos,
 * wie es § 11 UStG verlangt. Das Jahr des Kreises wird, wo möglich, aus der Nummer selbst gelesen –
 * das übergebene Jahr ist nur der Rückfall.
 */
export async function nummerFreigeben(kostenstelleIdWunsch: string, typ: "AN" | "RE" | "VT", jahr: number, nummer: string | number) {
  const kostenstelleId = typ === "RE" ? (await db.kostenstelle.findFirst({ where: { isZentrale: true }, select: { id: true } }))?.id ?? kostenstelleIdWunsch : kostenstelleIdWunsch;
  if (typeof nummer === "string") {
    const irgendein = await db.nummernkreis.findFirst({ where: { kostenstelleId, typ }, orderBy: { jahr: "desc" } });
    const j = irgendein ? jahrAusNummer(irgendein.format, nummer) : null;
    if (j) jahr = j;
  }
  const nk = await db.nummernkreis.findUnique({ where: { kostenstelleId_typ_jahr: { kostenstelleId, typ, jahr } } });
  if (!nk) return false;
  const nr = typeof nummer === "number" ? nummer : nummerAusText(nk.format, nummer);
  if (nr === null) return false;
  if (nr === nk.letzteNummer) {
    let n = nr - 1;
    const frei = new Set(nk.freieNummern);
    while (n > 0 && frei.has(n)) { frei.delete(n); n--; }
    await db.nummernkreis.update({ where: { id: nk.id }, data: { letzteNummer: n, freieNummern: [...frei] } });
    return true;
  }
  if (nr < nk.letzteNummer && !nk.freieNummern.includes(nr)) {
    await db.nummernkreis.update({ where: { id: nk.id }, data: { freieNummern: [...nk.freieNummern, nr].sort((x, y) => x - y) } });
    return true;
  }
  return false;
}
