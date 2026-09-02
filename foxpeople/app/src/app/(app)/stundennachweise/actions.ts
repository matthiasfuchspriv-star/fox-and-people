"use server";
import { speichereDokument, loescheDatei } from "@/lib/storage";
import { wochennachweisPdf } from "@/lib/nachweis-pdf";
import { pushAn, PUSH_TEXTE } from "@/lib/push";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, darfKostenstelle, darfSensibel, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseNum, strOrNull, str } from "@/lib/format";
import { montagDerKw, isoWoche } from "@/lib/wochen";
import { zulagenMengenLesen } from "@/lib/verrechnung";

/**
 * Einsatz zu einer Kalenderwoche finden: Der Einsatzzeitraum muss die Woche überlappen.
 *
 * Vorher wurde einfach der zuletzt begonnene Einsatz genommen – nach einem Kundenwechsel landeten
 * die Zettel der Vorwoche damit beim NEUEN Kunden, mit dessen Verrechnungssatz. Ein Nachweis ohne
 * passenden Einsatz bleibt jetzt ohne Zuordnung und wird nicht still auf den falschen Kunden gebucht.
 */
async function einsatzZurWoche(personId: string, jahr: number, kw: number, status: ("AKTIV" | "GEPLANT" | "BEENDET")[]) {
  const montag = montagDerKw(jahr, kw);
  const sonntag = new Date(montag.getTime() + 6 * 86400000 + 86399000);
  return db.einsatz.findFirst({
    where: { personId, status: { in: status }, von: { lte: sonntag }, OR: [{ bis: null }, { bis: { gte: montag } }] },
    orderBy: { von: "desc" },
  });
}
import { berechneWoche, eintraegeAusForm, wochentage, type Tageseintrag } from "@/lib/zeitaufzeichnung";
import { eintraegeAus } from "@/lib/nachweis-pdf";
import { verrechnungAufschluesseln } from "@/lib/verrechnung";
import type { Prisma } from "@/generated/prisma/client";

/** Stundennachweis bestätigen → Stunden in die Monatsabrechnung übernehmen (Woche dem Monat mit den meisten Tagen zugeordnet, tagesgenau gesplittet) */
export async function nachweisEntscheiden(id: string, fd: FormData) {
  const s = await requireSession();
  const n = await db.stundennachweis.findUnique({ where: { id }, include: { person: true } });
  if (!n || !darfKostenstelle(s, n.person.kostenstelleId) || !darfSensibel(s)) redirect("/stundennachweise?fehler=berechtigung");
  const entscheidung = str(fd.get("entscheidung"));
  if (entscheidung === "ABLEHNEN") {
    await db.stundennachweis.update({ where: { id }, data: { status: "ABGELEHNT", rueckmeldung: str(fd.get("rueckmeldung")) || "Bitte Stunden prüfen und erneut einreichen.", geprueftAm: new Date(), geprueftVon: s.name } });
    await db.nachricht.create({ data: { personId: n.personId, vonMitarbeiter: false, nutzerName: s.name, text: `Dein Stundennachweis KW ${n.kw}/${n.jahr} braucht eine Korrektur: ${str(fd.get("rueckmeldung")) || "bitte Stunden prüfen und erneut einreichen."}` } });
  } else {
    const einsatz = n.einsatzId ? await db.einsatz.findUnique({ where: { id: n.einsatzId } }) : await einsatzZurWoche(n.personId, n.jahr, n.kw, ["AKTIV", "BEENDET"]);
    const wochennormal = einsatz?.wochenstunden ?? n.person.wochenstunden ?? 38.5;
    // Tagesbezogene Auswertung nach AZG: Normalstunden, Ü50 und Ü100 je Tag
    const auswertung = (nw: { jahr: number; kw: number; tage: unknown; eintraege: unknown }) =>
      berechneWoche(eintraegeAus(nw), { daten: wochentage(nw.jahr, nw.kw).map((t) => t.datum), wochennormal });
    const w = auswertung(n);
    if (einsatz) {
      // Stunden je Monat aufteilen und in der Monatsabrechnung addieren (idempotent: alle bestätigten Wochen des Monats neu summieren)
      const montag = montagDerKw(n.jahr, n.kw);
      const monate = new Set<string>();
      w.tage.forEach((_, i) => { const d = new Date(montag.getFullYear(), montag.getMonth(), montag.getDate() + i); monate.add(`${d.getFullYear()}-${d.getMonth() + 1}`); });
      // Nur die Nachweise DIESES Einsatzes: sonst landen bei einem Kundenwechsel mitten im Monat
      // die Stunden von Kunde A auf der Rechnung von Kunde B.
      const bestaetigte = await db.stundennachweis.findMany({ where: { personId: n.personId, status: "BESTAETIGT", einsatzId: einsatz.id, id: { not: id } } });
      for (const k of monate) {
        const [jahr, monat] = k.split("-").map(Number);
        const vorhanden = await db.monatsabrechnung.findUnique({ where: { personId_kundeId_jahr_monat: { personId: n.personId, kundeId: einsatz.kundeId, jahr, monat } } });
        if (vorhanden?.status === "ABGERECHNET") continue;
        let normal = 0, ue50 = 0, ue100 = 0;
        for (const b of [n, ...bestaetigte]) {
          const bw = auswertung(b); const m0 = montagDerKw(b.jahr, b.kw);
          bw.tage.forEach((t, i) => {
            const d = new Date(m0.getFullYear(), m0.getMonth(), m0.getDate() + i);
            if (d.getFullYear() !== jahr || d.getMonth() + 1 !== monat) return;
            normal += t.normal; ue50 += t.ue50; ue100 += t.ue100;
          });
        }
        const r2 = (x: number) => Math.round(x * 100) / 100;
        normal = r2(normal); ue50 = r2(ue50); ue100 = r2(ue100);
        // Zuschläge und weiterverrechnete Zulagen kommen aus der Kundenkondition – dieselbe Funktion,
        // aus der später die Rechnungspositionen gebildet werden. Nur so stimmen Abrechnung und Rechnung überein.
        // Zulagen-Mengen (Stunden/Tage je Zulage lt. Stundenzettel) bleiben erhalten, wie sie in der
        // Monatsabrechnung erfasst wurden – die Bestätigung eines Nachweises setzt sie nicht zurück.
        const mengen = zulagenMengenLesen(vorhanden?.zulagenMengen);
        const auf = await verrechnungAufschluesseln(einsatz.id, { stunden: normal, ueberstunden50: ue50, ueberstunden100: ue100, zulagenMengen: mengen });
        const verrechnung = auf ? auf.summe : vorhanden?.verrechnung ?? null;
        const zulagenBetrag = auf ? (auf.zeilen.filter((z) => z.typ === "ZULAGE").reduce((a, z) => a + z.betrag, 0) || null) : vorhanden?.zulagenBetrag ?? null;
        await db.monatsabrechnung.upsert({
          where: { personId_kundeId_jahr_monat: { personId: n.personId, kundeId: einsatz.kundeId, jahr, monat } },
          update: { stunden: normal, ueberstunden50: ue50, ueberstunden100: ue100, verrechnung, zulagenBetrag, einsatzId: einsatz.id, art: einsatz.art },
          create: { kostenstelleId: einsatz.kostenstelleId, personId: n.personId, kundeId: einsatz.kundeId, einsatzId: einsatz.id, jahr, monat, stunden: normal, ueberstunden50: ue50, ueberstunden100: ue100, verrechnung, zulagenBetrag, art: einsatz.art },
        });
      }
    }
    await db.stundennachweis.update({ where: { id }, data: { status: "BESTAETIGT", rueckmeldung: null, geprueftAm: new Date(), geprueftVon: s.name, summeNormal: w.normal, summeUe50: w.ue50, summeUe100: w.ue100 } });
    if (n.fotoDokumentId) await db.dokument.update({ where: { id: n.fotoDokumentId }, data: { geprueft: true } });
    await db.nachricht.create({ data: { personId: n.personId, vonMitarbeiter: false, nutzerName: s.name, text: `Dein Stundennachweis KW ${n.kw}/${n.jahr} (${n.summe} h) ist bestätigt. Danke!` } });
    // Der bestätigte Stundenzettel landet automatisch im Mitarbeiterakt: als PDF unter Dokumente
    // (Kategorie „Stundenzettel", für den Mitarbeiter sichtbar) und als Eintrag in der Historie.
    // Eine erneute Bestätigung nach Korrektur ERSETZT das alte PDF – sonst stapeln sich Duplikate.
    // Scheitert die PDF-Erzeugung, bleibt die Bestätigung trotzdem gültig (Fehlermonitor statt Abbruch).
    try {
      const pdf = await wochennachweisPdf(id);
      if (pdf) {
        const alte = await db.dokument.findMany({ where: { personId: n.personId, kategorie: "Stundenzettel", dateiname: pdf.dateiname } });
        for (const d of alte) { await db.dokument.delete({ where: { id: d.id } }); await loescheDatei(d.speicherpfad).catch(() => undefined); }
        await speichereDokument({ kostenstelleId: n.person.kostenstelleId, dateiname: pdf.dateiname, mime: "application/pdf", inhalt: pdf.buf, kategorie: "Stundenzettel", personId: n.personId, sichtbarImPortal: true, hochgeladenVon: s.name, quelle: "SYSTEM" });
        await db.aktivitaet.create({ data: { typ: "DOKUMENT", text: alte.length ? `Stundenzettel KW ${n.kw}/${n.jahr} erneut bestätigt (${n.summe} h) – PDF im Akt ersetzt` : `Stundenzettel KW ${n.kw}/${n.jahr} bestätigt (${n.summe} h) und im Akt abgelegt`, nutzerName: s.name, personId: n.personId } });
      }
    } catch (err) {
      const { fehlerMelden } = await import("@/lib/fehler");
      await fehlerMelden("Stundenzettel-PDF", err, { detail: `KW ${n.kw}/${n.jahr} ${n.person.vorname} ${n.person.nachname}` });
    }
  }
  await pushAn(n.personId, entscheidung === "ABLEHNEN"
    ? PUSH_TEXTE.STUNDEN_KORREKTUR(`KW ${n.kw}/${n.jahr}: ${str(fd.get("rueckmeldung")) || "bitte Stunden prüfen und erneut einreichen."}`)
    : PUSH_TEXTE.STUNDEN_BESTAETIGT(`KW ${n.kw}/${n.jahr} mit ${n.summe} Stunden ist bestätigt.`)).catch(() => undefined);
  await db.aufgabe.updateMany({ where: { typ: "STUNDENNACHWEIS_PRUEFEN", referenzId: id, erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  await audit(s, "STATUS", "Stundennachweis", id, `KW ${n.kw}/${n.jahr} ${n.person.vorname} ${n.person.nachname}: ${entscheidung === "ABLEHNEN" ? "abgelehnt" : "bestätigt"}`, undefined, n.person.kostenstelleId);
  if (entscheidung !== "ABLEHNEN" && !n.einsatzId) {
    const e = await einsatzZurWoche(n.personId, n.jahr, n.kw, ["AKTIV", "BEENDET"]);
    if (!e) await db.aufgabe.upsert({
      where: { typ_referenzTyp_referenzId: { typ: "STUNDENNACHWEIS_PRUEFEN", referenzTyp: "Stundennachweis", referenzId: id } },
      update: { erledigt: false, erledigtAm: null, titel: `Stundennachweis KW ${n.kw}/${n.jahr} von ${n.person.vorname} ${n.person.nachname}: kein Einsatz im Wochenzeitraum – Stunden NICHT in die Monatsabrechnung übernommen. Einsatz prüfen und zuordnen.` },
      create: { kostenstelleId: n.person.kostenstelleId, typ: "STUNDENNACHWEIS_PRUEFEN", titel: `Stundennachweis KW ${n.kw}/${n.jahr} von ${n.person.vorname} ${n.person.nachname}: kein Einsatz im Wochenzeitraum – Stunden NICHT in die Monatsabrechnung übernommen. Einsatz prüfen und zuordnen.`, faelligAm: new Date(), personId: n.personId, referenzTyp: "Stundennachweis", referenzId: id },
    });
  }
  revalidatePath("/stundennachweise"); revalidatePath("/abrechnung"); revalidatePath("/app/stunden");
  redirect("/stundennachweise?ok=1");
}


/**
 * Stundenzettel aus dem Büro hochladen (Papier-Stundenzettel vom Kunden): Mitarbeiter, KW, Tagesstunden Mo–So und Scan/Foto.
 * Wird sofort als bestätigter Nachweis gespeichert und fließt in die Monatsabrechnung (gleicher Weg wie App-Nachweise).
 */
export async function stundenzettelHochladen(fd: FormData) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/stundennachweise?fehler=berechtigung");
  const personId = str(fd.get("personId")); const jahr = Number(fd.get("jahr")); const kw = Number(fd.get("kw"));
  const p = await db.person.findUnique({ where: { id: personId } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId) || !jahr || !kw) redirect("/stundennachweise?fehler=pflicht");
  // Erfassung entweder als Tagesstunden (t0–t6) oder als vollständige Arbeitszeitaufzeichnung (d0_beginn, d0_ende, d0_pause …)
  const detail = fd.has("d0_beginn");
  const eintraege: Tageseintrag[] = detail ? eintraegeAusForm(fd) : [0, 1, 2, 3, 4, 5, 6].map((i) => ({ gesamt: parseNum(fd.get(`t${i}`)) ?? 0 }));
  const w = berechneWoche(eintraege, { daten: wochentage(jahr, kw).map((t) => t.datum), wochennormal: p.wochenstunden ?? 38.5 });
  const tage = w.tage.map((t) => t.gesamt);
  const summe = w.summe;
  if (!summe) redirect("/stundennachweise?fehler=stunden");
  const einsatz = await einsatzZurWoche(personId, jahr, kw, ["AKTIV", "GEPLANT", "BEENDET"]);
  let fotoDokumentId: string | null = null;
  const file = fd.get("datei");
  if (file instanceof File && file.size > 0) {
    const d = await speichereDokument({ kostenstelleId: p.kostenstelleId, dateiname: `Stundenzettel_KW${kw}_${jahr}_${p.nachname}${file.name.slice(file.name.lastIndexOf(".")) || ".pdf"}`, mime: file.type || "application/pdf", inhalt: Buffer.from(await file.arrayBuffer()), kategorie: "Stundennachweis", personId, kundeId: einsatz?.kundeId ?? null, sichtbarImPortal: true, hochgeladenVon: s.name, geprueft: true, quelle: "INTERN" , fehlerZiel: "/stundennachweise" });
    fotoDokumentId = d.id;
  }
  const n = await db.stundennachweis.upsert({
    where: { personId_jahr_kw: { personId, jahr, kw } },
    create: { personId, jahr, kw, tage, eintraege: eintraege as unknown as Prisma.InputJsonValue, summe, summeNormal: w.normal, summeUe50: w.ue50, summeUe100: w.ue100, quelle: "BUERO", einsatzId: einsatz?.id ?? null, fotoDokumentId, status: "EINGEREICHT", notiz: strOrNull(fd.get("notiz")) ?? "Stundenzettel im Büro erfasst" },
    update: { tage, eintraege: eintraege as unknown as Prisma.InputJsonValue, summe, summeNormal: w.normal, summeUe50: w.ue50, summeUe100: w.ue100, quelle: "BUERO", einsatzId: einsatz?.id ?? null, ...(fotoDokumentId ? { fotoDokumentId } : {}), status: "EINGEREICHT", notiz: strOrNull(fd.get("notiz")) ?? "Stundenzettel im Büro erfasst" },
  });
  // Sofort bestätigen → Monatsabrechnung
  const bfd = new FormData(); bfd.set("entscheidung", "BESTAETIGEN");
  await nachweisEntscheiden(n.id, bfd);
}

/** Alle offenen Stundennachweise einer Woche auf einmal bestätigen – spart der Dispo am Montag zwanzig Klicks. */
export async function alleBestaetigen(fd: FormData) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/stundennachweise?fehler=berechtigung");
  const jahr = Number(fd.get("jahr")); const kw = Number(fd.get("kw"));
  const where = tenantWhere(s);
  const offene = await db.stundennachweis.findMany({
    where: { status: "EINGEREICHT", ...(jahr && kw ? { jahr, kw } : {}), person: where.kostenstelleId ? { kostenstelleId: where.kostenstelleId } : {} },
    select: { id: true },
  });
  for (const n of offene) { const f = new FormData(); f.set("entscheidung", "BESTAETIGEN"); try { await nachweisEntscheiden(n.id, f); } catch { /* redirect aus der Einzelaktion ignorieren */ } }
  revalidatePath("/stundennachweise"); revalidatePath("/abrechnung");
  redirect(`/stundennachweise?ok=${offene.length}`);
}
