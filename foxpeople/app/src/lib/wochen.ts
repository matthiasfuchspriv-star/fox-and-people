/** ISO-Kalenderwochen & österreichische Feiertage – Basis für das Wochenraster und die Sollarbeitszeit */
export function isoWoche(d: Date): { jahr: number; kw: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const kw = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return { jahr: y, kw };
}
export function montagDerKw(jahr: number, kw: number): Date {
  const jan4 = new Date(Date.UTC(jahr, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mo = new Date(jan4); mo.setUTCDate(jan4.getUTCDate() - day + 1 + (kw - 1) * 7);
  return mo;
}
function ostern(j: number) { const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mon = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Date.UTC(j, mon - 1, tag)); }
/** Gesetzliche Feiertage Österreich (bundesweit) */

/**
 * Werktage (Mo–Fr, ohne österreichische Feiertage) zwischen zwei Daten, beide einschließlich.
 * Grundlage der Urlaubsrechnung: Eine Woche Mo–So kostet 5 Tage vom Anspruch, nicht 7.
 */
export function werktageZwischen(von: Date, bis: Date): number {
  const a = new Date(Date.UTC(von.getFullYear(), von.getMonth(), von.getDate()));
  const b = new Date(Date.UTC(bis.getFullYear(), bis.getMonth(), bis.getDate()));
  let n = 0;
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w === 0 || w === 6) continue;
    if (feiertageAT(d.getUTCFullYear()).has(d.toISOString().slice(0, 10))) continue;
    n++;
  }
  return n;
}

export function feiertageAT(j: number): Set<string> {
  const o = ostern(j); const plus = (n: number) => { const d = new Date(o); d.setUTCDate(o.getUTCDate() + n); return d; };
  const fixe = [[0, 1], [0, 6], [4, 1], [7, 15], [9, 26], [10, 1], [11, 8], [11, 25], [11, 26]].map(([m, t]) => new Date(Date.UTC(j, m, t)));
  return new Set([...fixe, plus(1), plus(39), plus(50), plus(60)].map((d) => d.toISOString().slice(0, 10)));
}
/** Arbeitstage (Mo–Fr ohne Feiertage) in einer KW – optional auf einen Monat begrenzt */
export function arbeitstageKw(jahr: number, kw: number, nurMonat?: { jahr: number; monat: number }): number {
  const mo = montagDerKw(jahr, kw); let n = 0;
  for (let i = 0; i < 5; i++) { const d = new Date(mo); d.setUTCDate(mo.getUTCDate() + i); const ft = feiertageAT(d.getUTCFullYear()); if (ft.has(d.toISOString().slice(0, 10))) continue; if (nurMonat && (d.getUTCFullYear() !== nurMonat.jahr || d.getUTCMonth() + 1 !== nurMonat.monat)) continue; n++; }
  return n;
}
/** Alle KWs, die einen Monat berühren */
export function wochenImMonat(jahr: number, monat: number): { jahr: number; kw: number; von: Date; bis: Date }[] {
  const out: { jahr: number; kw: number; von: Date; bis: Date }[] = [];
  const seen = new Set<string>();
  const tage = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  for (let t = 1; t <= tage; t++) { const d = new Date(Date.UTC(jahr, monat - 1, t)); const w = isoWoche(d); const k = `${w.jahr}-${w.kw}`; if (seen.has(k)) continue; seen.add(k); const mo = montagDerKw(w.jahr, w.kw); const fr = new Date(mo); fr.setUTCDate(mo.getUTCDate() + 4); out.push({ ...w, von: mo, bis: fr }); }
  return out;
}

/** Tagesstatus einer Woche (Mo–So) aus Wochenstatus: `tage` (7 Zeichen) hat Vorrang, sonst Wochenstatus auf Mo–Fr. */
export function tagesstatus(ws: { status: string; tage?: string | null } | null | undefined): string[] {
  if (!ws) return ["-", "-", "-", "-", "-", "-", "-"];
  if (ws.tage && ws.tage.length === 7) return ws.tage.split("");
  const st = ws.status || "-";
  return [st, st, st, st, st, "-", "-"];
}
/** Vorherrschender Wochenstatus aus Tagesstatus (X > K > U > Z > F). */
export function wochenstatusAus(tage: string[]): string {
  for (const s of ["X", "K", "U", "Z", "F"]) if (tage.includes(s)) return s;
  return "";
}
/** Arbeitstage (Mo–So) einer KW mit Datum – für die Tagesplanung */
export function tageDerKw(jahr: number, kw: number): Date[] {
  const mo = montagDerKw(jahr, kw);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mo); d.setUTCDate(mo.getUTCDate() + i); return d; });
}

/**
 * Kalenderwochen, die **vollständig** in einem Monat liegen.
 *
 * Für das Löschen des Wochenrasters: Eine Woche über den Monatswechsel gehört zur Hälfte in den
 * Nachbarmonat. Wer sie mitlöscht, reißt Daten weg, die zu einem Monat gehören, den niemand
 * angefasst hat. Also nur die Wochen, die ganz in diesem Monat liegen.
 */
export function wochenGanzImMonat(jahr: number, monat: number): { jahr: number; kw: number }[] {
  return wochenImMonat(jahr, monat)
    .filter((w) => {
      const tage = tageDerKw(w.jahr, w.kw);
      return tage.slice(0, 5).every((d) => d.getUTCFullYear() === jahr && d.getUTCMonth() + 1 === monat);
    })
    .map((w) => ({ jahr: w.jahr, kw: w.kw }));
}
