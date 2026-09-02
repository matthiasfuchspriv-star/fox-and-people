/**
 * Reine Rechenregeln zum Referenzlohn – ohne Datenbank.
 *
 * Bewusst in einer eigenen Datei: Der Angebots-Editor läuft im Browser und braucht dieselbe
 * Rundung wie der Server. Würde er dafür `referenzlohn.ts` einbinden, zöge er den Datenbanktreiber
 * mit in den Browser-Bundle – und dieselbe Rechnung zweimal zu schreiben ist bei Löhnen keine
 * Option: Wenn Angebot und Einsatz um einen Cent auseinanderlaufen, ist genau das Lohndumping.
 */

/** Monatslohn ÷ Teiler = Stundenlohn. Metalltechnische Industrie und KV AKÜ rechnen mit 167 (38,5 h/Woche). */
export const MONATSTEILER_STANDARD = 167;

/**
 * Monatslohn → Stundenlohn. Auf den nächsten Cent **aufgerundet**, nicht kaufmännisch gerundet.
 *
 * Nachgerechnet gegen die Lohnverrechnung (Metalltechnische Industrie, Stichtag 1.11.2025): Nur so
 * stimmen alle elf Gruppen überein – 2.568,80 ÷ 167 = 15,3820 ergibt dort 15,39, nicht 15,38. Das
 * ist auch die einzig vertretbare Richtung: Bei einem Mindestlohn geht die Rundung zugunsten des
 * Mitarbeiters; ein Cent zu wenig ist Lohndumping.
 */
export const stundenlohnAusMonat = (monatsbrutto: number, teiler = MONATSTEILER_STANDARD) =>
  Math.ceil((monatsbrutto / (teiler || MONATSTEILER_STANDARD)) * 100) / 100;

/**
 * Stundenlohn einschließlich Referenzzuschlag. Der Zuschlag rechnet auf den bereits aufgerundeten
 * Stundenlohn und wird kaufmännisch gerundet – ebenfalls gegen die Lohnverrechnung geprüft
 * (15,39 × 1,09 = 16,7751 → 16,78; 15,39 × 1,13 = 17,3907 → 17,39; 16,16 × 1,13 = 18,2608 → 18,26).
 */
export const mitReferenzzuschlag = (stundenlohn: number, prozent: number) =>
  Math.round(stundenlohn * (1 + prozent / 100) * 100) / 100;
