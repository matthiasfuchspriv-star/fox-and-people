"use server";
import { einsatzLoeschen as loescheEinsatz } from "@/lib/loeschen";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, darfKostenstelle, zielKostenstelle } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { AUSWEIS_KATEGORIEN } from "@/lib/dokumente";
import { parseDate, parseNum, str, strOrNull } from "@/lib/format";
import { keinZuschlagMerken } from "@/lib/referenz-entscheidung";
import { pruefeEinsatz } from "@/lib/einsatz";
import { massgeblicherMindestlohn } from "@/lib/mindestlohn";
import type { Schichtmodell, EinsatzStatus, EinsatzArt } from "@/generated/prisma/enums";
import type { EinsatzZulage } from "@/lib/zulagen";
import type { Prisma } from "@/generated/prisma/client";
import { dienstvertragAusForm } from "./dienstvertrag";
import { referenzKvFuer } from "@/lib/referenzlohn";

/** Gewählte Zulagen (Kürzel) als Snapshot der Stammdaten am Einsatz speichern */
async function zulagenAusForm(fd: FormData): Promise<EinsatzZulage[]> {
  const kuerzel = fd.getAll("zulage").map(String).filter(Boolean);
  if (!kuerzel.length) return [];
  const z = await db.zulage.findMany({ where: { kuerzel: { in: kuerzel } } });
  return z.map((x) => {
    // Der ausgehandelte Verkaufssatz je Stunde steht in einem eigenen Feld je Zulage.
    // Nur positive Beträge; leer bedeutet „wie der Lohnanteil“ und wird nicht gespeichert.
    const roh = parseNum(fd.get(`zulageSatz_${x.kuerzel}`));
    const verkaufssatz = roh != null && roh >= 0 && x.weiterverrechnen ? roh : null;
    return { kuerzel: x.kuerzel, name: x.name, art: x.art, wert: x.wert, weiterverrechnen: x.weiterverrechnen, steuerfrei: x.steuerfrei, verkaufssatz };
  });
}

export async function einsatzAnlegen(fd: FormData) {
  const s = await requireSession();
  const personId = str(fd.get("personId")); const kundeId = str(fd.get("kundeId"));
  const von = parseDate(fd.get("von")); const bis = parseDate(fd.get("bis"));
  const rolle = str(fd.get("rolle"));
  const qs = new URLSearchParams(Object.fromEntries([...fd.entries()].filter(([k, v]) => typeof v === "string" && v && !["konflikteAkzeptiert"].includes(k)) as [string, string][]));
  qs.set("zulage", fd.getAll("zulage").map(String).join(","));
  if (!personId || !kundeId || !von || !rolle) redirect(`/einsaetze/neu?${qs}&fehler=pflicht`);
  const [p, k] = await Promise.all([db.person.findUnique({ where: { id: personId } }), db.kunde.findUnique({ where: { id: kundeId } })]);
  if (!p || !k || !darfKostenstelle(s, p.kostenstelleId) || !darfKostenstelle(s, k.kostenstelleId)) redirect("/einsaetze?fehler=berechtigung");
  // Verrechnungssatz aus dem angenommenen Angebot (Position mit passender Rolle), wenn nicht ausdrücklich eingegeben
  const angebotId = strOrNull(fd.get("angebotId"));
  let verrechnungssatz = parseNum(fd.get("verrechnungssatz"));
  let stundenlohnAngebot: number | null = null;
  let beschaeftigerBg: string | null = null;
  const positionId = strOrNull(fd.get("positionId"));
  if (angebotId) {
    const a = await db.angebot.findUnique({ where: { id: angebotId }, include: { positionen: true } });
    // Die ausdrücklich gewählte Position hat Vorrang – erst danach wird über die Rolle gesucht
    const pos = (positionId ? a?.positionen.find((x) => x.id === positionId) : null)
      ?? a?.positionen.find((x) => x.rolle.toLowerCase() === rolle.toLowerCase()) ?? a?.positionen[0];
    if (pos?.verrechnungssatz != null && verrechnungssatz == null) verrechnungssatz = pos.verrechnungssatz;
    if (pos?.stundenlohn != null) stundenlohnAngebot = pos.stundenlohn;
    // Beschäftigungsgruppe des Beschäftiger-KV. Sie steht im Angebot, nicht am Dienstvertrag: Der
    // KV AKÜ und der KV des Beschäftigers haben eigene Gruppen (AKÜ A–I, Metalltechnische Industrie
    // A–K). Ohne sie findet die Prüfung die richtige Zeile der Lohntafel nicht und meldet den
    // Referenzlohn als „nicht hinterlegt", obwohl er hinterlegt ist.
    beschaeftigerBg = pos?.beschaeftigungsgruppe ?? null;
  }
  // Im Einsatz ausdrücklich gewählte Gruppe schlägt die aus dem Angebot – dort wurde sie vielleicht
  // nie gesetzt, und dann soll man nicht ins Angebot zurückmüssen, um einen Einsatz anlegen zu können.
  beschaeftigerBg = strOrNull(fd.get("beschaeftigerBg")) ?? beschaeftigerBg;
  const stundenlohn = parseNum(fd.get("stundenlohn")) ?? stundenlohnAngebot;
  const referenzlohnVonHand = parseNum(fd.get("referenzlohn"));
  const referenzGeprueft = fd.get("referenzGeprueft") === "on";
  // Einmalige Feststellung „für diesen Kollektivvertrag gibt es keinen Referenzzuschlag" – wird vor
  // der Prüfung gespeichert, damit sie beim selben Vorgang schon greift und nicht erst beim nächsten
  // Versuch. Mit Name und Zeitpunkt, nachlesbar unter Einstellungen → KV-Mindestlöhne.
  if (fd.get("keinZuschlagKv") === "on") {
    const kv = await db.kunde.findUnique({ where: { id: kundeId }, select: { kollektivvertrag: true } });
    if (kv?.kollektivvertrag) await keinZuschlagMerken(kv.kollektivvertrag, s.name);
  }
  const konflikte = await pruefeEinsatz({ personId, kundeId, von, bis, rolle, stundenlohn, referenzlohn: referenzlohnVonHand, referenzGeprueft, beschaeftigerBg });
  const hart = konflikte.filter((x) => x.hart);
  if (hart.length || (konflikte.length && fd.get("konflikteAkzeptiert") !== "on")) {
    qs.set("konflikte", JSON.stringify(konflikte));
    redirect(`/einsaetze/neu?${qs}`);
  }
  // Kostenstelle des Einsatzes: Standard ist die des Kunden. Die Zentrale kann sie frei wählen, damit
  // Umsatz und Provision gezielt einer Kostenstelle zugeordnet werden (die Monatsabrechnung erbt sie).
  const gewuenschteKs = strOrNull(fd.get("kostenstelleId"));
  const kostenstelleId = zielKostenstelle(s, gewuenschteKs && darfKostenstelle(s, gewuenschteKs) ? gewuenschteKs : k.kostenstelleId);
  const heute = new Date();
  // Referenzlohn des Beschäftigers und der daraus folgende Referenzzuschlag werden am Einsatz mitgeschrieben
  const ml = await massgeblicherMindestlohn({ kvId: p.kvId, beschaeftigungsgruppe: p.beschaeftigungsgruppe, beschaeftigerKv: referenzKvFuer(k, p.angestellt), beschaeftigerBg, eintritt: p.eintrittsdatum, am: von });
  const e = await db.einsatz.create({ data: { kostenstelleId, personId, kundeId, referenzlohn: ml.referenz ?? referenzlohnVonHand,
    ...(ml.referenzPruefen && (referenzGeprueft || referenzlohnVonHand != null) ? { referenzGeprueftAm: new Date(), referenzGeprueftVon: s.name } : {}), referenzzuschlag: (ml.referenzzuschlag || (referenzlohnVonHand != null && ml.akue != null ? Math.max(0, Math.round((referenzlohnVonHand - ml.akue) * 100) / 100) : 0)) || null, angefragtAm: parseDate(fd.get("angefragtAm")), besetztAm: new Date(), rolleImEinsatz: rolle, standardrolleReferenz: p.standardrolle, von, bis, schichtmodell: (str(fd.get("schichtmodell")) || "TAG") as Schichtmodell, art: (str(fd.get("art")) === "DIREKTVERMITTLUNG" ? "DIREKTVERMITTLUNG" : "UEBERLASSUNG") as EinsatzArt, vermittlungshonorar: parseNum(fd.get("vermittlungshonorar")), stundenerfassungApp: fd.get("stundenerfassungApp") === "on", schwerarbeit: fd.get("schwerarbeit") === "on", nachtschwerarbeit: fd.get("nachtschwerarbeit") === "on", zulagen: (await zulagenAusForm(fd)) as unknown as Prisma.InputJsonValue, wochenstunden: parseNum(fd.get("wochenstunden")) ?? 38.5, auslastung: parseNum(fd.get("auslastung")) ?? 100, stundenlohn, verrechnungssatz, einsatzort: strOrNull(fd.get("einsatzort")) ?? k.ort, kundenKostenstelle: strOrNull(fd.get("kundenKostenstelle")), notizen: strOrNull(fd.get("notizen")), status: von <= heute ? "AKTIV" : "GEPLANT", angebotId } });
  await db.person.update({ where: { id: personId }, data: { status: "VERMITTELT", hinterlegterKundeId: kundeId, wochenstunden: e.wochenstunden, ...(stundenlohn != null ? { stundenlohn } : {}), ...dienstvertragAusForm(fd, { parseDate, parseNum, strOrNull }, von) } });
  await audit(s, "CREATE", "Einsatz", e.id, `${p.vorname} ${p.nachname} → ${k.firmenname} (${rolle})`, konflikte.length ? { akzeptierteKonflikte: konflikte } : undefined, kostenstelleId);
  await db.aktivitaet.createMany({ data: [{ typ: "EINSATZ", text: `Einsatz bei ${k.firmenname} als ${rolle} ab ${von.toLocaleDateString("de-AT")}`, nutzerName: s.name, personId }, { typ: "EINSATZ", text: `Einsatz ${p.vorname} ${p.nachname} als ${rolle} ab ${von.toLocaleDateString("de-AT")}`, nutzerName: s.name, kundeId }] });
  // Ohne Ausweiskopie darf der Einsatz laufen – aber er darf nicht in Vergessenheit geraten.
  // Statt den Einsatz zu blockieren, kommt die Erinnerung sofort auf die Wiedervorlage.
  const ausweisDa = p.ausweisDokumentId || (await db.dokument.count({ where: { personId, kategorie: { in: [...AUSWEIS_KATEGORIEN] } } })) > 0;
  if (!ausweisDa) {
    await db.aufgabe.create({ data: {
      kostenstelleId, typ: "QUALIFIKATION_ABLAUF",
      titel: `Ausweiskopie von ${p.vorname} ${p.nachname} fehlt – Einsatz bei ${k.firmenname} läuft`,
      faelligAm: new Date(Date.now() + 3 * 86400000), personId, referenzTyp: "AUSWEIS", referenzId: e.id,
    } });
  }
  redirect(`/einsaetze/${e.id}`);
}

export async function einsatzStatus(id: string, fd: FormData) {
  const s = await requireSession();
  const e = await db.einsatz.findUnique({ where: { id }, include: { person: true } });
  if (!e || !darfKostenstelle(s, e.kostenstelleId)) redirect("/einsaetze");
  const status = str(fd.get("status")) as EinsatzStatus;
  const bis = parseDate(fd.get("bis"));
  const aufloesungsart = strOrNull(fd.get("aufloesungsart"));
  await db.einsatz.update({ where: { id }, data: { status, ...(status === "BEENDET" || status === "ABGEBROCHEN" ? { bis: bis ?? e.bis ?? new Date(), aufloesungsart } : {}) } });
  if (status === "BEENDET" || status === "ABGEBROCHEN") {
    const weitere = await db.einsatz.count({ where: { personId: e.personId, status: { in: ["AKTIV", "GEPLANT"] }, id: { not: id } } });
    if (!weitere) await db.person.update({ where: { id: e.personId }, data: { status: "SUCHT", verfuegbarSofort: true, verfuegbarAb: null } });
  }
  await audit(s, "STATUS", "Einsatz", id, `${e.status} → ${status}`, undefined, e.kostenstelleId);
  revalidatePath(`/einsaetze/${id}`);
  redirect(`/einsaetze/${id}`);
}

export async function einsatzSpeichern(id: string, fd: FormData) {
  const s = await requireSession();
  const e = await db.einsatz.findUnique({ where: { id } });
  if (!e || !darfKostenstelle(s, e.kostenstelleId)) redirect("/einsaetze");
  // Dieselbe Lohnuntergrenze wie beim Anlegen: Das Bearbeiten war bisher der einzige Weg, einen
  // Einsatz nachträglich UNTER den maßgeblichen Mindestlohn zu drücken – ohne Prüfung, ohne Warnung.
  const neuerLohn = parseNum(fd.get("stundenlohn"));
  if (neuerLohn != null) {
    const [pers, kd] = await Promise.all([db.person.findUnique({ where: { id: e.personId } }), db.kunde.findUnique({ where: { id: e.kundeId } })]);
    if (pers && kd) {
      const ml = await massgeblicherMindestlohn({ kvId: pers.kvId, beschaeftigungsgruppe: pers.beschaeftigungsgruppe, beschaeftigerKv: referenzKvFuer(kd, pers.angestellt), beschaeftigerBg: strOrNull(fd.get("beschaeftigerBg")), eintritt: pers.eintrittsdatum, am: parseDate(fd.get("von")) ?? e.von });
      if (neuerLohn < ml.mindest - 0.005) redirect(`/einsaetze/${id}?fehler=${encodeURIComponent(`Stundenlohn ${neuerLohn.toFixed(2)} € liegt unter dem maßgeblichen Mindestlohn ${ml.mindest.toFixed(2)} € (${ml.quellen.join(" · ")}) – NICHT gespeichert. Der Lohn- und Sozialdumping-Schutz gilt auch beim Bearbeiten.`)}`);
    }
  }
  // Kostenstelle des Einsatzes umstellbar (nur zulässige) – Umsatzzuordnung. Noch nicht abgerechnete
  // Monatsabrechnungen dieses Einsatzes ziehen mit, damit der bereits erfasste Umsatz zur neuen
  // Kostenstelle wandert; fakturierte Zeilen bleiben unangetastet (die Rechnung steht schon).
  const gewuenschteKs = strOrNull(fd.get("kostenstelleId"));
  const neueKs = gewuenschteKs && darfKostenstelle(s, gewuenschteKs) ? gewuenschteKs : e.kostenstelleId;
  await db.einsatz.update({ where: { id }, data: { kostenstelleId: neueKs, rolleImEinsatz: str(fd.get("rolle")) || e.rolleImEinsatz, von: parseDate(fd.get("von")) ?? e.von, bis: parseDate(fd.get("bis")), schichtmodell: (str(fd.get("schichtmodell")) || e.schichtmodell) as Schichtmodell, art: (str(fd.get("art")) || e.art) as EinsatzArt, vermittlungshonorar: parseNum(fd.get("vermittlungshonorar")) ?? e.vermittlungshonorar, stundenerfassungApp: fd.get("stundenerfassungApp") === "on", schwerarbeit: fd.get("schwerarbeit") === "on", nachtschwerarbeit: fd.get("nachtschwerarbeit") === "on", grenzueberschreitend: fd.get("grenzueberschreitend") === "on", zkoGemeldet: fd.get("zkoGemeldet") === "on", zulagen: (await zulagenAusForm(fd)) as unknown as Prisma.InputJsonValue, wochenstunden: parseNum(fd.get("wochenstunden")) ?? e.wochenstunden, auslastung: parseNum(fd.get("auslastung")) ?? e.auslastung, stundenlohn: parseNum(fd.get("stundenlohn")), verrechnungssatz: parseNum(fd.get("verrechnungssatz")), einsatzort: strOrNull(fd.get("einsatzort")), kundenKostenstelle: strOrNull(fd.get("kundenKostenstelle")), angebotId: strOrNull(fd.get("angebotId")) ?? e.angebotId, notizen: strOrNull(fd.get("notizen")) } });
  if (neueKs !== e.kostenstelleId) await db.monatsabrechnung.updateMany({ where: { einsatzId: id, status: { not: "ABGERECHNET" } }, data: { kostenstelleId: neueKs } });
  const lohn = parseNum(fd.get("stundenlohn"));
  await db.person.update({ where: { id: e.personId }, data: { wochenstunden: parseNum(fd.get("wochenstunden")) ?? e.wochenstunden, ...(lohn != null ? { stundenlohn: lohn } : {}), ...dienstvertragAusForm(fd, { parseDate, parseNum, strOrNull }, parseDate(fd.get("von")) ?? e.von) } });
  await audit(s, "UPDATE", "Einsatz", id, "Einsatz bearbeitet", undefined, e.kostenstelleId);
  revalidatePath(`/einsaetze/${id}`); revalidatePath(`/personen/${e.personId}`);
  redirect(`/einsaetze/${id}`);
}

/** Tagesraster speichern: Felder wt_<personId>_<jahr>_<kw>_<0–6> = X|K|U|Z|F|"" (Mo–So) */
export async function wochenSpeichern(jahr: number, monat: number, fd: FormData) {
  const s = await requireSession();
  const { montagDerKw, wochenstatusAus, tageDerKw, feiertageAT } = await import("@/lib/wochen");
  const wochen = new Map<string, { personId: string; jahr: number; kw: number; tage: string[] }>();
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^wt_(.+)_(\d{4})_(\d{1,2})_([0-6])$/);
    if (!m) continue;
    const key = `${m[1]}_${m[2]}_${m[3]}`;
    const w = wochen.get(key) ?? { personId: m[1], jahr: Number(m[2]), kw: Number(m[3]), tage: ["-", "-", "-", "-", "-", "-", "-"] };
    w.tage[Number(m[4])] = (String(v).toUpperCase() || "-").charAt(0);
    wochen.set(key, w);
  }
  let n = 0;
  for (const w of wochen.values()) {
    const { personId, jahr: jahrKw, kw: kwN } = w;
    const p = await db.person.findUnique({ where: { id: personId } });
    if (!p || !darfKostenstelle(s, p.kostenstelleId)) continue;
    const status = wochenstatusAus(w.tage);
    const tageStr = w.tage.join("");
    const alt = await db.wochenstatus.findUnique({ where: { personId_jahr_kw: { personId, jahr: jahrKw, kw: kwN } } });
    if (alt?.tage === tageStr || (!alt && status === "")) continue;
    const mo = montagDerKw(jahrKw, kwN); const fr = new Date(mo); fr.setUTCDate(mo.getUTCDate() + 4);
    const notiz = `Wochenraster KW ${kwN}/${jahrKw}`;
    // automatisch erzeugte Abwesenheiten der Woche neu ableiten (zusammenhängende K/U/Z-Tage → je eine Abwesenheit)
    await db.abwesenheit.deleteMany({ where: { personId, notiz: { startsWith: notiz } } });
    await db.zeitbuchung.deleteMany({ where: { personId, typ: "ZEITAUSGLEICH", notiz } });
    const daten = tageDerKw(jahrKw, kwN);
    let i = 0;
    while (i < 7) {
      const st = w.tage[i];
      if (st === "K" || st === "U" || st === "Z") {
        let j = i; while (j + 1 < 7 && w.tage[j + 1] === st) j++;
        const tage = daten.slice(i, j + 1).filter((d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && !feiertageAT(d.getUTCFullYear()).has(d.toISOString().slice(0, 10))).length;
        await db.abwesenheit.create({ data: { personId, typ: st === "K" ? "KRANKENSTAND" : st === "U" ? "URLAUB" : "SONSTIGES", von: daten[i], bis: daten[j], tage, notiz: st === "Z" ? `${notiz} · Zeitausgleich` : notiz, status: "GENEHMIGT" } });
        // Zeitausgleich baut das Zeitkonto ab (Tagesstunden = Wochenstunden ÷ 5)
        if (st === "Z" && tage > 0) await db.zeitbuchung.create({ data: { personId, datum: daten[i], stunden: -Math.round(tage * ((p.wochenstunden ?? 38.5) / 5) * 100) / 100, typ: "ZEITAUSGLEICH", notiz } });
        i = j + 1;
      } else i++;
    }
    if (!status) { if (alt) await db.wochenstatus.delete({ where: { id: alt.id } }); n++; continue; }
    const einsatz = await db.einsatz.findFirst({ where: { personId, status: { in: ["AKTIV", "GEPLANT"] }, von: { lte: fr }, OR: [{ bis: null }, { bis: { gte: mo } }] } });
    await db.wochenstatus.upsert({ where: { personId_jahr_kw: { personId, jahr: jahrKw, kw: kwN } }, create: { personId, jahr: jahrKw, kw: kwN, status, tage: tageStr, einsatzId: einsatz?.id }, update: { status, tage: tageStr, einsatzId: einsatz?.id } });
    n++;
  }
  await audit(s, "UPDATE", "Wochenstatus", `${jahr}-${monat}`, `${n} Wochen gespeichert`, undefined, s.aktiveKostenstelleId ?? s.kostenstelleId);
  revalidatePath("/einsaetze"); revalidatePath("/");
  redirect(`/einsaetze?monat=${jahr}-${String(monat).padStart(2, "0")}&ansicht=monat&gespeichert=${n}`);
}


/** Einsatz endgültig löschen (nur Systemadmin) – nicht möglich, wenn bereits abgerechnet/fakturiert. */
export async function einsatzLoeschen(id: string, fd?: FormData) {
  const s = await requireSession();
  if (s.rolle !== "SYSTEMADMIN") redirect(`/einsaetze/${id}?fehler=berechtigung`);
  const e = await db.einsatz.findUnique({ where: { id }, include: { person: true, kunde: true } });
  if (!e) redirect("/einsaetze");
  const erzwingen = fd?.get("erzwingen") === "ja";
  try { await loescheEinsatz(id, { erzwingen }); } catch (err) { redirect(`/einsaetze/${id}?fehler=${encodeURIComponent(err instanceof Error ? err.message : "Löschen nicht möglich")}`); }
  // Person ohne weiteren Einsatz zurück in den Pool
  const weitere = await db.einsatz.count({ where: { personId: e.personId, status: { in: ["AKTIV", "GEPLANT"] } } });
  if (!weitere && e.person.status === "VERMITTELT") await db.person.update({ where: { id: e.personId }, data: { status: "SUCHT", verfuegbarSofort: true } });
  await audit(s, "DELETE", "Einsatz", id, `${e.person.vorname} ${e.person.nachname} bei ${e.kunde.firmenname} gelöscht`, undefined, e.kostenstelleId);
  revalidatePath("/einsaetze");
  redirect("/einsaetze?geloescht=1");
}

/**
 * Arbeitspapiere direkt aus dem Einsatz erzeugen: Arbeitsvertrag, Überlassungsmitteilung,
 * Zusatzvereinbarung – einzeln oder alle drei. Die PDFs entstehen im Layout der Word-Vorlagen
 * mit den Daten aus Einsatz, Person, Kunde und Firmenstamm; Unbekanntes bleibt Ausfüllfeld.
 * Die Dateinamen tragen den Vorlagen-Namen (keine Verwechslung), dazu Mitarbeiter und Nummer.
 * Existiert das Papier für diesen Einsatz schon, wird kein zweites erzeugt, sondern dorthin verlinkt.
 */
export async function arbeitspapiereErzeugen(einsatzId: string, fd: FormData) {
  const s = await requireSession();
  const e = await db.einsatz.findUnique({ where: { id: einsatzId }, include: { person: true } });
  if (!e || !darfKostenstelle(s, e.kostenstelleId)) redirect("/einsaetze");
  const wahl = str(fd.get("typ"));
  const alle = ["DIENSTVERTRAG", "UEBERLASSUNGSMITTEILUNG", "ZUSATZVEREINBARUNG"] as const;
  const typen = wahl === "ALLE" ? [...alle] : alle.includes(wahl as (typeof alle)[number]) ? [wahl as (typeof alle)[number]] : [];
  if (!typen.length) redirect(`/einsaetze/${einsatzId}`);
  const { vertragsKontext, renderVorlage } = await import("@/lib/vertrag");
  const { naechsteNummer } = await import("@/lib/nummern");
  const { vertragPdf } = await import("../vertraege/pdf");
  const { titel, vertragDateiname } = await import("../vertraege/titel");
  const { speichereDokument } = await import("@/lib/storage");
  const erzeugt: string[] = [];
  let ziel: string | null = null;
  for (const typ of typen) {
    const vorhanden = await db.vertrag.findFirst({ where: { einsatzId, typ }, orderBy: { erstelltAm: "desc" } });
    if (vorhanden) { ziel ??= vorhanden.id; continue; }
    const vorlage = await db.vertragsvorlage.findFirst({ where: { typ, aktiv: true }, orderBy: { version: "desc" } });
    const { ctx } = await vertragsKontext({ personId: e.personId, kundeId: e.kundeId, einsatzId, kostenstelleId: e.kostenstelleId });
    const nummer = await naechsteNummer(e.kostenstelleId, "VT");
    const v = await db.vertrag.create({ data: { kostenstelleId: e.kostenstelleId, nummer, typ, vorlageId: vorlage?.id ?? null, personId: e.personId, kundeId: e.kundeId, einsatzId, inhalt: vorlage ? renderVorlage(vorlage.inhalt, ctx) : "" } });
    try {
      const pdf = await vertragPdf(v.id);
      const doc = await speichereDokument({ kostenstelleId: e.kostenstelleId, dateiname: vertragDateiname(typ, nummer, e.person), mime: "application/pdf", inhalt: pdf, kategorie: titel(typ), personId: e.personId, kundeId: e.kundeId, vertragId: v.id, sichtbarImPortal: false, hochgeladenVon: s.name });
      await db.vertrag.update({ where: { id: v.id }, data: { pdfEntwurfDokumentId: doc.id } });
      await db.aktivitaet.create({ data: { typ: "DOKUMENT", text: `${titel(typ)} ${nummer} aus dem Einsatz erzeugt`, nutzerName: s.name, personId: e.personId } });
    } catch (err) {
      // Nicht still schlucken: Ein Vertrag ohne PDF in den Akten ist genau die Lücke, die später niemand erklärt.
      const { fehlerMelden } = await import("@/lib/fehler");
      await fehlerMelden("Arbeitspapier-PDF", err, { detail: `${titel(typ)} ${nummer}` });
    }
    erzeugt.push(titel(typ));
    ziel ??= v.id;
  }
  await audit(s, "CREATE", "Vertrag", einsatzId, `Arbeitspapiere aus Einsatz: ${erzeugt.length ? erzeugt.join(", ") : "bereits vorhanden"}`, undefined, e.kostenstelleId);
  revalidatePath(`/einsaetze/${einsatzId}`);
  if (typen.length === 1 && ziel) redirect(`/vertraege/${ziel}`);
  redirect(`/einsaetze/${einsatzId}?papiere=${encodeURIComponent(erzeugt.length ? erzeugt.join(", ") : "vorhanden")}`);
}
