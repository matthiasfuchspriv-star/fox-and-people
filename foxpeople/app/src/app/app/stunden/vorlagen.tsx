"use client";

/**
 * Schichtvorlagen: ein Tipp füllt Beginn, Ende und Pause für Montag bis Freitag. Das Tippen der Zeiten
 * ist der größte Zeitfresser der App – mit einer Vorlage dauert die Woche zehn Sekunden statt zwei Minuten.
 * Die Felder bleiben danach ganz normal änderbar.
 */
export interface Schicht { name: string; beginn: string; ende: string; pause: number }

export const SCHICHTEN: Schicht[] = [
  { name: "Früh 6–14", beginn: "06:00", ende: "14:00", pause: 30 },
  { name: "Tag 7–16", beginn: "07:00", ende: "16:00", pause: 30 },
  { name: "Spät 14–22", beginn: "14:00", ende: "22:00", pause: 30 },
  { name: "Nacht 22–6", beginn: "22:00", ende: "06:00", pause: 30 },
];

const FELDER = ["mo", "di", "mi", "do", "fr", "sa", "so"];

export function SchichtVorlagen({ label }: { label: string }) {
  const setzen = (s: Schicht) => {
    for (let i = 0; i < 5; i++) {
      const f = FELDER[i];
      const b = document.querySelector<HTMLInputElement>(`input[name="${f}_beginn"]`);
      const e = document.querySelector<HTMLInputElement>(`input[name="${f}_ende"]`);
      const pa = document.querySelector<HTMLInputElement>(`input[name="${f}_pause"]`);
      const st = document.querySelector<HTMLInputElement>(`input[name="${f}"]`);
      if (!b || b.readOnly) return;
      b.value = s.beginn; if (e) e.value = s.ende; if (pa) pa.value = String(s.pause);
      if (st) st.value = "";
    }
  };
  const leeren = () => {
    for (const f of FELDER) {
      for (const n of [`${f}_beginn`, `${f}_ende`, `${f}_pause`, f]) {
        const el = document.querySelector<HTMLInputElement>(`input[name="${n}"]`);
        if (el && !el.readOnly) el.value = "";
      }
    }
  };
  return (
    <div>
      <div className="text-[12.5px] text-muted mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {SCHICHTEN.map((s) => (
          <button key={s.name} type="button" onClick={() => setzen(s)} className="btn btn-secondary btn-sm justify-center !py-2.5">{s.name}</button>
        ))}
      </div>
      <button type="button" onClick={leeren} className="text-[12.5px] text-muted underline mt-2">Alles leeren</button>
    </div>
  );
}
