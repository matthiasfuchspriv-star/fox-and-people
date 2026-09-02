import { db } from "./db";
import { sendeMail } from "./mail";
import { einstellung, setEinstellung, firma as ladeFirma } from "./einstellungen";
import { tagesmailText } from "./fehler";

/** Wann die Tagesmail rausgeht (Ortszeit, volle Stunde). */
const STUNDE = 7;

/**
 * Tägliche Zusammenfassung der Fehler an die Zentrale.
 *
 * Wird vom stündlichen Hintergrundlauf mitgerufen und entscheidet selbst, ob heute schon eine Mail
 * raus ist. Ein eigener Zeitplan wäre eine zweite Stelle, die man beim Umzug auf einen anderen
 * Server vergessen kann.
 *
 * Gibt es nichts zu berichten, geht keine Mail. Eine tägliche „alles in Ordnung"-Mail liest nach
 * einer Woche niemand mehr – und dann fällt die eine Mail, die zählt, auch nicht mehr auf.
 */
export async function tagesmailSenden(jetzt = new Date()): Promise<string> {
  if (jetzt.getHours() < STUNDE) return "noch zu früh";
  const heute = jetzt.toISOString().slice(0, 10);
  const zuletzt = await einstellung<string | null>("tagesmailZuletzt", null);
  if (zuletzt === heute) return "heute schon gesendet";

  // Zeitraum: seit der letzten Mail, sonst die letzten 24 Stunden.
  const seit = zuletzt ? new Date(`${zuletzt}T${String(STUNDE).padStart(2, "0")}:00:00`) : new Date(jetzt.getTime() - 86400000);
  const fehler = await db.fehlerprotokoll.findMany({
    where: { erledigtAm: null, zuletztAm: { gte: seit } },
    orderBy: [{ stufe: "asc" }, { zuletztAm: "desc" }],
    take: 100,
  });
  const text = tagesmailText(fehler, seit);

  // Auch wenn nichts zu melden war, gilt der Tag als erledigt: sonst prüft jeder Lauf der nächsten
  // Stunden dasselbe erneut.
  await setEinstellung("tagesmailZuletzt", heute);
  if (!text) return "nichts zu melden";

  const f = await ladeFirma();
  const an = (await einstellung<string | null>("tagesmailAn", null)) ?? f.email ?? process.env.MAIL_FROM ?? "";
  if (!an) return "keine Empfängeradresse hinterlegt";

  const r = await sendeMail({
    an,
    betreff: `Fox & People – Systembericht ${jetzt.toLocaleDateString("de-AT")}`,
    text,
    referenzTyp: "Tagesmail",
  });
  // Als gemeldet markieren, damit man in der Liste sieht, was schon per Mail draußen war.
  await db.fehlerprotokoll.updateMany({ where: { id: { in: fehler.map((x) => x.id) } }, data: { gemeldetAm: jetzt } });
  return r.ok ? `gesendet an ${an} (${fehler.length} Einträge)` : `Versand fehlgeschlagen: ${r.fehler ?? "unbekannt"}`;
}
