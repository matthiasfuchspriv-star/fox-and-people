/**
 * Musterdaten für die Mitarbeiter-App: füllt einen vorhandenen aktiven Mitarbeiter mit einem realistischen
 * Monat – Wochenplanung, Arbeitszeitaufzeichnung (bestätigt), Lohnzettel, Chat, Urlaub und einer Bewertung.
 * Damit lässt sich die App durchklicken, ohne dass echte Daten nötig sind.
 *
 *   npx tsx scripts/app-musterdaten.ts [personId]
 *
 * Ohne Argument wird der erste aktive Mitarbeiter mit laufendem Einsatz genommen. Der Aufruf ist wiederholbar;
 * bestehende Nachweise derselben Wochen werden überschrieben.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { isoWoche, montagDerKw, tageDerKw, feiertageAT } from "../src/lib/wochen";
import { berechneWoche } from "../src/lib/zeitaufzeichnung";
import type { Tageseintrag } from "../src/lib/zeitaufzeichnung";
import type { Prisma } from "../src/generated/prisma/client";

async function main() {
  const arg = process.argv[2];
  const heute = new Date();

  const person = arg
    ? await db.person.findUnique({ where: { id: arg } })
    : await db.person.findFirst({ where: { status: "VERMITTELT", einsaetze: { some: { status: "AKTIV" } } }, orderBy: { nachname: "asc" } });
  if (!person) { console.error("Kein aktiver Mitarbeiter gefunden. Erst Demo-Daten anlegen (DEMO=1 npx tsx prisma/seed.ts) oder personId angeben."); process.exit(1); }

  const einsatz = await db.einsatz.findFirst({ where: { personId: person.id, status: { in: ["AKTIV", "GEPLANT"] } }, include: { kunde: true }, orderBy: { von: "asc" } });
  if (!einsatz) { console.error("Der Mitarbeiter hat keinen Einsatz – bitte zuerst einen Einsatz anlegen."); process.exit(1); }
  const name = `${person.vorname} ${person.nachname}`;
  console.log(`Musterdaten für ${name} bei ${einsatz.kunde.firmenname}`);

  // --- 6 Wochen Wochenplanung und Stundennachweise (die letzten 5 Wochen bestätigt, die aktuelle offen)
  const wochen: { jahr: number; kw: number }[] = [];
  for (let i = 5; i >= 0; i--) wochen.push(isoWoche(new Date(heute.getTime() - i * 7 * 86400000)));

  const schicht = (beginn: string, ende: string, pause = 30) => ({ ort: `${einsatz.kunde.ort ?? "Werk"} · Halle 2`, beginn, ende, pauseMin: pause });
  let n = 0;
  for (const [i, w] of wochen.entries()) {
    const daten = tageDerKw(w.jahr, w.kw);
    const ft = feiertageAT(w.jahr);
    const eintraege: Tageseintrag[] = daten.map((d, t) => {
      if (t >= 5) return {};
      if (ft.has(d.toISOString().slice(0, 10))) return { fehlzeit: "FT", anmerkung: "Feiertag" };
      if (i === 2 && t >= 3) return { fehlzeit: "K", anmerkung: t === 3 ? "Krankenstand, Bestätigung abgegeben" : null };
      if (i === 4 && t === 4) return { fehlzeit: "U", anmerkung: "Urlaubstag" };
      if (i === 1 && t === 1) return { ...schicht("07:00", "18:00"), anmerkung: "Sonderschicht, Auftrag 4711" };
      return t === 4 ? schicht("07:00", "13:00", 30) : schicht("07:00", "16:00");
    });
    const b = berechneWoche(eintraege, { daten, wochennormal: einsatz.wochenstunden });
    const tage = b.tage.map((t) => t.gesamt);
    const bestaetigt = i < wochen.length - 1;
    await db.stundennachweis.upsert({
      where: { personId_jahr_kw: { personId: person.id, jahr: w.jahr, kw: w.kw } },
      create: {
        personId: person.id, jahr: w.jahr, kw: w.kw, einsatzId: einsatz.id,
        tage: tage as unknown as Prisma.InputJsonValue, eintraege: eintraege as unknown as Prisma.InputJsonValue,
        summe: b.summe, summeNormal: b.normal, summeUe50: b.ue50, summeUe100: b.ue100, quelle: "APP",
        status: bestaetigt ? "BESTAETIGT" : "EINGEREICHT",
        geprueftAm: bestaetigt ? new Date(montagDerKw(w.jahr, w.kw).getTime() + 8 * 86400000) : null,
        geprueftVon: bestaetigt ? "Disposition" : null,
        bestaetigtVon: bestaetigt ? (einsatz.kunde.firmenname.split(" ")[0] + " · Vorarbeiter") : null,
        bestaetigtAm: bestaetigt ? new Date(montagDerKw(w.jahr, w.kw).getTime() + 7 * 86400000) : null,
        notiz: i === 1 ? "Dienstag Sonderschicht" : null,
      },
      update: {
        tage: tage as unknown as Prisma.InputJsonValue, eintraege: eintraege as unknown as Prisma.InputJsonValue,
        summe: b.summe, summeNormal: b.normal, summeUe50: b.ue50, summeUe100: b.ue100, quelle: "APP",
        status: bestaetigt ? "BESTAETIGT" : "EINGEREICHT", einsatzId: einsatz.id,
      },
    });
    // Wochenraster passend dazu
    const raster = eintraege.map((e) => (e.fehlzeit === "K" ? "K" : e.fehlzeit === "U" ? "U" : e.beginn ? "X" : "F")).join("");
    await db.wochenstatus.upsert({
      where: { personId_jahr_kw: { personId: person.id, jahr: w.jahr, kw: w.kw } },
      create: { personId: person.id, jahr: w.jahr, kw: w.kw, status: raster.includes("X") ? "X" : "F", tage: raster, einsatzId: einsatz.id },
      update: { tage: raster, einsatzId: einsatz.id },
    });
    n++;
  }
  console.log(`  ${n} Wochen Arbeitszeitaufzeichnung und Wochenplanung`);

  // --- Chat
  const chats: [boolean, string][] = [
    [true, "Hallo, wann kommt der Lohnzettel für den letzten Monat?"],
    [false, "Hallo! Die Lohnverrechnung ist am 12. fertig, dann liegt er sofort in deiner App unter „Mein Lohn“."],
    [true, "Perfekt, danke!"],
  ];
  for (const [vonMa, text] of chats) {
    const vorhanden = await db.nachricht.findFirst({ where: { personId: person.id, text } });
    if (!vorhanden) await db.nachricht.create({ data: { personId: person.id, vonMitarbeiter: vonMa, text, nutzerName: vonMa ? name : "Disposition", gelesenAm: new Date() } });
  }
  console.log("  Chat-Verlauf");

  // --- Abwesenheiten
  const urlaubVon = new Date(heute.getFullYear(), heute.getMonth() + 1, 10);
  const urlaubBis = new Date(heute.getFullYear(), heute.getMonth() + 1, 17);
  if (!(await db.abwesenheit.findFirst({ where: { personId: person.id, typ: "URLAUB", von: urlaubVon } })))
    await db.abwesenheit.create({ data: { personId: person.id, typ: "URLAUB", von: urlaubVon, bis: urlaubBis, tage: 6, status: "BEANTRAGT", notiz: "Familienurlaub", quelle: "APP" } });
  console.log("  Urlaubsantrag");

  // --- Bewertung des Beschäftigers
  if (!(await db.kundenBewertung.findFirst({ where: { personId: person.id, kundeId: einsatz.kundeId } })))
    await db.kundenBewertung.create({ data: { personId: person.id, kundeId: einsatz.kundeId, einsatzId: einsatz.id, sterne: 4, kommentar: "Team ist in Ordnung, Einschulung war kurz. Pausenzeiten passen.", merkmale: ["gute Einschulung", "faire Arbeitszeiten"], wiederArbeiten: true, quelle: "APP" } });
  console.log("  Bewertung des Beschäftigers");

  // --- Onboarding-Stand (ein paar Punkte offen, damit die Checkliste etwas zeigt)
  const ob = { arbeitsvertrag: new Date().toISOString(), ausweis: new Date().toISOString(), ecard: new Date().toISOString(), notfallkontakt: new Date().toISOString() };
  await db.person.update({ where: { id: person.id }, data: { onboarding: ob as unknown as Prisma.InputJsonValue, appZuletztAktiv: new Date(), datenschutzAkzeptiertAm: null } });
  console.log("  Onboarding-Stand (4 von 9 erledigt, Datenschutz noch offen)");

  console.log(`\nFertig. Anmelden mit ${person.email ?? person.telefon ?? "der hinterlegten Adresse"} unter /app/login.`);
  process.exit(0);

}

main().catch((e) => { console.error(e); process.exit(1); });