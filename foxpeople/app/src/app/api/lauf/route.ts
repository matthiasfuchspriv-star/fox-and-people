import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { erzeugeAufgaben, stundenErinnerungSenden } from "@/lib/aufgaben";
import { bremseAufraeumen } from "@/lib/bremse";
import { mitProtokoll } from "@/lib/fehler";
import { tagesmailSenden } from "@/lib/tagesmail";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Stündlicher Hintergrundlauf.
 *
 * Vorher wurden Fristen, Wiedervorlagen und die Wochen-Erinnerung nur berechnet, wenn im Büro jemand
 * das Dashboard öffnete. Ablaufende Staplerscheine, Arbeitsbewilligungen und überfällige Rechnungen
 * hingen also daran, dass jemand hinschaut – und die Erinnerung an die Stundenzettel fiel aus, sobald
 * am Montag niemand im Haus war. Diese Route ruft der Cron-Dienst aus dem Docker-Compose stündlich auf.
 *
 * Geschützt über LAUF_TOKEN aus der .env (der Cron-Dienst schickt ihn im Kopf `x-lauf-token`).
 */
export async function GET(req: Request) {
  const erwartet = process.env.LAUF_TOKEN;
  if (!erwartet) return NextResponse.json({ ok: false, fehler: "LAUF_TOKEN ist nicht gesetzt" }, { status: 503 });
  // Nur im Kopf, nicht als Query-Parameter: Adressen mit Parametern landen in Proxy-Protokollen.
  const gesendet = req.headers.get("x-lauf-token") ?? "";
  const a = Buffer.from(gesendet), b = Buffer.from(erwartet);
  // Zeitkonstanter Vergleich, damit sich der Token nicht Zeichen für Zeichen erraten lässt
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse("Nicht erlaubt", { status: 401 });

  const start = Date.now();
  const ergebnis: Record<string, unknown> = {};
  // Nur ein Lauf gleichzeitig: parallele Aufrufe würden Erinnerungen doppelt verschicken
  if (laeuft) return NextResponse.json({ ok: true, hinweis: "Ein Lauf ist bereits unterwegs." });
  laeuft = true;
  try {
    // Jeder Schritt für sich: einer darf die anderen nicht mitreißen. Was schiefgeht, landet im
    // Fehlerprotokoll und damit in der Tagesmail – früher stand es nur in dieser Antwort, die
    // niemand liest.
    ergebnis.aufgaben = (await mitProtokoll("Hintergrundlauf/Wiedervorlagen", async () => { await erzeugeAufgaben(); return "ok"; })) ?? "fehlgeschlagen";
    ergebnis.erinnerungen = (await mitProtokoll("Hintergrundlauf/Stundenerinnerung", async () => (await stundenErinnerungSenden()).erinnert)) ?? "fehlgeschlagen";
    ergebnis.zaehlerAufgeraeumt = await mitProtokoll("Hintergrundlauf/Aufräumen", () => bremseAufraeumen());
    ergebnis.koordinaten = await mitProtokoll("Hintergrundlauf/Koordinaten", async () => {
      const { koordinatenNachtragen } = await import("@/lib/geo");
      return koordinatenNachtragen();
    });
    ergebnis.abgelaufeneTokens = await mitProtokoll("Hintergrundlauf/Portalzugänge", async () =>
      (await db.kundenPortalToken.deleteMany({ where: { gultigBis: { lt: new Date(Date.now() - 30 * 86400000) } } })).count);

    // Zum Schluss die Tagesmail. Sie steht bewusst am Ende: Was in diesem Lauf schiefging, soll noch
    // darin vorkommen.
    ergebnis.tagesmail = await mitProtokoll("Hintergrundlauf/Tagesmail", () => tagesmailSenden());

    return NextResponse.json({ ok: true, dauerMs: Date.now() - start, ...ergebnis });
  } finally {
    laeuft = false;
  }
}

/** Sperre gegen Parallelläufe im selben Prozess. */
let laeuft = false;
