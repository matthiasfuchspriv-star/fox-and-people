import { db } from "./db";
import { verfallMitarbeiter, verfallKunden } from "./verfall";
import { pushAn, PUSH_TEXTE } from "./push";
import { isoWoche } from "./wochen";
import { einstellung, setEinstellung } from "./einstellungen";

/**
 * Zuletzt gelaufen – im Arbeitsspeicher, absichtlich nicht in der Datenbank. Es geht nur darum, den
 * Lauf nicht bei jedem Seitenaufruf erneut anzuwerfen; nach einem Neustart darf er ruhig einmal
 * zusätzlich laufen.
 */
let zuletztErzeugt = 0;
let laeuftGerade: Promise<void> | null = null;

/**
 * Wie `erzeugeAufgaben`, aber höchstens alle 10 Minuten und immer nur einmal gleichzeitig.
 *
 * Der Lauf schreibt für jede ablaufende Qualifikation, jeden Ausweis und jeden Kunden einzeln in die
 * Datenbank. Das ist bei ein paar hundert Datensätzen unauffällig und bei ein paar tausend nicht
 * mehr: Dashboard und Wiedervorlagen brauchten zuletzt rund fünf Sekunden, weil sie den kompletten
 * Lauf abwarteten, bevor sie überhaupt etwas anzeigten. Die Seiten rufen ihn jetzt über `after()`
 * auf – erst wird die Seite ausgeliefert, dann wird nachgezogen. Sichtbar wird eine neue
 * Wiedervorlage damit beim nächsten Aufruf; der stündliche Hintergrundlauf macht dasselbe ohnehin.
 */
export function erzeugeAufgabenGedrosselt(): Promise<void> {
  if (laeuftGerade) return laeuftGerade;
  if (Date.now() - zuletztErzeugt < 10 * 60 * 1000) return Promise.resolve();
  laeuftGerade = erzeugeAufgaben()
    .then(() => { zuletztErzeugt = Date.now(); })
    .catch(() => { /* der stündliche Lauf versucht es erneut */ })
    .finally(() => { laeuftGerade = null; });
  return laeuftGerade;
}

/** Erzeugt Wiedervorlagen automatisch (idempotent über typ+referenz). Läuft stündlich über /api/lauf. */
export async function erzeugeAufgaben() {
  const heute = new Date();
  const in90 = new Date(heute.getTime() + 90 * 86400000);

  // Qualifikationen, die ablaufen – nur bei aktiven Mitarbeitern.
  //
  // Bei einem Bewerber im Pool ist ein abgelaufener Staplerschein keine offene Pflicht, sondern der
  // Normalzustand: Er ist in keinem Einsatz, es hängt nichts daran. Seit dem Import von 1.579
  // Bewerbern wären das tausende Zeilen gewesen, zwischen denen die zwanzig untergehen, die
  // wirklich zählen. Wird der Bewerber vermittelt, taucht sein Nachweis beim nächsten Lauf auf.
  const quals = await db.qualifikation.findMany({ where: { gultigBis: { not: null, lte: in90 }, person: { status: "VERMITTELT" } }, include: { person: true } });
  for (const q of quals) {
    const vorlauf = new Date(q.gultigBis!.getTime() - q.erinnerungTageVorher * 86400000);
    if (vorlauf > heute) continue;
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "QUALIFIKATION_ABLAUF", referenzTyp: "Qualifikation", referenzId: q.id } },
      update: { faelligAm: q.gultigBis! },
      create: { kostenstelleId: q.person.kostenstelleId, typ: "QUALIFIKATION_ABLAUF", titel: `${q.typ} von ${q.person.vorname} ${q.person.nachname} läuft ab`, faelligAm: q.gultigBis!, personId: q.personId, referenzTyp: "Qualifikation", referenzId: q.id },
    });
  }
  // Aufräumen: Wiedervorlagen zu Personen, die nicht (mehr) im Einsatz sind. Das betrifft alles, was
  // vor dieser Regel für Bewerber im Pool angelegt wurde, und Mitarbeiter, die inzwischen
  // ausgeschieden sind. Erledigte bleiben stehen – die sind Teil der Aufzeichnung.
  await db.aufgabe.deleteMany({
    where: {
      erledigt: false,
      typ: { in: ["QUALIFIKATION_ABLAUF", "AUSWEIS_ABLAUF", "BEWILLIGUNG_ABLAUF"] },
      person: { status: { not: "VERMITTELT" } },
    },
  });

  // Arbeitsbewilligungen und Ausweise (8 Wochen Vorwarnzeit) – Sperre für neue Einsätze greift zusätzlich in pruefeEinsatz
  for (const v of await verfallMitarbeiter()) {
    if (!v.personId) continue;
    const typ = v.art === "BEWILLIGUNG" ? "BEWILLIGUNG_ABLAUF" : v.art === "AUSWEIS" ? "AUSWEIS_ABLAUF" : null;
    if (!typ) continue;
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ, referenzTyp: "Person", referenzId: v.personId } },
      update: { titel: v.titel, faelligAm: v.faelligAm ?? heute },
      create: { kostenstelleId: v.kostenstelleId, typ, titel: v.titel, faelligAm: v.faelligAm ?? heute, personId: v.personId, referenzTyp: "Person", referenzId: v.personId },
    });
  }
  // Kundenseite: fehlende AGB-Akzeptanz und fällige UID-Prüfung (Stufe 2, jährlich)
  for (const v of await verfallKunden()) {
    if (!v.kundeId) continue;
    const typ = v.art === "UID" ? "UID_PRUEFUNG" : v.art === "AGB" ? "AGB_FEHLT" : null;
    if (!typ) continue;
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ, referenzTyp: "Kunde", referenzId: v.kundeId } },
      update: { titel: v.titel, faelligAm: v.faelligAm ?? heute },
      create: { kostenstelleId: v.kostenstelleId, typ, titel: v.titel, faelligAm: v.faelligAm ?? heute, kundeId: v.kundeId, referenzTyp: "Kunde", referenzId: v.kundeId },
    });
  }
  // Hausregel-Mindestlohn läuft aus: Ohne neuen Eintrag rechnete das Programm ab dem Stichtag
  // stillschweigend mit dem alten Wert weiter (13,90 € gilt bis 31.12.2026).
  {
    const { MINDESTLOHN_ABSOLUT } = await import("./mindestlohn-regel");
    const letzte = MINDESTLOHN_ABSOLUT[MINDESTLOHN_ABSOLUT.length - 1];
    const ablauf = new Date(letzte.bis + "T00:00:00");
    if (heute.getTime() > ablauf.getTime() - 60 * 86400000) {
      const zentrale = await db.kostenstelle.findFirst({ where: { isZentrale: true }, select: { id: true } });
      if (zentrale) await db.aufgabe.upsert({
        where: { typ_referenzTyp_referenzId: { typ: "KV_ABLAUF", referenzTyp: "Mindestlohn", referenzId: letzte.bis } },
        update: {},
        create: { kostenstelleId: zentrale.id, typ: "KV_ABLAUF", titel: `Hausregel-Mindestlohn (${letzte.wert.toFixed(2)} €) läuft am ${ablauf.toLocaleDateString("de-AT")} aus – neuen Wert in mindestlohn-regel.ts eintragen lassen, sonst rechnet das Programm mit dem alten Wert weiter.`, faelligAm: ablauf, referenzTyp: "Mindestlohn", referenzId: letzte.bis },
      });
    }
  }
  // Talent-Pool: Bewerber mit Wiedervorlagedatum erneut ansprechen
  for (const p of await db.person.findMany({ where: { talentpool: true, wiedervorlageAm: { not: null, lte: heute } } })) {
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "TALENTPOOL_WIEDERVORLAGE", referenzTyp: "Person", referenzId: p.id } },
      update: { faelligAm: p.wiedervorlageAm! },
      create: { kostenstelleId: p.kostenstelleId, typ: "TALENTPOOL_WIEDERVORLAGE", titel: `Talent-Pool: ${p.vorname} ${p.nachname} wieder ansprechen${p.absagegrund ? ` (damals: ${p.absagegrund})` : ""}`, faelligAm: p.wiedervorlageAm!, personId: p.id, referenzTyp: "Person", referenzId: p.id },
    });
  }
  // Offene Übernahmehonorare verrechnen
  for (const u of await db.uebernahme.findMany({ where: { status: "OFFEN" }, include: { kunde: true, person: true } })) {
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "UEBERNAHME_VERRECHNEN", referenzTyp: "Uebernahme", referenzId: u.id } },
      update: {},
      create: { kostenstelleId: u.kostenstelleId, typ: "UEBERNAHME_VERRECHNEN", titel: `Übernahmehonorar ${u.honorar.toLocaleString("de-AT", { style: "currency", currency: "EUR" })} für ${u.person.vorname} ${u.person.nachname} an ${u.kunde.firmenname} verrechnen`, faelligAm: u.uebernahmeAm, personId: u.personId, kundeId: u.kundeId, referenzTyp: "Uebernahme", referenzId: u.id },
    });
  }
  await stundenErinnerungSenden(heute).catch(() => undefined);
  // Rahmenverträge
  const kunden = await db.kunde.findMany({ where: { rahmenvertragEnde: { not: null, lte: in90 }, status: "AKTIV" } });
  for (const k of kunden) {
    const vorlauf = new Date(k.rahmenvertragEnde!.getTime() - k.erinnerungTageVorher * 86400000);
    if (vorlauf > heute) continue;
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "RAHMENVERTRAG_ABLAUF", referenzTyp: "Kunde", referenzId: k.id } },
      update: { faelligAm: k.rahmenvertragEnde! },
      create: { kostenstelleId: k.kostenstelleId, typ: "RAHMENVERTRAG_ABLAUF", titel: `Rahmenvertrag ${k.firmenname} läuft aus`, faelligAm: k.rahmenvertragEnde!, kundeId: k.id, referenzTyp: "Kunde", referenzId: k.id },
    });
  }
  // KV des Kunden läuft aus → 2 Monate vorher Angebot anpassen
  const kvKunden = await db.kunde.findMany({ where: { kvGueltigBis: { not: null, lte: new Date(heute.getTime() + 62 * 86400000) }, status: "AKTIV" } });
  for (const k of kvKunden) {
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "KV_ABLAUF", referenzTyp: "Kunde", referenzId: k.id } },
      update: { faelligAm: k.kvGueltigBis! },
      create: { kostenstelleId: k.kostenstelleId, typ: "KV_ABLAUF", titel: `KV ${k.kollektivvertrag ?? ""} bei ${k.firmenname} läuft aus – Angebot/Verrechnungssätze anpassen`, faelligAm: k.kvGueltigBis!, kundeId: k.id, referenzTyp: "Kunde", referenzId: k.id },
    });
  }
  // Probezeit endet (1 Monat nach Eintritt) → 1 Woche vorher entscheiden
  const eintritte = await db.person.findMany({ where: { status: "VERMITTELT", eintrittsdatum: { not: null, gte: new Date(heute.getTime() - 40 * 86400000) } } });
  for (const p of eintritte) {
    const ende = new Date(p.eintrittsdatum!); ende.setMonth(ende.getMonth() + 1);
    if (ende.getTime() - heute.getTime() > 7 * 86400000 || ende < new Date(heute.getTime() - 3 * 86400000)) continue;
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "PROBEZEIT_ENDE", referenzTyp: "Person", referenzId: p.id } }, update: {}, create: { kostenstelleId: p.kostenstelleId, typ: "PROBEZEIT_ENDE", titel: `Probemonat von ${p.vorname} ${p.nachname} endet – weiter beschäftigen?`, faelligAm: ende, personId: p.id, referenzTyp: "Person", referenzId: p.id } });
  }
  // Kostenlose Übernahme nach 12 Monaten durchgehender Beschäftigung
  const lange = await db.einsatz.findMany({ where: { status: "AKTIV", von: { lte: new Date(heute.getTime() - 335 * 86400000) } }, include: { person: true, kunde: true } });
  for (const e of lange) {
    const zwoelf = new Date(e.von); zwoelf.setMonth(zwoelf.getMonth() + 12);
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "UEBERNAHME_MOEGLICH", referenzTyp: "Einsatz", referenzId: e.id } }, update: {}, create: { kostenstelleId: e.kostenstelleId, typ: "UEBERNAHME_MOEGLICH", titel: `${e.person.vorname} ${e.person.nachname} ist 12 Monate bei ${e.kunde.firmenname} – Übernahme ins Stammpersonal möglich (kostenlos)`, faelligAm: zwoelf, personId: e.personId, kundeId: e.kundeId, referenzTyp: "Einsatz", referenzId: e.id } });
  }
  // ÖGK-Anmeldung vor Arbeitsantritt
  const starts = await db.einsatz.findMany({ where: { status: { in: ["GEPLANT", "AKTIV"] }, von: { lte: new Date(heute.getTime() + 7 * 86400000) }, person: { oegkAngemeldet: false } }, include: { person: true, kunde: true } });
  for (const e of starts) {
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "OEGK_ANMELDUNG", referenzTyp: "Person", referenzId: e.personId } }, update: {}, create: { kostenstelleId: e.kostenstelleId, typ: "OEGK_ANMELDUNG", titel: `ÖGK-Anmeldung für ${e.person.vorname} ${e.person.nachname} vor Arbeitsantritt (${e.von.toLocaleDateString("de-AT")}, ${e.kunde.firmenname})`, faelligAm: e.von, personId: e.personId, referenzTyp: "Person", referenzId: e.personId } });
  }
  await db.aufgabe.updateMany({ where: { typ: "OEGK_ANMELDUNG", erledigt: false, personId: { in: (await db.person.findMany({ where: { oegkAngemeldet: true }, select: { id: true } })).map((p) => p.id) } }, data: { erledigt: true, erledigtAm: heute } });
  // Beendete Einsätze ohne Bewertung → Bewertung einholen
  const beendet = await db.einsatz.findMany({ where: { status: "BEENDET", bis: { gte: new Date(heute.getTime() - 60 * 86400000) } }, include: { person: true, kunde: true } });
  for (const e of beendet) {
    const bew = await db.bewertung.count({ where: { personId: e.personId, OR: [{ einsatzId: e.id }, { kundeId: e.kundeId }] } });
    if (bew) continue;
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "BEWERTUNG_OFFEN", referenzTyp: "Einsatz", referenzId: e.id } }, update: {}, create: { kostenstelleId: e.kostenstelleId, typ: "BEWERTUNG_OFFEN", titel: `Bewertung einholen: ${e.person.vorname} ${e.person.nachname} bei ${e.kunde.firmenname}`, faelligAm: e.bis ?? heute, personId: e.personId, kundeId: e.kundeId, referenzTyp: "Einsatz", referenzId: e.id } });
  }
  // AMS-Förderung endet in 30 Tagen → Verlängerung/Kalkulation prüfen
  const amsEnde = await db.person.findMany({ where: { amsGefoerdert: true, status: "VERMITTELT", amsFoerderungBis: { lte: new Date(heute.getTime() + 30 * 86400000) } } });
  for (const p of amsEnde) {
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "AMS_FOERDERUNG_ENDE", referenzTyp: "Person", referenzId: p.id } }, update: {}, create: { kostenstelleId: p.kostenstelleId, typ: "AMS_FOERDERUNG_ENDE", titel: `AMS-Förderung endet am ${p.amsFoerderungBis!.toLocaleDateString("de-AT")}: ${p.vorname} ${p.nachname}${p.amsFoerderungBetrag ? ` (${p.amsFoerderungBetrag.toLocaleString("de-AT")} €/Monat)` : ""} – Verlängerung beantragen oder Kalkulation anpassen`, faelligAm: new Date(p.amsFoerderungBis!.getTime() - 30 * 86400000), personId: p.id, referenzTyp: "Person", referenzId: p.id } });
  }
  // AÜG-Überlassungsstatistik § 13: Stichtag 31. Juli, Wiedervorlage ab 1. Juni (für die Zentrale)
  const zentrale = await db.kostenstelle.findFirst({ where: { isZentrale: true } });
  if (zentrale && heute.getMonth() >= 5 && heute.getMonth() <= 6) {
    const jahr = heute.getFullYear();
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "AUEG_STATISTIK", referenzTyp: "Jahr", referenzId: String(jahr) } }, update: {}, create: { kostenstelleId: zentrale.id, typ: "AUEG_STATISTIK", titel: `Überlassungsstatistik § 13 AÜG ${jahr} (Stichtag 31. Juli) an die Gewerbebehörde melden`, faelligAm: new Date(jahr, 6, 31), referenzTyp: "Jahr", referenzId: String(jahr) } });
  }
  // Grenzüberschreitende Überlassung → ZKO-Meldung vor Einsatzbeginn
  const grenz = await db.einsatz.findMany({ where: { grenzueberschreitend: true, zkoGemeldet: false, status: { in: ["GEPLANT", "AKTIV"] } }, include: { person: true, kunde: true } });
  for (const e of grenz) {
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "ZKO_MELDUNG", referenzTyp: "Einsatz", referenzId: e.id } }, update: {}, create: { kostenstelleId: e.kostenstelleId, typ: "ZKO_MELDUNG", titel: `ZKO-Meldung (grenzüberschreitende Überlassung) für ${e.person.vorname} ${e.person.nachname} → ${e.kunde.firmenname} (${e.kunde.land}) vor Einsatzbeginn ${e.von.toLocaleDateString("de-AT")}`, faelligAm: e.von, personId: e.personId, kundeId: e.kundeId, referenzTyp: "Einsatz", referenzId: e.id } });
  }
  await db.aufgabe.updateMany({ where: { typ: "ZKO_MELDUNG", erledigt: false, referenzId: { in: (await db.einsatz.findMany({ where: { zkoGemeldet: true }, select: { id: true } })).map((x) => x.id) } }, data: { erledigt: true, erledigtAm: heute } });
  // Zeitkonto: Durchrechnungszeitraum endet in 60 Tagen → Saldo abbauen/auszahlen
  const aktive = await db.person.findMany({ where: { status: "VERMITTELT" }, select: { id: true, vorname: true, nachname: true, kostenstelleId: true, durchrechnungStart: true, durchrechnungMonate: true, eintrittsdatum: true } });
  for (const p of aktive) {
    const start = p.durchrechnungStart ?? p.eintrittsdatum; if (!start) continue;
    let ende = new Date(start.getFullYear(), start.getMonth() + p.durchrechnungMonate, 0);
    while (ende < heute) ende = new Date(ende.getFullYear(), ende.getMonth() + 1 + p.durchrechnungMonate, 0); // laufender Zeitraum
    if (ende.getTime() - heute.getTime() > 60 * 86400000) continue;
    await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "ZEITKONTO_ABLAUF", referenzTyp: "Zeitkonto", referenzId: `${p.id}-${ende.toISOString().slice(0, 10)}` } }, update: {}, create: { kostenstelleId: p.kostenstelleId, typ: "ZEITKONTO_ABLAUF", titel: `Durchrechnungszeitraum von ${p.vorname} ${p.nachname} endet am ${ende.toLocaleDateString("de-AT")} – Zeitkonto ausgleichen (Zeitausgleich oder Auszahlung)`, faelligAm: ende, personId: p.id, referenzTyp: "Zeitkonto", referenzId: `${p.id}-${ende.toISOString().slice(0, 10)}` } });
  }
  // Provisionsbeleg des Vormonats freigeben (Zentrale) – für Kostenstellen mit Abrechnung
  if (zentrale) {
    const vm = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);
    const kst = await db.kostenstelle.findMany({ where: { isZentrale: false, aktiv: true } });
    for (const k of kst) {
      const hat = await db.monatsabrechnung.count({ where: { kostenstelleId: k.id, jahr: vm.getFullYear(), monat: vm.getMonth() + 1 } });
      if (!hat) continue;
      const beleg = await db.provisionsabrechnung.findUnique({ where: { kostenstelleId_jahr_monat: { kostenstelleId: k.id, jahr: vm.getFullYear(), monat: vm.getMonth() + 1 } } });
      const ref = `${k.id}-${vm.getFullYear()}-${vm.getMonth() + 1}`;
      if (beleg && beleg.status !== "ENTWURF") { await db.aufgabe.updateMany({ where: { typ: "PROVISION_FREIGABE", referenzId: ref, erledigt: false }, data: { erledigt: true, erledigtAm: heute } }); continue; }
      await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "PROVISION_FREIGABE", referenzTyp: "Provision", referenzId: ref } }, update: {}, create: { kostenstelleId: zentrale.id, typ: "PROVISION_FREIGABE", titel: `Provisionsbeleg ${vm.getMonth() + 1}/${vm.getFullYear()} für ${k.name} erzeugen und freigeben`, faelligAm: new Date(heute.getFullYear(), heute.getMonth(), 10), referenzTyp: "Provision", referenzId: ref } });
    }
  }
  // Empfehlungsprämie fällig (Freunde werben Freunde)
  const faellige = await db.empfehlung.findMany({ where: { status: "EINGESTELLT", faelligAm: { lte: heute } }, include: { werber: true } });
  for (const e of faellige) await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ: "EMPFEHLUNG_PRAEMIE", referenzTyp: "Empfehlung", referenzId: e.id } }, update: {}, create: { kostenstelleId: e.werber.kostenstelleId, typ: "EMPFEHLUNG_PRAEMIE", titel: `Empfehlungsprämie für ${e.werber.vorname} ${e.werber.nachname} (${e.name}) prüfen und freigeben`, faelligAm: e.faelligAm!, personId: e.werberId, referenzTyp: "Empfehlung", referenzId: e.id } });
  // Überfällige Rechnungen
  await db.rechnung.updateMany({ where: { status: "VERSENDET", faelligAm: { lt: heute } }, data: { status: "UEBERFAELLIG" } });
  const rechnungen = await db.rechnung.findMany({ where: { status: { in: ["UEBERFAELLIG", "TEILBEZAHLT"] }, faelligAm: { lt: heute } }, include: { kunde: true } });
  for (const r of rechnungen) {
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "RECHNUNG_UEBERFAELLIG", referenzTyp: "Rechnung", referenzId: r.id } },
      update: {},
      create: { kostenstelleId: r.kostenstelleId, typ: "RECHNUNG_UEBERFAELLIG", titel: `Rechnung ${r.nummer} (${r.kunde.firmenname}) überfällig`, faelligAm: r.faelligAm, kundeId: r.kundeId, referenzTyp: "Rechnung", referenzId: r.id },
    });
  }
  // Angebote ohne Antwort > 14 Tage
  const offen = await db.angebot.findMany({ where: { status: "VERSENDET", versendetAm: { lt: new Date(heute.getTime() - 14 * 86400000) } }, include: { kunde: true } });
  for (const a of offen) {
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "ANGEBOT_OFFEN", referenzTyp: "Angebot", referenzId: a.id } },
      update: {},
      create: { kostenstelleId: a.kostenstelleId, typ: "ANGEBOT_OFFEN", titel: `Angebot ${a.nummer} (${a.kunde.firmenname}) nachfassen`, faelligAm: heute, kundeId: a.kundeId, referenzTyp: "Angebot", referenzId: a.id },
    });
  }
  // Einsätze, die in 14 Tagen enden
  const in14 = new Date(heute.getTime() + 14 * 86400000);
  const einsaetze = await db.einsatz.findMany({ where: { status: "AKTIV", bis: { not: null, lte: in14, gte: heute } }, include: { person: true, kunde: true } });
  for (const e of einsaetze) {
    await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "EINSATZ_ENDE", referenzTyp: "Einsatz", referenzId: e.id } },
      update: {},
      create: { kostenstelleId: e.kostenstelleId, typ: "EINSATZ_ENDE", titel: `Einsatz ${e.person.vorname} ${e.person.nachname} bei ${e.kunde.firmenname} endet`, faelligAm: e.bis!, personId: e.personId, kundeId: e.kundeId, referenzTyp: "Einsatz", referenzId: e.id },
    });
  }
  // Erledigte Referenzen aufräumen (bezahlte Rechnungen, entschiedene Angebote)
  await db.aufgabe.updateMany({ where: { typ: "RECHNUNG_UEBERFAELLIG", erledigt: false, referenzId: { in: (await db.rechnung.findMany({ where: { status: { in: ["BEZAHLT", "STORNIERT"] } }, select: { id: true } })).map((r) => r.id) } }, data: { erledigt: true, erledigtAm: heute } });
  await db.aufgabe.updateMany({ where: { typ: "ANGEBOT_OFFEN", erledigt: false, referenzId: { in: (await db.angebot.findMany({ where: { status: { not: "VERSENDET" } }, select: { id: true } })).map((r) => r.id) } }, data: { erledigt: true, erledigtAm: heute } });
}


/**
 * Wochen-Erinnerung an alle, deren Stundennachweis für die Vorwoche fehlt. Läuft einmal je Kalenderwoche –
 * der Zeitpunkt der letzten Erinnerung liegt in den Einstellungen, damit niemand mehrfach angestupst wird.
 *
 * Sie feuert ab Montag, nicht nur montags: fiel der Lauf am Montag aus (Feiertag, Serverneustart), wird
 * sie am Dienstag nachgeholt, statt für diese Woche ersatzlos zu entfallen.
 */
export async function stundenErinnerungSenden(heute = new Date()): Promise<{ erinnert: number }> {
  if (heute.getDay() === 0) return { erinnert: 0 }; // sonntags nicht
  const vor = isoWoche(new Date(heute.getTime() - 3 * 86400000));
  const marke = `${vor.jahr}-${vor.kw}`;
  const zuletzt = await einstellung<string | null>("stundenErinnerung", null);
  if (zuletzt === marke) return { erinnert: 0 };
  const aktive = await db.person.findMany({
    // nur wer die Stundenerfassung in der App überhaupt freigeschaltet hat
    where: { status: "VERMITTELT", appGesperrtAm: null, appZuletztAktiv: { not: null }, einsaetze: { some: { status: "AKTIV", stundenerfassungApp: true } } },
    select: { id: true, stundennachweise: { where: { jahr: vor.jahr, kw: vor.kw }, select: { id: true } } },
  });
  let erinnert = 0;
  for (const p of aktive) {
    if (p.stundennachweise.length) continue;
    const r = await pushAn(p.id, PUSH_TEXTE.ERINNERUNG(`Dein Stundennachweis für KW ${vor.kw} fehlt noch. Zwei Minuten in der App – dann passt die Abrechnung.`)).catch(() => ({ gesendet: 0 }));
    if (r.gesendet) erinnert++;
  }
  await setEinstellung("stundenErinnerung", marke);
  return { erinnert };
}
