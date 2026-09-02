import type { ZulageArt } from "@/generated/prisma/enums";

/**
 * Am Einsatz gespeicherte Zulagen (Snapshot der Stammdaten).
 *
 * `wert` ist der Zulagenbetrag im **Lohn** (das schuldet der Kollektivvertrag dem Mitarbeiter).
 * `verkaufssatz` ist, was wir dem Beschäftiger dafür je Stunde verrechnen – bewusst ein eigenes
 * Feld: Vorher wurde der Verkauf aus dem Lohn hochgerechnet, aber ausgehandelt wird er.
 * Ohne eigenen Verkaufssatz bleibt es bei der bisherigen Berechnung.
 */
export interface EinsatzZulage {
  kuerzel: string; name: string; art: ZulageArt; wert: number;
  weiterverrechnen: boolean; steuerfrei: boolean;
  /** € je Stunde an den Kunden – leer = wie bisher aus dem Lohnanteil abgeleitet */
  verkaufssatz?: number | null;
}

const de2 = (n: number) => n.toFixed(2).replace(".", ",");
export const zulageText = (z: { art: ZulageArt; wert: number }) =>
  z.art === "PROZENT_STUNDENLOHN" ? `${z.wert} % vom Stundenlohn` : z.art === "EURO_STUNDE" ? `${de2(z.wert)} €/Std` : z.art === "EURO_TAG" ? `${de2(z.wert)} €/Tag` : `${de2(z.wert)} €/Monat`;

/** Zulagen je Stunde in € (Tag/Monat auf Stunden umgerechnet: 8 Std/Tag, 173 Std/Monat) */
export function zulagenProStunde(zul: EinsatzZulage[] | null | undefined, stundenlohn: number | null | undefined) {
  let lohn = 0, weiter = 0;
  for (const z of zul ?? []) {
    const je = zulageProStunde(z, stundenlohn);
    lohn += je;
    if (z.weiterverrechnen) weiter += z.verkaufssatz != null ? z.verkaufssatz : je;
  }
  return { lohn, weiter };
}

/** Lohnanteil einer einzelnen Zulage je Stunde (Tag ÷ 8, Monat ÷ 173). */
export function zulageProStunde(z: { art: ZulageArt; wert: number }, stundenlohn: number | null | undefined): number {
  return z.art === "PROZENT_STUNDENLOHN" ? ((stundenlohn ?? 0) * z.wert) / 100
    : z.art === "EURO_STUNDE" ? z.wert
    : z.art === "EURO_TAG" ? z.wert / 8
    : z.wert / 173;
}

/** Natürliche Mengeneinheit der Zulage: Stunden – nur Tagespauschalen (Taggeld, Kilometergeld) zählen in Tagen. */
export const zulageEinheit = (z: { art: ZulageArt }) => (z.art === "EURO_TAG" ? "Tage" : "Std.");

/**
 * Verkaufs-Einzelpreis je natürlicher Einheit: €/Std – bei Tagespauschalen €/Tag.
 * Ein eigener Verkaufssatz (immer je Stunde hinterlegt) wird für Tagespauschalen auf den Tag
 * umgerechnet (× 8), damit Einzelpreis und Menge zusammenpassen.
 */
export function zulageEinzelpreisVerkauf(z: EinsatzZulage, stundenlohn: number | null | undefined): number {
  if (z.art === "EURO_TAG") return z.verkaufssatz != null ? z.verkaufssatz * 8 : z.wert;
  return z.verkaufssatz != null ? z.verkaufssatz : zulageProStunde(z, stundenlohn);
}

export const ZULAGEN_DEFAULT: EinsatzZulage[] = [
  { kuerzel: "SCHMUTZ", name: "Schmutzzulage", art: "EURO_STUNDE", wert: 0.6, weiterverrechnen: true, steuerfrei: true },
  { kuerzel: "ERSCHW", name: "Erschwerniszulage", art: "EURO_STUNDE", wert: 0.6, weiterverrechnen: true, steuerfrei: true },
  { kuerzel: "GEFAHR", name: "Gefahrenzulage", art: "EURO_STUNDE", wert: 0.6, weiterverrechnen: true, steuerfrei: true },
  { kuerzel: "NACHT", name: "Nachtarbeitszuschlag (22–6 Uhr)", art: "PROZENT_STUNDENLOHN", wert: 25, weiterverrechnen: true, steuerfrei: false },
  { kuerzel: "SCHICHT2", name: "Schichtzulage 2-Schicht", art: "PROZENT_STUNDENLOHN", wert: 5, weiterverrechnen: true, steuerfrei: false },
  { kuerzel: "SCHICHT3", name: "Schichtzulage 3-Schicht", art: "PROZENT_STUNDENLOHN", wert: 10, weiterverrechnen: true, steuerfrei: false },
  { kuerzel: "SONNTAG", name: "Sonntagszuschlag", art: "PROZENT_STUNDENLOHN", wert: 100, weiterverrechnen: true, steuerfrei: false },
  { kuerzel: "FEIERTAG", name: "Feiertagszuschlag", art: "PROZENT_STUNDENLOHN", wert: 100, weiterverrechnen: true, steuerfrei: false },
  { kuerzel: "TAGGELD", name: "Taggeld (auswärtiger Einsatz)", art: "EURO_TAG", wert: 26.4, weiterverrechnen: true, steuerfrei: true },
  { kuerzel: "KMGELD", name: "Kilometergeld-Pauschale", art: "EURO_TAG", wert: 10, weiterverrechnen: true, steuerfrei: true },
];

/**
 * Ist diese Zulage beim Anlegen eines Einsatzes vorzuhaken?
 *
 * Drei Gründe sprechen dafür, in dieser Rangfolge:
 *  1. Sie steht im angenommenen Angebot – dann ist sie mit dem Beschäftiger vereinbart.
 *  2. Sie gehört zum Kollektivvertrag des Beschäftigers.
 *  3. Sie gehört zum gewählten Schichtmodell.
 *
 * Sobald jemand die Haken selbst gesetzt hat (`ausUrl` ist gesetzt, weil die Seite mit den bereits
 * gewählten Zulagen neu geladen wurde), gilt nur noch dessen Auswahl. Der Mensch gewinnt – sonst
 * kann man eine vorgeschlagene Zulage nicht wieder loswerden.
 */
export function zulageVorbelegt(opts: {
  kuerzel: string;
  ausUrl?: string | null;
  imAngebot?: boolean;
  passtKv?: boolean;
  passtSchicht?: boolean;
}): boolean {
  if (opts.ausUrl != null) return opts.ausUrl.split(",").includes(opts.kuerzel);
  return Boolean(opts.imAngebot || opts.passtKv || opts.passtSchicht);
}
