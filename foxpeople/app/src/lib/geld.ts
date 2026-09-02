/**
 * Die eine Rundungsfunktion für Geldbeträge.
 *
 * Vorher war eine vereinfachte Variante (`Math.round(n * 100) / 100`) an mehreren Stellen einzeln
 * hingeschrieben. Die rundet halbe Cent je nach Rechenweg unterschiedlich: `Math.round(1.005 * 100)`
 * ergibt 100, also 1,00 statt kaufmännisch 1,01 – weil 1.005 im Rechner in Wahrheit knapp darunter
 * liegt. Dadurch konnte derselbe Betrag auf dem Stundennachweis und auf der Rechnung um einen Cent
 * auseinandergehen. Die Korrektur mit EPSILON hebt den Wert um genau diesen Rechenfehler an.
 */
export const cent = (n: number): number => Math.round((n + Number.EPSILON * Math.sign(n) * Math.abs(n)) * 100) / 100;

/** Umsatzsteuer aus dem Nettobetrag, auf Cent gerundet. */
export const ustBetrag = (netto: number, prozent: number): number => cent(netto * (prozent / 100));

/**
 * Rechnungssummen aus den Positionen bilden – nie umgekehrt.
 *
 * Der Nettobetrag ist die Summe der bereits gerundeten Positionsbeträge. Damit stimmt die Rechnung
 * auf den Cent: Wer die Positionen zusammenzählt, kommt exakt auf den ausgewiesenen Nettobetrag.
 * Vorher wurde netto aus ungerundeten Werten gebildet und die Positionen einzeln gerundet – das ging
 * bis zu fünf Cent auseinander und fällt jedem Buchhalter auf (§ 11 UStG).
 */
export function summen(positionen: { betrag: number }[], ustProzent: number): { netto: number; ust: number; brutto: number } {
  const netto = cent(positionen.reduce((a, p) => a + cent(p.betrag), 0));
  const ust = ustBetrag(netto, ustProzent);
  return { netto, ust, brutto: cent(netto + ust) };
}
