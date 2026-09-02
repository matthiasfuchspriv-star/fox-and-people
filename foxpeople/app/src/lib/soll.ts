import { db } from "./db";
import { wochenImMonat, tagesstatus, tageDerKw, feiertageAT } from "./wochen";

/** Sollarbeitszeit eines Monats aus dem Wochenraster (X = arbeitet) je Kostenstelle */
export async function sollstundenMonat(jahr: number, monat: number, kostenstelleId?: string) {
  const wochen = wochenImMonat(jahr, monat);
  // Nur Wochen von Mitarbeitern, die in diesem Monat tatsächlich einen Einsatz haben.
  //
  // Vorher zählte jedes Wochenraster mit, das je angelegt worden war – auch von Mitarbeitern, deren
  // Einsatz längst zu Ende ist. Im Oktober standen so 339 Sollstunden, während darunter „keine
  // aktiven Mitarbeiter" stand. Eine Zahl, die niemand erklären kann, ist schlimmer als keine.
  const monatsBeginn = new Date(Date.UTC(jahr, monat - 1, 1));
  const monatsEnde = new Date(Date.UTC(jahr, monat, 0));
  const status = await db.wochenstatus.findMany({
    where: {
      OR: wochen.map((w) => ({ jahr: w.jahr, kw: w.kw })),
      person: {
        ...(kostenstelleId ? { kostenstelleId } : {}),
        einsaetze: { some: { status: { in: ["AKTIV", "GEPLANT"] }, von: { lte: monatsEnde }, OR: [{ bis: null }, { bis: { gte: monatsBeginn } }] } },
      },
    },
    include: { person: { select: { id: true, vorname: true, nachname: true, wochenstunden: true, kostenstelleId: true } } },
  });
  let soll = 0, krankTage = 0, urlaubTage = 0, arbeitsWochen = 0;
  const jePerson = new Map<string, { personId: string; name: string; soll: number; x: number; k: number; u: number }>();
  for (const st of status) {
    const w = wochen.find((x) => x.jahr === st.jahr && x.kw === st.kw)!;
    const tagesStd = (st.person.wochenstunden ?? 38.5) / 5;
    const e = jePerson.get(st.personId) ?? { personId: st.personId, name: `${st.person.vorname} ${st.person.nachname}`, soll: 0, x: 0, k: 0, u: 0 };
    const tg = tagesstatus(st); const daten = tageDerKw(w.jahr, w.kw);
    let xTage = 0, kTage = 0, uTage = 0;
    daten.forEach((d, i) => {
      if (d.getUTCFullYear() !== jahr || d.getUTCMonth() + 1 !== monat) return; // nur Tage im Monat
      const feiertag = feiertageAT(d.getUTCFullYear()).has(d.toISOString().slice(0, 10));
      if (tg[i] === "X" && !feiertag) xTage++;
      if (tg[i] === "K") kTage++;
      if (tg[i] === "U") uTage++;
    });
    soll += xTage * tagesStd; e.soll += xTage * tagesStd;
    krankTage += kTage; urlaubTage += uTage;
    if (xTage) { e.x++; arbeitsWochen++; }
    if (kTage) e.k++; if (uTage) e.u++;
    jePerson.set(st.personId, e);
  }
  return { soll: Math.round(soll), krankTage, urlaubTage, arbeitsWochen, jePerson: [...jePerson.values()] };
}

/**
 * Sollstunden einer Person im Monat, begrenzt auf den Zeitraum EINES Einsatzes.
 *
 * Die Monatsabrechnung darf die X-Tage des Monats nicht je Person holen: Wechselt ein Mitarbeiter
 * Mitte des Monats den Kunden, hat er zwei Abrechnungszeilen – und beide bekämen die vollen
 * Monatsstunden, der Monat würde doppelt fakturiert. Deshalb zählt hier jeder X-Tag nur, wenn er im
 * Zeitraum des jeweiligen Einsatzes liegt; bei sauber getrennten Einsätzen teilen sich die Zeilen
 * den Monat statt ihn zu verdoppeln.
 */
export async function sollstundenFuerEinsatz(jahr: number, monat: number, einsatz: { personId: string; von: Date; bis: Date | null }): Promise<number> {
  const wochen = wochenImMonat(jahr, monat);
  const status = await db.wochenstatus.findMany({
    where: { personId: einsatz.personId, OR: wochen.map((w) => ({ jahr: w.jahr, kw: w.kw })) },
    include: { person: { select: { wochenstunden: true } } },
  });
  const vonTag = new Date(Date.UTC(einsatz.von.getFullYear(), einsatz.von.getMonth(), einsatz.von.getDate()));
  const bisTag = einsatz.bis ? new Date(Date.UTC(einsatz.bis.getFullYear(), einsatz.bis.getMonth(), einsatz.bis.getDate(), 23, 59, 59)) : null;
  let soll = 0;
  for (const st of status) {
    const tagesStd = (st.person.wochenstunden ?? 38.5) / 5;
    const tg = tagesstatus(st); const daten = tageDerKw(st.jahr, st.kw);
    daten.forEach((d, i) => {
      if (d.getUTCFullYear() !== jahr || d.getUTCMonth() + 1 !== monat) return;
      if (d < vonTag || (bisTag && d > bisTag)) return; // nur Tage im Einsatzzeitraum
      const feiertag = feiertageAT(d.getUTCFullYear()).has(d.toISOString().slice(0, 10));
      if (tg[i] === "X" && !feiertag) soll += tagesStd;
    });
  }
  return Math.round(soll * 100) / 100;
}
