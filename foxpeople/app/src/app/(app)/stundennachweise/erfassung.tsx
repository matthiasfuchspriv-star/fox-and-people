import { Field } from "@/components/ui";
import { datum } from "@/lib/format";
import { wochentage, FEHLZEITEN } from "@/lib/zeitaufzeichnung";

/**
 * Arbeitszeitaufzeichnung nach § 26 AZG – dieselbe Maske wie die Wochenvorlage „Stundennachweis“:
 * Tag · Datum · Ort · Beginn · Ende · Pause · Gesamtstd. · Normalstd. · Ü-Std. 50 % · Ü-Std. 100 % · Fehlzeit · Anmerkung.
 * Bleiben Gesamt/Normal/Ü leer, rechnet das Programm sie aus Beginn, Ende und Pause.
 */
export function ZeitRaster({ jahr, kw, werte, ort }: { jahr: number; kw: number; werte?: { beginn?: string | null; ende?: string | null; pauseMin?: number | null; gesamt?: number | null; normal?: number | null; ue50?: number | null; ue100?: number | null; fehlzeit?: string | null; anmerkung?: string | null; ort?: string | null }[]; ort?: string | null }) {
  const tage = wochentage(jahr, kw);
  return (
    <div className="overflow-x-auto">
      <table className="table text-[12.5px]">
        <thead><tr><th>Tag</th><th>Datum</th><th>Ort</th><th>Beginn</th><th>Ende</th><th className="r">Pause min</th><th className="r">Gesamt</th><th className="r">Normal</th><th className="r">Ü 50 %</th><th className="r">Ü 100 %</th><th>Fehlzeit</th><th>Anmerkung</th></tr></thead>
        <tbody>{tage.map((t, i) => { const v = werte?.[i] ?? {}; return (
          <tr key={i} className={t.feiertag || i > 4 ? "bg-surface-2" : undefined}>
            <td className="font-semibold">{t.kurz}</td>
            <td className="whitespace-nowrap">{datum(t.datum)}{t.feiertag && <span className="text-[11px] text-muted"> · Feiertag</span>}</td>
            <td><input name={`d${i}_ort`} defaultValue={v.ort ?? (i < 5 ? ort ?? "" : "")} className="input !py-1 !px-2 min-w-[110px]" /></td>
            <td><input name={`d${i}_beginn`} defaultValue={v.beginn ?? ""} placeholder={i < 5 ? "07:00" : ""} className="input !py-1 !px-2 w-[70px] text-center" /></td>
            <td><input name={`d${i}_ende`} defaultValue={v.ende ?? ""} placeholder={i < 5 ? "16:00" : ""} className="input !py-1 !px-2 w-[70px] text-center" /></td>
            <td><input name={`d${i}_pause`} defaultValue={v.pauseMin ?? ""} placeholder={i < 5 ? "30" : ""} className="input num !py-1 !px-2 w-[62px] text-center" inputMode="numeric" /></td>
            <td><input name={`d${i}_gesamt`} defaultValue={v.gesamt ?? ""} className="input num !py-1 !px-2 w-[62px] text-right" inputMode="decimal" /></td>
            <td><input name={`d${i}_normal`} defaultValue={v.normal ?? ""} className="input num !py-1 !px-2 w-[62px] text-right" inputMode="decimal" /></td>
            <td><input name={`d${i}_ue50`} defaultValue={v.ue50 ?? ""} className="input num !py-1 !px-2 w-[62px] text-right" inputMode="decimal" /></td>
            <td><input name={`d${i}_ue100`} defaultValue={v.ue100 ?? ""} className="input num !py-1 !px-2 w-[62px] text-right" inputMode="decimal" /></td>
            <td><select name={`d${i}_fehlzeit`} defaultValue={v.fehlzeit ?? ""} className="select !py-1 !px-2 min-w-[110px]">{FEHLZEITEN.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select></td>
            <td><input name={`d${i}_anmerkung`} defaultValue={v.anmerkung ?? ""} className="input !py-1 !px-2 min-w-[130px]" /></td>
          </tr>
        ); })}</tbody>
      </table>
      <p className="help mt-2">Gesamt-, Normal- und Überstunden bleiben am besten leer – das Programm rechnet sie aus Beginn, Ende und Pause: Stunden über der Tagesnormalarbeitszeit oder über der Wochennormalarbeitszeit sind 50-%-Überstunden, Sonn- und Feiertagsstunden 100-%-Überstunden. Eingetragene Werte haben Vorrang.</p>
    </div>
  );
}

export function ZeitKopf({ jahr, kw, personen, ok }: { jahr: number; kw: number; personen: { id: string; vorname: string; nachname: string }[]; ok?: string }) {
  return (
    <div className="grid sm:grid-cols-4 gap-3">
      <Field label="Mitarbeiter" required className="sm:col-span-2"><select name="personId" required className="select"><option value="">– wählen –</option>{personen.map((p) => <option key={p.id} value={p.id}>{p.nachname} {p.vorname}</option>)}</select></Field>
      <Field label="Jahr"><input name="jahr" defaultValue={jahr} className="input num" /></Field>
      <Field label="Kalenderwoche"><input name="kw" defaultValue={kw} className="input num" /></Field>
    </div>
  );
}
