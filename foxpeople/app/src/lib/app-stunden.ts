import { db } from "./db";

/**
 * Darf dieser Mitarbeiter seine Stunden selbst in der App erfassen?
 *
 * Standard ist **nein** (Entscheidung Matthias, 30.08.2026). Freigeschaltet wird es je Einsatz bei der
 * Einsatzanlage – dort steht das Häkchen „Mitarbeiter darf Stunden in der App erfassen". Solange kein
 * laufender Einsatz das gesetzt hat, taucht der Stundenzettel in der App gar nicht auf: kein Menüpunkt,
 * keine Erinnerung, keine Kachel. So kommen die Wochenzettel weiterhin auf dem gewohnten Weg herein,
 * und die App-Erfassung wird gezielt bei den Beschäftigern eingeschaltet, bei denen sie passt.
 */
export async function stundenerfassungAktiv(personId: string): Promise<boolean> {
  const e = await db.einsatz.findFirst({
    where: { personId, status: "AKTIV", stundenerfassungApp: true },
    select: { id: true },
  });
  return !!e;
}
