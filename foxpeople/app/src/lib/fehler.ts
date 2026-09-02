import { db } from "./db";

/**
 * Fehlerprotokoll.
 *
 * Der Anlass: Im ganzen Programm gab es genau ein `console.error`. Der stündliche Hintergrundlauf
 * fing seine Fehler ab und schrieb sie in eine Antwort, die niemand liest. Ein kaputter Mailversand
 * wäre erst aufgefallen, wenn wochenlang keine Stundenzettel mehr eingehen – und das Notfallskript
 * fürs Passwort war monatelang defekt, ohne dass es jemand wusste.
 *
 * Zwei Regeln halten das Protokoll brauchbar:
 *
 *  1. **Gleiche Quelle + gleiche Meldung = eine Zeile mit Zähler.** Ein Fehler, der stündlich
 *     auftritt, ist ein Eintrag mit „24 ×", nicht 24 Einträge. Sonst geht das Seltene im Häufigen
 *     unter, und genau das Seltene ist meist das Interessante.
 *  2. **Melden darf nie scheitern.** Wenn schon etwas kaputt ist, darf das Protokollieren nicht der
 *     zweite Fehler sein. Deshalb fängt jede Funktion hier ihre eigenen Fehler ab.
 */

export type Fehlerstufe = "FEHLER" | "WARNUNG";

/** Meldungstext aus einem beliebigen Fehlerobjekt – ohne je selbst zu scheitern. */
export function fehlertext(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || "Unbekannter Fehler";
  if (typeof e === "string") return e;
  try { return JSON.stringify(e).slice(0, 500); } catch { return String(e); }
}

/**
 * Einen Fehler festhalten. Absichtlich ohne `throw`: Der Aufrufer entscheidet selbst, ob er
 * weitermacht oder abbricht.
 */
export async function fehlerMelden(quelle: string, e: unknown, opts: { stufe?: Fehlerstufe; detail?: string } = {}) {
  const meldung = fehlertext(e).slice(0, 500);
  const detail = opts.detail ?? (e instanceof Error && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : undefined);
  try {
    const offen = await db.fehlerprotokoll.findFirst({ where: { quelle, meldung, erledigtAm: null } });
    if (offen) await db.fehlerprotokoll.update({ where: { id: offen.id }, data: { anzahl: { increment: 1 }, zuletztAm: new Date(), detail: detail ?? offen.detail } });
    else await db.fehlerprotokoll.create({ data: { quelle, meldung, detail, stufe: opts.stufe ?? "FEHLER" } });
  } catch {
    // Letzte Rettung: wenigstens ins Container-Log, damit die Spur nicht ganz verloren geht.
    console.error(`[${quelle}]`, meldung);
  }
}

/**
 * Einen Schritt ausführen und einen Fehler darin protokollieren, statt den ganzen Lauf zu beenden.
 * Gibt bei Erfolg das Ergebnis zurück, sonst `null`.
 */
export async function mitProtokoll<T>(quelle: string, schritt: () => Promise<T>): Promise<T | null> {
  try {
    return await schritt();
  } catch (e) {
    await fehlerMelden(quelle, e);
    return null;
  }
}

/** Alles, was seit dem Zeitpunkt aufgetreten ist – neueste zuerst. */
export async function offeneFehler(seit?: Date) {
  return db.fehlerprotokoll.findMany({
    where: { erledigtAm: null, ...(seit ? { zuletztAm: { gte: seit } } : {}) },
    orderBy: [{ stufe: "asc" }, { zuletztAm: "desc" }],
    take: 100,
  });
}

/**
 * Der Text der Tagesmail. Gibt `null` zurück, wenn es nichts zu berichten gibt – dann wird auch
 * keine Mail verschickt. Eine tägliche „alles in Ordnung"-Mail liest nach einer Woche niemand mehr,
 * und dann fällt die eine Mail, die zählt, auch nicht mehr auf.
 */
export function tagesmailText(fehler: { quelle: string; stufe: string; meldung: string; anzahl: number; zuerstAm: Date; zuletztAm: Date }[], seit: Date): string | null {
  if (!fehler.length) return null;
  const zeit = (d: Date) => d.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const zeilen: string[] = [];
  const echte = fehler.filter((f) => f.stufe === "FEHLER");
  const warnungen = fehler.filter((f) => f.stufe !== "FEHLER");
  zeilen.push(`Seit ${zeit(seit)} sind ${echte.length} Fehler und ${warnungen.length} Warnungen aufgetreten.`, "");
  for (const gruppe of [{ titel: "Fehler", eintraege: echte }, { titel: "Warnungen", eintraege: warnungen }]) {
    if (!gruppe.eintraege.length) continue;
    zeilen.push(`${gruppe.titel}:`);
    for (const f of gruppe.eintraege) {
      zeilen.push(`  • [${f.quelle}] ${f.meldung}`);
      zeilen.push(`    ${f.anzahl}× · zuerst ${zeit(f.zuerstAm)} · zuletzt ${zeit(f.zuletztAm)}`);
    }
    zeilen.push("");
  }
  zeilen.push("Nachsehen und abhaken: https://app.foxandpeople.at/fehler");
  return zeilen.join("\n");
}
