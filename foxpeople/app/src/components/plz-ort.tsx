"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Postleitzahl eingeben, Ort kommt von selbst.
 *
 * Gibt es zur Postleitzahl genau einen Ort, wird er eingetragen (aber nicht überschrieben, wenn
 * schon etwas dort steht – der Eintrag des Menschen gewinnt). Gibt es mehrere, erscheinen sie als
 * Auswahl unter dem Feld. Nur Österreich, vier Ziffern.
 */
export function PlzOrt({ plzName = "plz", ortName = "ort", plzWert, ortWert }: {
  plzName?: string; ortName?: string; plzWert?: string | null; ortWert?: string | null;
}) {
  const [plz, setPlz] = useState(plzWert ?? "");
  const [ort, setOrt] = useState(ortWert ?? "");
  const [vorschlaege, setVorschlaege] = useState<string[]>([]);
  const ortBerührt = useRef(Boolean(ortWert));

  useEffect(() => {
    if (!/^\d{4}$/.test(plz)) { setVorschlaege([]); return; }
    let abgebrochen = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/plz?plz=${plz}`);
        const j = (await r.json()) as { ort: string | null; orte: string[] };
        if (abgebrochen) return;
        setVorschlaege(j.orte);
        // Nur übernehmen, was gesichert ist. Das amtliche Verzeichnis führt je Postleitzahl alle
        // Ortschaften auf – dessen erster Eintrag ist meistens nicht der Postort und darf deshalb
        // nicht ungefragt im Feld landen.
        if (j.ort && !ortBerührt.current) setOrt(j.ort);
      } catch { /* ohne Netz bleibt das Feld einfach leer */ }
    }, 250);
    return () => { abgebrochen = true; clearTimeout(t); };
  }, [plz]);

  return (
    <>
      <div className="field">
        <label className="label">PLZ</label>
        <input name={plzName} value={plz} onChange={(e) => setPlz(e.target.value.replace(/[^\d]/g, "").slice(0, 4))} className="input num" inputMode="numeric" />
      </div>
      <div className="field">
        <label className="label">Ort</label>
        <input name={ortName} value={ort} onChange={(e) => { ortBerührt.current = true; setOrt(e.target.value); }} className="input" list="plz-orte" />
        {vorschlaege.length > 1 && vorschlaege.length <= 8 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {vorschlaege.map((o) => (
              <button key={o} type="button" onClick={() => { ortBerührt.current = true; setOrt(o); }}
                className={`px-2 py-0.5 rounded-lg text-[12.5px] border ${o === ort ? "bg-brand-soft text-brand border-brand" : "border-line hover:bg-surface-2"}`}>{o}</button>
            ))}
          </div>
        )}
        {vorschlaege.length > 8 && <div className="hint mt-1">{vorschlaege.length} Ortschaften zu dieser Postleitzahl – ins Feld tippen, die Auswahl filtert mit.</div>}
        <datalist id="plz-orte">{vorschlaege.map((o) => <option key={o} value={o} />)}</datalist>
      </div>
    </>
  );
}
