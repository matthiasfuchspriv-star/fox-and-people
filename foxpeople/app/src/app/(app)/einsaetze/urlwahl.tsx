"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Auswahlfeld, das die Seite sofort mitbekommt.
 *
 * Die Einsatzplanung rechnet serverseitig: Welche Angebotspositionen es gibt, hängt am Kunden;
 * welcher Mindestlohn gilt und was im Dienstvertrag vorbelegt wird, hängt am Mitarbeiter. Diese
 * Seite liest beides aus der Adresszeile. Ein stummes Auswahlfeld setzt zwar den Formularwert, aber
 * nicht die Adresszeile – man wählte also den Kunden und durfte trotzdem kein Angebot auswählen,
 * weil der Server von der Wahl nichts wusste.
 *
 * Beim Wechsel wird verworfen, was zur alten Wahl gehört. Sonst bliebe der Verrechnungssatz des
 * vorigen Angebots stehen und wanderte still in den neuen Einsatz – und genau solche stillen
 * Übernahmen sind bei Geld das Gefährlichste.
 */
export function UrlWahl({ name, wert, optionen, zuruecksetzen = [], pflicht = true }: {
  name: string;
  wert: string;
  optionen: { id: string; label: string }[];
  zuruecksetzen?: string[];
  pflicht?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  // Eigener Zustand, damit die Auswahl sofort steht. Hinge das Feld allein an der Adresszeile,
  // spränge es bis zum Ende des Seitenaufbaus auf den alten Wert zurück – und wer in dieser
  // Zehntelsekunde abschickt, schickt den alten Kunden ab.
  const [gewaehlt, setGewaehlt] = useState(wert);
  useEffect(() => { setGewaehlt(wert); }, [wert]);

  const waehle = (neu: string) => {
    setGewaehlt(neu);
    const q = new URLSearchParams(Array.from(sp.entries()));
    for (const k of zuruecksetzen) q.delete(k);
    if (neu) q.set(name, neu); else q.delete(name);
    router.replace(`/einsaetze/neu?${q}`);
  };

  return (
    <select name={name} required={pflicht} value={gewaehlt} onChange={(e) => waehle(e.target.value)} className="select">
      <option value="">– wählen –</option>
      {optionen.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}
