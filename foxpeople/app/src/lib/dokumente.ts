/**
 * Dokumentkategorien.
 *
 * Ausweis und Arbeitserlaubnis gehören zu den **Dokumenten**, nicht zu den Qualifikationen: Ein
 * Reisepass ist kein Nachweis einer Fähigkeit, sondern eine Kopie, die im Akt liegen muss. Bei
 * diesen Kategorien ist das Ablaufdatum Pflicht – ohne Datum kann niemand rechtzeitig erinnern.
 */
export const KATEGORIEN = [
  "Reisepass", "Personalausweis", "Aufenthaltstitel", "Arbeitserlaubnis", "Führerschein B",
  "Dienstvertrag", "Zusatzvereinbarung", "Lohnzettel", "Stundenzettel", "Einsatzbestätigung", "Qualifikationsnachweis",
  "Rahmenvertrag", "AGB-Bestätigung", "Angebot", "Rechnung", "Anmeldung ÖGK", "Sonstiges",
] as const;

/** Diese Kategorien gelten als Identitätsnachweis für den Einsatz. */
export const AUSWEIS_KATEGORIEN = ["Reisepass", "Personalausweis", "Aufenthaltstitel", "Ausweis"] as const; // "Ausweis" = Kategorie der Mitarbeiter-App

/** Diese Kategorien gelten als Arbeitsmarktzugang (AuslBG). */
export const BEWILLIGUNG_KATEGORIEN = ["Aufenthaltstitel", "Arbeitserlaubnis", "Aufenthaltstitel / Arbeitserlaubnis"] as const; // letzte = Kategorie der Mitarbeiter-App

/** Bei diesen Kategorien ist das Ablaufdatum ein Pflichtfeld. */
export const ABLAUF_PFLICHT = ["Reisepass", "Personalausweis", "Aufenthaltstitel", "Arbeitserlaubnis", "Aufenthaltstitel / Arbeitserlaubnis", "Ausweis", "Führerschein B"] as const;

/**
 * Vergleich ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen am Rand. Kategorien aus
 * übernommenen Akten stehen nicht immer exakt so da wie in der Liste ("REISEPASS", "reisepass ");
 * eine Ausweiskopie, die wegen eines Großbuchstabens nicht als solche zählt, ist ein Ärgernis, das
 * niemand von außen erklären kann.
 */
const enthaelt = (liste: readonly string[], kategorie: string) => {
  const k = (kategorie ?? "").trim().toLowerCase();
  return liste.some((x) => x.toLowerCase() === k);
};

export const brauchtAblaufdatum = (kategorie: string) => enthaelt(ABLAUF_PFLICHT, kategorie);
export const istAusweis = (kategorie: string) => enthaelt(AUSWEIS_KATEGORIEN, kategorie);
export const istBewilligung = (kategorie: string) => enthaelt(BEWILLIGUNG_KATEGORIEN, kategorie);

/**
 * Qualifikationen sind **Fähigkeiten**, keine Papiere.
 *
 * Ausweis, Aufenthaltstitel und Arbeitserlaubnis standen bisher in derselben Liste. Das führte zu
 * zwei Ablagen für dieselbe Sache: Der Ausweis lag mal hier, mal dort, und die Ablaufüberwachung sah
 * nur eine der beiden Stellen. Solche Papiere gehören unter Dokumente – dort ist das Ablaufdatum
 * Pflicht und die Wiedervorlage hängt daran.
 */
export const QUALIFIKATIONSTYPEN = [
  "Führerschein B",
  "Staplerschein",
  "Kranschein",
  "Lehrabschluss (LAP)",
] as const;
