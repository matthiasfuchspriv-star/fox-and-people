"use client";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Rolle wählen – und damit zugleich die Angebotsposition.
 *
 * Vorher waren das zwei Felder: eine freie Rolle und daneben eine Positionsauswahl. Wer die Rolle
 * anders schrieb als im Angebot („Staplerfahrer" statt „Lagerarbeiter Stapler"), fand die Position
 * nicht mehr – und legte den Einsatz ohne Verrechnungssatz und ohne KV-Einstufung an. Deshalb kommt
 * die Rolle jetzt aus dem angenommenen Angebot des Kunden; die Position wird mitgewählt.
 *
 * Eine freie Rolle bleibt möglich (Auswahl „andere Rolle …“), weil nicht jede Überlassung im Angebot
 * steht – dann fehlen die Vorbelegungen aber, und das steht auch daneben.
 */
export function Rollenwahl({ positionen, aktuelleRolle, freiText }: {
  positionen: { id: string; angebotId: string; rolle: string; satz: string }[];
  aktuelleRolle: string;
  freiText: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const positionId = sp.get("positionId") ?? "";

  const waehle = (wert: string) => {
    const q = new URLSearchParams(Array.from(sp.entries()));
    // Was aus der Position kommt, wird neu vorbelegt – alte Eingaben dürfen nicht dazwischenfunken
    for (const k of ["rolle", "verrechnungssatz", "stundenlohn", "wochenstunden", "zulage", "konflikte", "positionId", "angebotId"]) q.delete(k);
    if (wert === "__frei") q.set("rolleFrei", "1");
    else {
      q.delete("rolleFrei");
      const pos = positionen.find((p) => p.id === wert);
      if (pos) { q.set("positionId", pos.id); q.set("angebotId", pos.angebotId); q.set("rolle", pos.rolle); }
    }
    router.replace(`/einsaetze/neu?${q}`);
  };

  if (freiText || positionen.length === 0) {
    return (
      <>
        <input name="rolle" required defaultValue={aktuelleRolle} className="input" placeholder="z. B. Staplerfahrer" />
        {positionen.length > 0 && (
          <button type="button" onClick={() => waehle(positionen[0].id)} className="text-[12.5px] underline text-muted mt-1">
            Doch eine Position aus dem Angebot wählen
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <select value={positionId} onChange={(e) => waehle(e.target.value)} className="select">
        <option value="">– Rolle aus dem Angebot wählen –</option>
        {positionen.map((p) => <option key={p.id} value={p.id}>{p.rolle} · {p.satz}</option>)}
        <option value="__frei">andere Rolle (ohne Angebot) …</option>
      </select>
      <input type="hidden" name="rolle" value={aktuelleRolle} />
    </>
  );
}
