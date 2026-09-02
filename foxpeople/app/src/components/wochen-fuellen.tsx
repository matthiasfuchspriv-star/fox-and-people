"use client";
import { Check } from "lucide-react";

/**
 * „Ganze Woche anwesend“ – setzt Montag bis Freitag auf X.
 *
 * Ohne das klickt man je Mitarbeiter und Woche fünfmal; bei zwanzig Mitarbeitern und fünf Wochen sind
 * das fünfhundert Klicks für den Normalfall „war da und hat gearbeitet“. Feiertage bleiben leer – sie
 * zählen ohnehin nicht in die Sollstunden, und ein X am Feiertag würde nur Fragen aufwerfen.
 * Schon gesetzte K/U/Z-Tage werden **nicht** überschrieben: Eine erfasste Krankheit darf ein
 * Sammelklick nicht stillschweigend wegräumen.
 */
export function WocheFuellen({ praefix, spalte, feiertage, titel = "Ganze Woche anwesend (Mo–Fr)" }: {
  /** gemeinsamer Namensanfang der sieben Auswahlfelder, z. B. "wt_<personId>_2026_36_" */
  praefix: string;
  /** optional: Teilstring für eine ganze Spalte über alle Mitarbeiter, z. B. "_2026_36_" */
  spalte?: string;
  /** Indizes 0–6 der Feiertage in dieser Woche */
  feiertage: number[];
  titel?: string;
}) {
  const fuellen = () => {
    for (let i = 0; i < 5; i++) {
      if (feiertage.includes(i)) continue;
      // alle passenden Felder – der Präfix trifft je nach Aufruf eine Zelle oder eine ganze Spalte
      const wahl = spalte
        ? `select[name^="${praefix}"][name*="${spalte}"][name$="_${i}"]`
        : `select[name^="${praefix}"][name$="_${i}"]`;
      const felder = document.querySelectorAll<HTMLSelectElement>(wahl);
      felder.forEach((f) => { if (f.value === "" || f.value === "F") f.value = "X"; });
    }
  };
  return (
    <button type="button" onClick={fuellen} title={titel} className="btn btn-ghost btn-sm !px-1.5 !py-0.5 text-[11px]">
      <Check size={12} /> Woche
    </button>
  );
}
