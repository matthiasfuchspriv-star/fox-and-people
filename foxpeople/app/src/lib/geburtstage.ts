import { db } from "./db";

export async function geburtstageDemnaechst(kostenstelleId?: string, tage = 14) {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  // Nur aktive Mitarbeiter. Einem Bewerber, der sich vor zwei Jahren einmal gemeldet hat, gratuliert
  // niemand – zwischen tausenden solcher Namen ginge die Handvoll unter, bei der es zählt.
  const personen = await db.person.findMany({ where: { ...(kostenstelleId ? { kostenstelleId } : {}), status: "VERMITTELT", geburtsdatum: { not: null } }, select: { id: true, vorname: true, nachname: true, geburtsdatum: true, status: true, kostenstelle: { select: { name: true } } } });
  return personen.map((p) => {
    const g = new Date(p.geburtsdatum!);
    let next = new Date(heute.getFullYear(), g.getMonth(), g.getDate());
    if (next < heute) next = new Date(heute.getFullYear() + 1, g.getMonth(), g.getDate());
    const inTagen = Math.round((next.getTime() - heute.getTime()) / 86400000);
    return { id: p.id, name: `${p.vorname} ${p.nachname}`.trim(), status: p.status, kostenstelle: p.kostenstelle.name, datum: next, datumText: next.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" }), inTagen, heute: inTagen === 0, wird: next.getFullYear() - g.getFullYear(), geburtsdatum: g };
  }).filter((x) => x.inTagen <= tage).sort((a, b) => a.inTagen - b.inTagen);
}
