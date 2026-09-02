import { MERKMALE_MITARBEITER, MERKMALE_BESCHAEFTIGER } from "@/lib/bewertung";

/** Sterne 1–5 als große Auswahl, Merkmal-Chips (Mehrfachauswahl) und Freitext – für alle Bewertungsformulare. */
export function BewertungFelder({ ziel, kommentarPlaceholder, standard = 4, kompakt }: { ziel: "MITARBEITER" | "BESCHAEFTIGER"; kommentarPlaceholder?: string; standard?: number; kompakt?: boolean }) {
  const m = ziel === "MITARBEITER" ? MERKMALE_MITARBEITER : MERKMALE_BESCHAEFTIGER;
  const chip = "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-line-2 text-[12.5px] cursor-pointer select-none peer-checked:bg-brand peer-checked:text-white peer-checked:border-brand";
  return (
    <div className="space-y-3">
      <div>
        <div className="label mb-1">Bewertung in Füchsen (1 = schlecht, 5 = sehr gut) <span className="text-red">*</span></div>
        <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex-1"><input type="radio" name="sterne" value={n} defaultChecked={n === standard} required className="peer sr-only" /><span className={`block text-center ${kompakt ? "py-2 text-[12.5px]" : "py-3 text-[15px]"} border border-line-2 rounded-[3px] cursor-pointer peer-checked:bg-fox peer-checked:text-white peer-checked:border-fox font-display font-bold whitespace-nowrap`}>{kompakt ? `${n} 🦊` : "🦊".repeat(n)}</span></label>)}</div>
      </div>
      <div>
        <div className="label mb-1">Was trifft zu? <span className="text-muted font-normal">(mehrere möglich)</span></div>
        <div className="flex flex-wrap gap-1.5">{m.positiv.map((x) => <label key={x}><input type="checkbox" name="merkmal" value={x} className="peer sr-only" /><span className={chip}>{x}</span></label>)}</div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">{m.negativ.map((x) => <label key={x}><input type="checkbox" name="merkmal" value={x} className="peer sr-only" /><span className={`${chip} border-red/40 text-red peer-checked:bg-red peer-checked:border-red`}>{x}</span></label>)}</div>
      </div>
      <div>
        <div className="label mb-1">Freitext</div>
        <textarea name="kommentar" rows={kompakt ? 2 : 4} className="textarea" placeholder={kommentarPlaceholder ?? "Was lief gut, was könnte besser sein? (optional)"} />
      </div>
    </div>
  );
}

/** Merkmale einer gespeicherten Bewertung als kleine Chips. */
export function MerkmalChips({ merkmale }: { merkmale: string[] }) {
  if (!merkmale?.length) return null;
  const neg = new Set([...MERKMALE_MITARBEITER.negativ, ...MERKMALE_BESCHAEFTIGER.negativ]);
  return <div className="flex flex-wrap gap-1 mt-1">{merkmale.map((m) => <span key={m} className={`badge ${neg.has(m) ? "badge-red" : "badge-teal"}`}>{m}</span>)}</div>;
}
