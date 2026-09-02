import { headers } from "next/headers";
import { db } from "./db";

/**
 * Missbrauchsbremse für alles, was ohne Anmeldung erreichbar ist.
 *
 * Ohne sie kann jemand tausendmal hintereinander einen Anmeldecode anfordern – das sind tausend E-Mails
 * aus dem Office-Postfach, und Microsoft stuft den Absender danach als Spam ein. Dasselbe gilt für das
 * Bewerbungsformular, über das ohne Anmeldung Personen und Aufgaben angelegt werden.
 *
 * Umsetzung bewusst schlicht: eine Zeile je Schlüssel und Zeitfenster in der Datenbank, hochgezählt per
 * upsert. Kein Zwischenspeicher, keine zusätzliche Software, und die Zähler überleben einen Neustart.
 */
export interface BremsRegel { anzahl: number; fensterMinuten: number }

/**
 * Absender-Adresse bestimmen.
 *
 * Achtung, das ist die Stelle, an der solche Bremsen üblicherweise scheitern: `X-Forwarded-For` kann
 * jeder Aufrufer selbst mitschicken. Caddy **hängt** die echte Adresse hinten an, statt den Kopf zu
 * ersetzen – der erste Eintrag stammt also vom Aufrufer und ist wertlos. Genommen wird deshalb der
 * **letzte** Eintrag: den hat unser eigener Reverse-Proxy geschrieben.
 */
export async function absenderIp(): Promise<string> {
  const h = await headers();
  const f = h.get("x-forwarded-for");
  if (f) {
    const teile = f.split(",").map((x) => x.trim()).filter(Boolean);
    if (teile.length) return teile[teile.length - 1]!;
  }
  return h.get("x-real-ip") ?? "unbekannt";
}

/**
 * Zählt einen Zugriff und meldet, ob das Limit überschritten ist.
 * Gibt `true` zurück, wenn der Vorgang **erlaubt** ist.
 */
export async function darfZugreifen(schluessel: string, regel: BremsRegel): Promise<boolean> {
  const ms = regel.fensterMinuten * 60000;
  const fenster = new Date(Math.floor(Date.now() / ms) * ms);
  // Zwei Versuche: bei gleichzeitigen Anfragen kollidiert das create, der zweite Lauf zählt dann hoch.
  // Ohne den Wiederholungsversuch würde jede Kollision durchgelassen – und genau die erzeugt ein
  // Angreifer, der viele Anfragen parallel schickt.
  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      const z = await db.zugriffszaehler.upsert({
        where: { schluessel_fenster: { schluessel, fenster } },
        update: { anzahl: { increment: 1 } },
        create: { schluessel, fenster, anzahl: 1 },
      });
      return z.anzahl <= regel.anzahl;
    } catch {
      if (versuch === 0) continue;
      // Datenbank nicht erreichbar: die Bremse darf nicht der Grund sein, warum niemand mehr arbeiten kann
      return true;
    }
  }
  return true;
}

/** Alte Zählerzeilen wegräumen (läuft im stündlichen Hintergrundlauf mit). */
export async function bremseAufraeumen(): Promise<number> {
  const r = await db.zugriffszaehler.deleteMany({ where: { fenster: { lt: new Date(Date.now() - 24 * 3600000) } } });
  return r.count;
}

/** Voreinstellungen – bewusst großzügig, sie sollen nur Massenzugriffe abfangen. */
export const LIMITS = {
  /** Anmeldecode je Person: 5 in 15 Minuten – genug für „nochmal probieren", zu wenig zum Fluten */
  appCodePerson: { anzahl: 5, fensterMinuten: 15 } as BremsRegel,
  /** Anmeldecode je Absender-Adresse: 20 pro Stunde */
  appCodeIp: { anzahl: 20, fensterMinuten: 60 } as BremsRegel,
  /** Büro-Anmeldung je Absender-Adresse: 30 Versuche pro Stunde */
  loginIp: { anzahl: 30, fensterMinuten: 60 } as BremsRegel,
  /** Kurzbewerbung je Absender-Adresse: 5 pro Stunde */
  bewerbungIp: { anzahl: 5, fensterMinuten: 60 } as BremsRegel,
};
