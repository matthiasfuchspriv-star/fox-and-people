import { einstellung, setEinstellung } from "./einstellungen";
import { kvKuerzelAusText } from "./referenzlohn";

/**
 * Kollektivverträge, für die es keinen Referenzzuschlag gibt – einmal entschieden, nicht bei jedem Einsatz.
 *
 * Der Referenzzuschlag nach § 10 AÜG entsteht nur, wo der Beschäftiger-KV über dem KV AKÜ liegt und
 * dafür einen Satz vorsieht. Das ist in der metalltechnischen Industrie so, im Handel etwa nicht.
 *
 * Vorher hat die Software für jeden solchen Kunden bei jedem Einsatz eine Bestätigung verlangt. Das
 * ist nicht Sorgfalt, sondern eine Klickstrecke: Wer zwanzig Mal dasselbe bestätigt, liest beim
 * einundzwanzigsten Mal nicht mehr – und dann rutscht der Fall durch, auf den es angekommen wäre.
 *
 * Deshalb wird die Feststellung einmal je Kollektivvertrag getroffen und mit Name und Zeitpunkt
 * festgehalten. Sie gilt dann für jeden Kunden dieses KV. Sie lässt sich jederzeit zurücknehmen,
 * und sie steht in den Einstellungen sichtbar da – eine stille Ausnahme wäre wertlos.
 */
export interface KeinZuschlagEintrag {
  /** Kürzel der hinterlegten Tafel (z. B. HANDEL) oder – wenn keine passt – der KV-Text in Kleinschreibung */
  schluessel: string;
  bezeichnung: string;
  von: string;
  am: string;
  notiz?: string | null;
}

const KEY = "keinReferenzzuschlag";

/** Einheitlicher Schlüssel zu einem KV-Text: bevorzugt das Kürzel der Tafel, sonst der normalisierte Text. */
export function zuschlagSchluessel(kvText: string | null | undefined): string | null {
  const t = (kvText ?? "").trim();
  if (!t) return null;
  return kvKuerzelAusText(t) ?? t.toLowerCase().replace(/^kv\s+/, "").replace(/\s+/g, " ");
}

export async function keinZuschlagListe(): Promise<KeinZuschlagEintrag[]> {
  return einstellung<KeinZuschlagEintrag[]>(KEY, []);
}

/** Ist für diesen Beschäftiger-KV festgehalten, dass kein Referenzzuschlag anfällt? */
export async function keinZuschlagFuer(kvText: string | null | undefined): Promise<KeinZuschlagEintrag | null> {
  const s = zuschlagSchluessel(kvText);
  if (!s) return null;
  const liste = await keinZuschlagListe();
  return liste.find((e) => e.schluessel === s) ?? null;
}

export async function keinZuschlagMerken(kvText: string, von: string, notiz?: string | null) {
  const s = zuschlagSchluessel(kvText);
  if (!s) return;
  const liste = await keinZuschlagListe();
  if (liste.some((e) => e.schluessel === s)) return;
  liste.push({ schluessel: s, bezeichnung: kvText.trim(), von, am: new Date().toISOString(), notiz: notiz ?? null });
  await setEinstellung(KEY, liste);
}

export async function keinZuschlagLoeschen(schluessel: string) {
  const liste = await keinZuschlagListe();
  await setEinstellung(KEY, liste.filter((e) => e.schluessel !== schluessel));
}
