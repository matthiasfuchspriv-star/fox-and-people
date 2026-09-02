"use client";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Angebotsposition auswählen – daraus wird der ganze Einsatz vorbelegt.
 *
 * Der Weg ist bewusst über die Adresszeile und nicht über JavaScript im Formular: Die Vorbelegung
 * hängt an Werten, die nur der Server kennt (maßgeblicher Mindestlohn, Referenzzuschlag, Zulagen
 * des Beschäftiger-KV). Ein Neuladen mit der gewählten Position liefert alles aus einer Hand,
 * statt die Rechenlogik ein zweites Mal im Browser nachzubauen – was garantiert irgendwann
 * auseinanderläuft.
 */
export function Positionswahl({ positionen }: {
  positionen: { id: string; label: string; angebotId: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const aktuell = sp.get("positionId") ?? "";

  return (
    <select
      className="select"
      value={aktuell}
      onChange={(e) => {
        const q = new URLSearchParams(Array.from(sp.entries()));
        const pos = positionen.find((p) => p.id === e.target.value);
        if (pos) { q.set("positionId", pos.id); q.set("angebotId", pos.angebotId); }
        else { q.delete("positionId"); q.delete("angebotId"); }
        // Was aus der Position kommt, wird neu vorbelegt – alte Eingaben dürfen nicht dazwischenfunken
        for (const k of ["rolle", "verrechnungssatz", "stundenlohn", "wochenstunden", "zulage", "konflikte"]) q.delete(k);
        router.replace(`/einsaetze/neu?${q}`);
      }}
    >
      <option value="">– keine Position (Sätze von Hand) –</option>
      {positionen.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}
