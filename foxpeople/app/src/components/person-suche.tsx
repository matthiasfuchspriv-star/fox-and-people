"use client";
import { useEffect, useRef, useState } from "react";

type Treffer = { id: string; name: string; zusatz: string };

/**
 * Person suchen statt aus einer endlosen Liste klauben.
 *
 * Eine Auswahlliste mit tausend Namen ist keine Auswahl mehr: Man findet niemanden, und tippen geht
 * auch nicht. Hier tippt man zwei Buchstaben, der Server sucht über den gesamten Bestand und liefert
 * die besten 25 – aktive Mitarbeiter zuerst.
 *
 * Die gewählte Person steht in einem versteckten Feld; solange keine gewählt ist, bleibt es leer und
 * das Formular verlangt sie. Ein bereits gewählter Name wird beim Weitertippen wieder verworfen –
 * sonst könnte im Feld ein Name stehen und abgeschickt würde ein anderer.
 */
export function PersonSuche({ name = "personId", pflicht = false }: { name?: string; pflicht?: boolean }) {
  const [text, setText] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [gewaehlt, setGewaehlt] = useState<Treffer | null>(null);
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gewaehlt || text.trim().length < 2) { setTreffer([]); return; }
    let abgebrochen = false;
    setLaeuft(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/personen?q=${encodeURIComponent(text.trim())}`);
        const j = (await r.json()) as { treffer: Treffer[] };
        if (!abgebrochen) { setTreffer(j.treffer); setOffen(true); }
      } catch { if (!abgebrochen) setTreffer([]); }
      finally { if (!abgebrochen) setLaeuft(false); }
    }, 220);
    return () => { abgebrochen = true; clearTimeout(t); setLaeuft(false); };
  }, [text, gewaehlt]);

  useEffect(() => {
    const zu = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOffen(false); };
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, []);

  return (
    <div className="relative" ref={box}>
      <input type="hidden" name={name} value={gewaehlt?.id ?? ""} />
      <input
        className="input"
        value={gewaehlt ? gewaehlt.name : text}
        placeholder="Name eintippen …"
        autoComplete="off"
        required={pflicht && !gewaehlt}
        onChange={(e) => { setGewaehlt(null); setText(e.target.value); }}
        onFocus={() => { if (treffer.length) setOffen(true); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOffen(false); }}
      />
      {gewaehlt && (
        <button type="button" className="absolute right-2 top-2 text-[12px] text-muted underline" onClick={() => { setGewaehlt(null); setText(""); }}>ändern</button>
      )}
      {offen && !gewaehlt && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface shadow-lg max-h-72 overflow-auto">
          {laeuft && <div className="px-3 py-2 text-[13px] text-muted">sucht …</div>}
          {!laeuft && treffer.length === 0 && text.trim().length >= 2 && (
            <div className="px-3 py-2 text-[13px] text-muted">Niemand gefunden. Anderer Namensteil? Gesucht wird in Vor- und Nachname.</div>
          )}
          {treffer.map((t) => (
            <button key={t.id} type="button" className="block w-full text-left px-3 py-2 hover:bg-surface-2 text-[13px]" onClick={() => { setGewaehlt(t); setOffen(false); }}>
              <span className="font-semibold">{t.name}</span>
              {t.zusatz && <span className="text-muted"> · {t.zusatz}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
