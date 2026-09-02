import { db } from "./db";
import { istSprache, uebersetzer, type Sprache, type T } from "./i18n";

/** Lädt die Sprache des angemeldeten Mitarbeiters und liefert die Übersetzungsfunktion dazu. */
export async function appT(personId: string): Promise<{ t: T; sprache: Sprache }> {
  const p = await db.person.findUnique({ where: { id: personId }, select: { appSprache: true } });
  const sprache = istSprache(p?.appSprache);
  return { t: uebersetzer(sprache), sprache };
}
