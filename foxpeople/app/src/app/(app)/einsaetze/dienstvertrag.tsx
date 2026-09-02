import { Field } from "@/components/ui";
import { isoDate } from "@/lib/format";

export type KvOption = { id: string; name: string; kuerzel?: string; lohntabelle: { beschaeftigungsgruppe: string; bezeichnung: string | null }[] };
export type DienstvertragWerte = {
  kvId: string | null; beschaeftigungsgruppe: string | null; angestellt: boolean; eintrittsdatum: Date | null; austrittsdatum?: Date | null;
  urlaubsanspruchTage: number; lehreEndeAm: Date | null; durchrechnungStart: Date | null; durchrechnungMonate: number;
};

/**
 * Felder des Dienstverhältnisses (KV, Beschäftigungsgruppe, Arbeiter/Angestellte, Eintritt, Urlaub, Durchrechnung).
 * Werden am Einsatz erfasst und auf den Personalstamm übernommen – nicht mehr bei der Personenanlage.
 */
export function DienstvertragFelder({ kvs, w, eintrittVorschlag, mitAustritt }: { kvs: KvOption[]; w: Partial<DienstvertragWerte>; eintrittVorschlag?: string; mitAustritt?: boolean }) {
  return (
    <>
      <Field label="Kollektivvertrag" help="Gilt für den Dienstvertrag (Überlasser-KV bzw. KV des Beschäftigers bei Direktvermittlung).">
        {/* Unser eigener Kollektivvertrag ist der KV AKÜ – die Beschäftiger-KV stehen nur als
            Referenzlohn dahinter. Deshalb ist er vorbelegt, statt eine leere Auswahl anzubieten. */}
        <select name="kvId" defaultValue={w.kvId ?? kvs.find((k) => k.kuerzel === "AKÜ")?.id ?? ""} className="select"><option value="">–</option>{kvs.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
      </Field>
      <Field label="Beschäftigungsgruppe">
        <input name="beschaeftigungsgruppe" defaultValue={w.beschaeftigungsgruppe ?? ""} className="input" list="bg-einsatz" />
        <datalist id="bg-einsatz">{kvs.flatMap((k) => k.lohntabelle).map((l, i) => <option key={i} value={l.beschaeftigungsgruppe}>{l.bezeichnung ?? ""}</option>)}</datalist>
      </Field>
      <Field label="Arbeiter / Angestellte" help="Bestimmt Kündigungsfristen (KV AKÜ bzw. AngG). Standard ist Arbeiter/in – das ist bei uns der Regelfall.">
        <select name="angestellt" defaultValue={w.angestellt ? "1" : "0"} className="select"><option value="0">Arbeiter/in (KV AKÜ)</option><option value="1">Angestellte/r (AngG)</option></select>
      </Field>
      <Field label="Eintritt (Dienstvertrag)" help="Leer = Einsatzbeginn"><input type="date" name="eintrittsdatum" defaultValue={isoDate(w.eintrittsdatum ?? null) || eintrittVorschlag || ""} className="input" /></Field>
      {mitAustritt && <Field label="Austritt"><input type="date" name="austrittsdatum" defaultValue={isoDate(w.austrittsdatum ?? null)} className="input" /></Field>}
      <Field label="Urlaubsanspruch (Werktage/Jahr)"><input name="urlaubsanspruchTage" defaultValue={w.urlaubsanspruchTage ?? 25} className="input num" inputMode="numeric" /></Field>
      <Field label="Lehrzeitende (Behaltefrist § 18 BAG)"><input type="date" name="lehreEndeAm" defaultValue={isoDate(w.lehreEndeAm ?? null)} className="input" /></Field>
      <Field label="Durchrechnung: Beginn" help="Leer = Eintritt"><input type="date" name="durchrechnungStart" defaultValue={isoDate(w.durchrechnungStart ?? null)} className="input" /></Field>
      <Field label="Durchrechnungszeitraum (Monate)" help="Zeitkonto wird zum Ende ausgeglichen."><input name="durchrechnungMonate" defaultValue={w.durchrechnungMonate ?? 12} className="input num" inputMode="numeric" /></Field>
    </>
  );
}

/** Formularwerte des Dienstvertrags für das Person-Update auslesen. */
export function dienstvertragAusForm(fd: FormData, parse: { parseDate: (v: FormDataEntryValue | null) => Date | null; parseNum: (v: FormDataEntryValue | null) => number | null; strOrNull: (v: FormDataEntryValue | null) => string | null }, eintrittFallback: Date | null) {
  const { parseDate, parseNum, strOrNull } = parse;
  return {
    kvId: strOrNull(fd.get("kvId")),
    beschaeftigungsgruppe: strOrNull(fd.get("beschaeftigungsgruppe")),
    angestellt: fd.get("angestellt") === "1",
    eintrittsdatum: parseDate(fd.get("eintrittsdatum")) ?? eintrittFallback,
    ...(fd.has("austrittsdatum") ? { austrittsdatum: parseDate(fd.get("austrittsdatum")) } : {}),
    urlaubsanspruchTage: parseNum(fd.get("urlaubsanspruchTage")) ?? 25,
    lehreEndeAm: parseDate(fd.get("lehreEndeAm")),
    durchrechnungStart: parseDate(fd.get("durchrechnungStart")),
    durchrechnungMonate: parseNum(fd.get("durchrechnungMonate")) ?? 12,
  };
}
