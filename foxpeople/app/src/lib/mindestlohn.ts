import { db } from "./db";
import { referenzlohnErmitteln, type ReferenzlohnErgebnis } from "./referenzlohn";
import { keinZuschlagFuer } from "./referenz-entscheidung";

/**
 * Lohn- und Sozialdumping-Schutz (LSD-BG, § 10 AÜG): Ein überlassener Mitarbeiter bekommt immer den besseren
 * Kollektivvertrag – den Mindestlohn der Beschäftigungsgruppe im KV Arbeitskräfteüberlassung oder den Referenzlohn
 * des Beschäftiger-KV, je nachdem, was höher ist. Die Differenz auf den AKÜ-Grundlohn ist der **Referenzzuschlag**
 * und wird auf der Lohnabrechnung gesondert ausgewiesen. Zusätzlich gilt die Hausregel: bis 31.12.2026 verdient
 * kein Mitarbeiter unter 13,90 €/Std (= KV AKÜ Gruppe A/B 2026).
 */
export { MINDESTLOHN_ABSOLUT, mindestlohnAbsolut } from "./mindestlohn-regel";
import { mindestlohnAbsolut } from "./mindestlohn-regel";

export interface MindestlohnErgebnis {
  mindest: number;
  quellen: string[];
  akue: number | null;
  referenz: number | null;
  absolut: number;
  /** Differenz Referenzlohn − AKÜ-Grundlohn, gesondert auf der Lohnabrechnung auszuweisen. */
  referenzzuschlag: number;
  /** true = Referenzlohn ist im System nicht exakt hinterlegt und muss händisch geprüft werden. */
  referenzPruefen: boolean;
  /** Lohntafel des Beschäftiger-KV liegt vor, aber die Beschäftigungsgruppe fehlt oder passt nicht. */
  gruppeFehlt: boolean;
  referenzQuelle: ReferenzlohnErgebnis | null;
}

/**
 * Ermittelt den maßgeblichen Mindestlohn: max(KV AKÜ der Beschäftigungsgruppe, Referenzlohn Beschäftiger-KV, Hausregel).
 * kvId = KV am Dienstvertrag (i. d. R. AKÜ); beschaeftigerKv = Kunde.referenzKvId oder Kunde.kollektivvertrag.
 */
export async function massgeblicherMindestlohn(opts: {
  kvId?: string | null;
  beschaeftigungsgruppe?: string | null;
  beschaeftigerKv?: string | null;
  beschaeftigerBg?: string | null;
  eintritt?: Date | null;
  am?: Date;
}): Promise<MindestlohnErgebnis> {
  const absolut = mindestlohnAbsolut(opts.am);
  const quellen: string[] = [`Hausregel ${absolut.toFixed(2)} €`];
  let akue: number | null = null, referenz: number | null = null;
  const bg = (opts.beschaeftigungsgruppe ?? "").trim().toUpperCase();
  const kv = opts.kvId
    ? await db.kollektivvertrag.findUnique({ where: { id: opts.kvId }, include: { lohntabelle: true } })
    : await db.kollektivvertrag.findFirst({ where: { kuerzel: "AKÜ" }, include: { lohntabelle: true } });
  const stufe = kv?.lohntabelle.find((l) => l.beschaeftigungsgruppe.toUpperCase() === bg
    || bg.startsWith(l.beschaeftigungsgruppe.toUpperCase() + " ") || bg.endsWith(" " + l.beschaeftigungsgruppe.toUpperCase()));
  if (stufe?.mindestStundenlohn != null) { akue = stufe.mindestStundenlohn; quellen.push(`${kv!.kuerzel} ${stufe.beschaeftigungsgruppe} ${akue.toFixed(2)} €`); }
  else if (stufe?.mindestMonatsbrutto != null) { akue = Math.round((stufe.mindestMonatsbrutto / (kv!.monatsteiler || 167)) * 100) / 100; quellen.push(`${kv!.kuerzel} ${stufe.beschaeftigungsgruppe} ${akue.toFixed(2)} €`); }

  let referenzQuelle: ReferenzlohnErgebnis | null = null;
  let referenzPruefen = false;
  let gruppeFehlt = false;
  if (opts.beschaeftigerKv) {
    referenzQuelle = await referenzlohnErmitteln({
      kv: opts.beschaeftigerKv,
      beschaeftigungsgruppe: opts.beschaeftigerBg ?? opts.beschaeftigungsgruppe,
      am: opts.am, eintritt: opts.eintritt,
    });
    if (referenzQuelle?.stundenlohn != null) {
      // Maßgeblich ist der Lohn einschließlich Referenzzuschlag, sofern der Prozentsatz hinterlegt ist.
      referenz = referenzQuelle.stundenlohnMitZuschlag ?? referenzQuelle.stundenlohn;
      const gruppe = referenzQuelle.beschaeftigungsgruppe ? " " + referenzQuelle.beschaeftigungsgruppe : "";
      quellen.push(referenzQuelle.zuschlagProzent != null
        ? `Beschäftiger-KV ${referenzQuelle.kuerzel}${gruppe} ${referenzQuelle.stundenlohn.toFixed(2)} € + ${referenzQuelle.zuschlagProzent.toFixed(0)} % Referenzzuschlag = ${referenz.toFixed(2)} € (${referenzQuelle.vorrueckung})`
        : `Beschäftiger-KV ${referenzQuelle.kuerzel}${gruppe} ${referenz.toFixed(2)} € (${referenzQuelle.vorrueckung})`);
    }
    if (!referenzQuelle || referenzQuelle.hinweis) {
      // Für manche Beschäftiger-KV gibt es schlicht keinen Referenzzuschlag – im Handel etwa. Das
      // wird einmal festgehalten (Einstellungen → KV-Mindestlöhne) und gilt dann für jeden Kunden
      // dieses KV. Sonst verlangte die Software bei jedem einzelnen Einsatz dieselbe Bestätigung,
      // und wer zwanzig Mal dasselbe wegklickt, liest beim einundzwanzigsten Mal nicht mehr.
      gruppeFehlt = Boolean(referenzQuelle?.tafelVorhanden);
      const generell = await keinZuschlagFuer(opts.beschaeftigerKv);
      if (generell) {
        quellen.push(`Beschäftiger-KV „${generell.bezeichnung}“: kein Referenzzuschlag (festgehalten von ${generell.von} am ${new Date(generell.am).toLocaleDateString("de-AT")})`);
      } else {
        referenzPruefen = true;
        quellen.push(referenzQuelle?.hinweis ?? `Beschäftiger-KV „${opts.beschaeftigerKv}“ nicht hinterlegt – Referenzzuschlag prüfen`);
      }
    }
  }
  const mindest = Math.max(absolut, akue ?? 0, referenz ?? 0);
  const referenzzuschlag = referenz != null && akue != null ? Math.max(0, Math.round((referenz - akue) * 100) / 100) : 0;
  if (gruppeFehlt) {
    // Die Tafel ist da, nur die Zeile fehlt. Das ist eine ganz andere Ansage als „kein Referenzlohn
    // hinterlegt" – und wer die falsche Ansage bekommt, sucht an der falschen Stelle.
    quellen[quellen.length - 1] = `Beschäftiger-KV ${referenzQuelle!.kuerzel}: Lohntafel liegt vor, aber keine passende Beschäftigungsgruppe gewählt`;
  }
  return { mindest, quellen, akue, referenz, absolut, referenzzuschlag, referenzPruefen, gruppeFehlt, referenzQuelle };
}
