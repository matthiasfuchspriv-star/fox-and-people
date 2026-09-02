"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";

export interface WerdegangZeile { zeitraum: string; firma: string; taetigkeit: string; notiz: string | null }

/** Werdegang für das Kundenprofil – Zeilen mit „+ Zeile“ hinzufügen, leere Zeilen werden beim Speichern ignoriert. */
export function WerdegangTabelle({ start }: { start: WerdegangZeile[] }) {
  const [rows, setRows] = useState<WerdegangZeile[]>(start.length ? start : [{ zeitraum: "", firma: "", taetigkeit: "", notiz: "" }]);
  const set = (i: number, k: keyof WerdegangZeile, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div>
      <div className="overflow-x-auto"><table className="table"><thead><tr><th className="w-[18%]">Zeitraum</th><th className="w-[26%]">Firma</th><th className="w-[28%]">Tätigkeit</th><th>Notiz</th><th></th></tr></thead>
        <tbody>{rows.map((z, i) => (
          <tr key={i}>
            <td><input name="be_zeitraum" value={z.zeitraum} onChange={(e) => set(i, "zeitraum", e.target.value)} className="input" placeholder="2020 – 2025" /></td>
            <td><input name="be_firma" value={z.firma} onChange={(e) => set(i, "firma", e.target.value)} className="input" placeholder="Spar" /></td>
            <td><input name="be_taetigkeit" value={z.taetigkeit} onChange={(e) => set(i, "taetigkeit", e.target.value)} className="input" placeholder="Lagerarbeiter" /></td>
            <td><input name="be_notiz" value={z.notiz ?? ""} onChange={(e) => set(i, "notiz", e.target.value)} className="input" /></td>
            <td className="r"><button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm text-red" title="Zeile entfernen"><X size={14} /></button></td>
          </tr>
        ))}</tbody></table></div>
      <button type="button" onClick={() => setRows((r) => [...r, { zeitraum: "", firma: "", taetigkeit: "", notiz: "" }])} className="btn btn-secondary btn-sm mt-3"><Plus size={14} /> Zeile hinzufügen</button>
    </div>
  );
}
