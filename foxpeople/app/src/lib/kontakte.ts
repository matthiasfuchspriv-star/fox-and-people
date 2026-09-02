/** Ansprechpartner-Rollen beim Kunden – damit Rechnung, Stundennachweis und Dispo-Mails an die richtige Person gehen. */
export const AP_ROLLEN = [
  ["DISPOSITION", "Disposition / Einsatzplanung"],
  ["RECHNUNG", "Rechnungsempfang"],
  ["STUNDENFREIGABE", "Stundenfreigabe / Stundennachweis"],
  ["BEWERTUNG", "Bewertung der Mitarbeiter"],
  ["GESCHAEFTSFUEHRUNG", "Geschäftsführung / Vertrag"],
] as const;
export type ApRolle = (typeof AP_ROLLEN)[number][0];
export const apRolleLabel = (r: string) => AP_ROLLEN.find((x) => x[0] === r)?.[1] ?? r;

export interface ApLite { name: string; email: string | null; istHaupt: boolean; rollen: string[]; funktion?: string | null }

/** Ansprechpartner für eine Rolle: Rolle → Hauptansprechpartner → erster mit E-Mail */
export function ansprechpartnerFuer(aps: ApLite[], rolle: ApRolle): ApLite | null {
  return aps.find((a) => a.rollen.includes(rolle) && a.email) ?? aps.find((a) => a.istHaupt && a.email) ?? aps.find((a) => a.email) ?? null;
}

/** E-Mail-Adresse für eine Rolle mit Fallback auf Kundenadressen */
export function mailFuer(kunde: { email?: string | null; rechnungsemail?: string | null; ansprechpartner: ApLite[] }, rolle: ApRolle): string {
  const ap = ansprechpartnerFuer(kunde.ansprechpartner, rolle);
  if (ap?.email) return ap.email;
  if (rolle === "RECHNUNG" && kunde.rechnungsemail) return kunde.rechnungsemail;
  return kunde.email ?? "";
}
