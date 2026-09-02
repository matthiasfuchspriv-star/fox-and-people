/**
 * Urlaubsanspruch – wird monatlich „freigeschaltet“, nicht als voller Jahresurlaub:
 * je vollem Beschäftigungsmonat 1/12 des Jahresanspruchs (25 Werktage → 2,0833 Tage/Monat).
 * Nur aktive Mitarbeiter (Status VERMITTELT, Eintrittsdatum gesetzt) erwerben Urlaub.
 */
export interface UrlaubPerson {
  status: string;
  eintrittsdatum: Date | null;
  austrittsdatum?: Date | null;
  urlaubsanspruchTage: number;
}

export interface UrlaubStand {
  aktiv: boolean;
  proMonat: number;        // z. B. 2.0833
  monate: number;          // volle Beschäftigungsmonate im Jahr (bis Stichtag)
  erworben: number;        // freigeschaltete Tage im Jahr
  genommen: number;
  rest: number;            // erworben − genommen (kann negativ sein = Vorgriff)
  jahresanspruch: number;
}

/** Volle Monate zwischen zwei Daten (Monatsanfang zählt ab dem Tag des Eintritts). */
export function volleMonate(von: Date, bis: Date): number {
  if (bis < von) return 0;
  let m = (bis.getFullYear() - von.getFullYear()) * 12 + (bis.getMonth() - von.getMonth());
  if (bis.getDate() < von.getDate()) m -= 1;
  return Math.max(0, m);
}

export function urlaubsstand(p: UrlaubPerson, genommen: number, jahr: number, stichtag = new Date()): UrlaubStand {
  const proMonat = Math.round((p.urlaubsanspruchTage / 12) * 10000) / 10000;
  const aktiv = p.status === "VERMITTELT" && !!p.eintrittsdatum;
  if (!aktiv) return { aktiv: false, proMonat, monate: 0, erworben: 0, genommen, rest: -genommen, jahresanspruch: p.urlaubsanspruchTage };
  const start = new Date(Math.max(p.eintrittsdatum!.getTime(), new Date(jahr, 0, 1).getTime()));
  let ende = stichtag.getFullYear() > jahr ? new Date(jahr + 1, 0, 1) : stichtag;
  if (p.austrittsdatum) { const a = new Date(p.austrittsdatum.getTime() + 86400000); if (a < ende) ende = a; }
  // Eintritt am 1. → der Monat zählt ab dem 1. des Folgemonats als voll; sonst ab Monatstag
  const monate = Math.min(12, volleMonate(start, ende));
  const erworben = Math.round(monate * proMonat * 100) / 100;
  return { aktiv: true, proMonat, monate, erworben, genommen, rest: Math.round((erworben - genommen) * 100) / 100, jahresanspruch: p.urlaubsanspruchTage };
}

export const tage = (n: number) => n.toLocaleString("de-AT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
