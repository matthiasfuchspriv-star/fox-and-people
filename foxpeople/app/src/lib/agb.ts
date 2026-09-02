import { AGB_UEBERLASSUNG_MD, AGB_VERMITTLUNG_MD } from "./agb-texte";
import { firma as ladeFirma, type Firma } from "./einstellungen";

/**
 * Allgemeine Geschäftsbedingungen von Fox & People in zwei Fassungen – Arbeitskräfteüberlassung und
 * Arbeitskräftevermittlung. Die Texte liegen als Markdown in src/vorlagen/ und werden mit `npm run agb:build`
 * in src/lib/agb-texte.ts übernommen.
 *
 * In der Fassung 2026-08 gegenüber der Fassung vom 19.06.2023 überarbeitet:
 *   • Rahmenvertrag samt AGB-Annahme ist vor der ersten Überlassung Pflicht (Überlassung Punkt 1.6)
 *   • elektronische Signatur und Freigabe im Kundenportal sind der Schriftform gleichgestellt (1.4, 4.7, 7.3)
 *   • Referenzlohn: Auskunftspflicht des Beschäftigers und Honoraranpassung bei höherem Referenzzuschlag (4.2, 5.3)
 *   • Arbeitszeitaufzeichnung minutengenau mit Beginn, Ende und Pausen nach § 26 AZG (4.7)
 *   • UID-Bekanntgabe und jährliche Prüfung Stufe 2 (Überlassung 4.12, Vermittlung 5.4)
 *   • Übernahme: Anzeigepflicht binnen zwei Wochen, sonst doppeltes Honorar (Überlassung 6.2)
 *   • Verzugszinsen an die gesetzliche Regelung angeglichen (9,2 Prozentpunkte über dem Basiszinssatz, mindestens 10 %)
 *   • Querverweis in Punkt 8.3 korrigiert (verwies bisher auf 7.1 statt 8.1)
 *   • Vermittlungshonorar mit Prozentsatz und Mindesthonorar ausdrücklich angeführt (Vermittlung 4.3)
 *   • Datenschutz-Kontakt ergänzt
 *
 * Die Überarbeitung ist eine kaufmännische Fassung – vor dem Einsatz beim Kunden bitte einmal anwaltlich prüfen lassen.
 */
export const AGB_VERSION = "2026-08";
export const AGB_STAND = "30.08.2026";

export type AgbArt = "UEBERLASSUNG" | "VERMITTLUNG";
export const AGB_TITEL: Record<AgbArt, string> = {
  UEBERLASSUNG: "AGB Arbeitskräfteüberlassung",
  VERMITTLUNG: "AGB Arbeitskräftevermittlung",
};

export interface AgbWerte { uebernahmeProzent?: number; uebernahmeMindest?: number; vermittlungProzent?: number }

const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });
const pz = (n: number) => `${(n * 100).toLocaleString("de-AT", { maximumFractionDigits: 1 })} %`;

/** Rendert den AGB-Text mit den Platzhaltern der Firma und den kundenspezifischen Sätzen. */
export async function agbText(art: AgbArt, werte: AgbWerte = {}, f?: Firma): Promise<string> {
  const firma = f ?? (await ladeFirma());
  const roh = art === "UEBERLASSUNG" ? AGB_UEBERLASSUNG_MD : AGB_VERMITTLUNG_MD;
  const map: Record<string, string> = {
    "agb.version": AGB_VERSION,
    "agb.stand": AGB_STAND,
    "agb.uebernahmeProzent": pz(werte.uebernahmeProzent ?? 0.3),
    "agb.uebernahmeMindest": eur(werte.uebernahmeMindest ?? 2500),
    "agb.vermittlungProzent": pz(werte.vermittlungProzent ?? 0.3),
    "firma.rechtstraeger": firma.rechtstraeger,
    "firma.name": firma.name,
    "firma.strasse": firma.strasse ?? "",
    "firma.plz": firma.plz ?? "",
    "firma.ort": firma.ort ?? "",
    "firma.email": firma.email ?? "",
    "firma.uid": firma.uid ?? "",
  };
  return roh.replace(/\{\{([a-zA-Z.]+)\}\}/g, (_, k) => map[k] ?? "");
}

/**
 * Übernahmegebühr nach AGB Punkt 6.1: Prozentsatz vom Bruttojahresentgelt, je vollem Überlassungsmonat
 * um 1/12 reduziert, mindestens das vereinbarte Mindesthonorar; nach zwölf vollen Monaten kostenlos.
 * Das Ergebnis wird kaufmännisch auf die nächste Zehnerstelle gerundet.
 */
export function uebernahmeHonorar(opts: { bruttojahresentgelt: number; monateUeberlassen: number; prozent?: number; mindest?: number }): { honorar: number; anteil: number; basis: number; frei: boolean } {
  const prozent = opts.prozent ?? 0.3;
  const mindest = opts.mindest ?? 2500;
  const monate = Math.max(0, Math.floor(opts.monateUeberlassen));
  const basis = Math.max(0, opts.bruttojahresentgelt) * prozent;
  if (monate >= 12) return { honorar: 0, anteil: 0, basis, frei: true };
  const anteil = (12 - monate) / 12;
  const roh = basis * anteil;
  const gerundet = Math.round(roh / 10) * 10;
  return { honorar: Math.max(mindest, gerundet), anteil, basis, frei: false };
}

/** Volle Kalendermonate zwischen Überlassungsbeginn und Übernahme. */
export function volleMonate(von: Date, bis: Date): number {
  let m = (bis.getFullYear() - von.getFullYear()) * 12 + (bis.getMonth() - von.getMonth());
  if (bis.getDate() < von.getDate()) m -= 1;
  return Math.max(0, m);
}
