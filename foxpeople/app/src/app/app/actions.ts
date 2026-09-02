"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { merkmaleAusForm } from "@/lib/bewertung";
import { DATENSCHUTZ_VERSION } from "@/lib/datenschutz";
import { berechneWoche, wochentage, type Tageseintrag } from "@/lib/zeitaufzeichnung";
import { speichereDokument, DateiAbgelehnt } from "@/lib/storage";
import { einstellung } from "@/lib/einstellungen";
import { str, strOrNull, parseNum, parseDate } from "@/lib/format";
import { isoWoche, montagDerKw } from "@/lib/wochen";
import type { Prisma } from "@/generated/prisma/client";

const MAX_UPLOAD = 15 * 1024 * 1024;

async function person() {
  const s = await requireApp();
  const p = await db.person.findUnique({ where: { id: s.personId } });
  if (!p || p.status === "AUSGESCHIEDEN") redirect("/app/logout");
  await db.person.update({ where: { id: p.id }, data: { appZuletztAktiv: new Date() } });
  return p;
}
const name = (p: { vorname: string; nachname: string }) => `${p.vorname} ${p.nachname}`;

async function aufgabeFuerDispo(p: { id: string; kostenstelleId: string }, typ: "STUNDENNACHWEIS_PRUEFEN" | "KRANKMELDUNG" | "URLAUBSANTRAG" | "DOKUMENT_PRUEFEN", titel: string, referenzTyp: string, referenzId: string, faelligAm = new Date()) {
  await db.aufgabe.upsert({ where: { typ_referenzTyp_referenzId: { typ, referenzTyp, referenzId } }, update: { erledigt: false, titel, faelligAm }, create: { kostenstelleId: p.kostenstelleId, typ, titel, faelligAm, personId: p.id, referenzTyp, referenzId } });
}

/** Stundennachweis der Woche einreichen (Stunden je Tag, optional Foto des bestätigten Zettels) */
export async function stundenEinreichen(fd: FormData) {
  const p = await person();
  const jahr = parseNum(fd.get("jahr"))!; const kw = parseNum(fd.get("kw"))!;
  // Serverseitige Freischaltungsprüfung: Die Oberfläche blendet die Erfassung zwar aus, aber eine
  // Server-Action ist direkt aufrufbar. Ohne freigeschalteten Einsatz wird nur akzeptiert, wer eine
  // bereits vorhandene Woche korrigiert (z. B. nach Rücknahme der Freischaltung).
  {
    const { stundenerfassungAktiv } = await import("@/lib/app-stunden");
    const bestehend = await db.stundennachweis.findUnique({ where: { personId_jahr_kw: { personId: p.id, jahr, kw } }, select: { id: true } });
    if (!(await stundenerfassungAktiv(p.id)) && !bestehend) redirect("/app?hinweis=keinestunden");
  }
  // Arbeitszeitaufzeichnung § 26 AZG: Beginn, Ende und Pause je Tag; ohne Zeiten zählt die eingetragene Stundenzahl
  const eintraege: Tageseintrag[] = ["mo", "di", "mi", "do", "fr", "sa", "so"].map((t, i) => ({
    beginn: strOrNull(fd.get(`${t}_beginn`)),
    ende: strOrNull(fd.get(`${t}_ende`)),
    pauseMin: parseNum(fd.get(`${t}_pause`)),
    gesamt: Math.max(0, Math.min(24, parseNum(fd.get(t)) ?? 0)) || null,
    fehlzeit: strOrNull(fd.get(`${t}_fehlzeit`)),
    ort: strOrNull(fd.get(`${t}_ort`)),
    anmerkung: null,
  }));
  const w = berechneWoche(eintraege, { daten: wochentage(jahr, kw).map((t) => t.datum), wochennormal: p.wochenstunden ?? 38.5 });
  const tage = w.tage.map((t) => t.gesamt);
  const summe = w.summe;
  const vorhanden = await db.stundennachweis.findUnique({ where: { personId_jahr_kw: { personId: p.id, jahr, kw } } });
  if (vorhanden?.status === "BESTAETIGT") redirect(`/app/stunden?jahr=${jahr}&kw=${kw}&fehler=bestaetigt`);
  let fotoDokumentId = vorhanden?.fotoDokumentId ?? null;
  const file = fd.get("foto");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD) redirect(`/app/stunden?jahr=${jahr}&kw=${kw}&fehler=gross`);
    try {
    const d = await speichereDokument({ kostenstelleId: p.kostenstelleId, dateiname: `Stundennachweis_KW${kw}_${jahr}_${p.nachname}.${(file.name.split(".").pop() ?? "jpg").toLowerCase()}`, mime: file.type || "image/jpeg", inhalt: Buffer.from(await file.arrayBuffer()), kategorie: "Stundennachweis", personId: p.id, sichtbarImPortal: true, hochgeladenVon: name(p), geprueft: false, quelle: "APP" });
    fotoDokumentId = d.id;
    } catch (e) { if (e instanceof DateiAbgelehnt) redirect(`/app/stunden?jahr=${jahr}&kw=${kw}&fehler=dateityp`); throw e; }
  }
  // Einsatz zur Kalenderwoche: Zeitraum muss die Woche überlappen – sonst landen die Stunden nach
  // einem Kundenwechsel beim falschen Kunden.
  const wmontag = (await import("@/lib/wochen")).montagDerKw(jahr, kw);
  const wsonntag = new Date(wmontag.getTime() + 6 * 86400000 + 86399000);
  const einsatz = await db.einsatz.findFirst({ where: { personId: p.id, status: { in: ["AKTIV", "GEPLANT"] }, von: { lte: wsonntag }, OR: [{ bis: null }, { bis: { gte: wmontag } }] }, orderBy: { von: "desc" } });
  const data = { tage: tage as unknown as Prisma.InputJsonValue, eintraege: eintraege as unknown as Prisma.InputJsonValue, summe, summeNormal: w.normal, summeUe50: w.ue50, summeUe100: w.ue100, quelle: "APP", notiz: strOrNull(fd.get("notiz")), fotoDokumentId, status: "EINGEREICHT" as const, rueckmeldung: null, eingereichtAm: new Date(), einsatzId: einsatz?.id ?? null };
  const n = await db.stundennachweis.upsert({ where: { personId_jahr_kw: { personId: p.id, jahr, kw } }, update: data, create: { personId: p.id, jahr, kw, ...data } });
  await aufgabeFuerDispo(p, "STUNDENNACHWEIS_PRUEFEN", `Stundennachweis KW ${kw}/${jahr} von ${name(p)} prüfen (${summe} h${w.ue50 || w.ue100 ? `, davon ${w.ue50} h Ü50 / ${w.ue100} h Ü100` : ""}${fotoDokumentId ? ", mit Foto" : ", ohne Foto"}${w.warnungen.length ? ` · ${w.warnungen.length} Arbeitszeit-Hinweis(e)` : ""})`, "Stundennachweis", n.id);
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Stundennachweis KW ${kw}/${jahr} über die App eingereicht: ${summe} h`, nutzerName: name(p), personId: p.id } });
  revalidatePath("/app/stunden");
  redirect(`/app/stunden?jahr=${jahr}&kw=${kw}&ok=1`);
}

/** Urlaubsantrag aus der App. Krankmeldungen nimmt die App nicht entgegen – sie laufen ausschließlich telefonisch. */
export async function abwesenheitMelden(fd: FormData) {
  const p = await person();
  // Über die App wird ausschließlich Urlaub beantragt – die Krankmeldung läuft nur telefonisch
  // (Entscheidung Matthias, 30.08.2026). Andere Typen werden hier nicht angenommen.
  if (str(fd.get("typ")) !== "URLAUB") redirect("/app/abwesenheit");
  const typ = "URLAUB" as const;
  const von = parseDate(fd.get("von")) ?? new Date();
  const bis = parseDate(fd.get("bis")) ?? von;
  if (bis < von) redirect("/app/abwesenheit?fehler=datum");
  // Werktage statt Kalendertage: Eine Urlaubswoche Mo–So kostet 5 Tage vom Anspruch, nicht 7.
  const { werktageZwischen } = await import("@/lib/wochen");
  const tage = werktageZwischen(von, bis);
  if (!tage) redirect("/app/abwesenheit?fehler=datum");
  // Urlaub muss genehmigt werden – der Antrag geht als Wiedervorlage an die Dispo
  const a = await db.abwesenheit.create({ data: { personId: p.id, typ, von, bis, tage, notiz: strOrNull(fd.get("notiz")), status: "BEANTRAGT", quelle: "APP" } });
  await aufgabeFuerDispo(p, "URLAUBSANTRAG", `Urlaubsantrag ${name(p)}: ${von.toLocaleDateString("de-AT")} – ${bis.toLocaleDateString("de-AT")} (${tage} Tage) genehmigen`, "Abwesenheit", a.id);
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Urlaubsantrag über die App: ${von.toLocaleDateString("de-AT")} – ${bis.toLocaleDateString("de-AT")}`, nutzerName: name(p), personId: p.id } });
  revalidatePath("/app/abwesenheit");
  redirect(`/app/abwesenheit?ok=${typ}`);
}

/** Chat-Nachricht an die Disposition */
export async function nachrichtSenden(fd: FormData) {
  const p = await person();
  const text = str(fd.get("text"));
  if (!text) redirect("/app/chat");
  await db.nachricht.create({ data: { personId: p.id, vonMitarbeiter: true, text: text.slice(0, 2000) } });
  revalidatePath("/app/chat"); revalidatePath("/nachrichten");
  redirect("/app/chat");
}

/** Profil: Kontaktdaten aktualisieren + bestätigen */
export async function profilSpeichern(fd: FormData) {
  const p = await person();
  const daten = { telefon: strOrNull(fd.get("telefon")), email: strOrNull(fd.get("email")), strasse: strOrNull(fd.get("strasse")), plz: strOrNull(fd.get("plz")), ort: strOrNull(fd.get("ort")), notfallkontakt: strOrNull(fd.get("notfallkontakt")), fuehrerschein: fd.get("fuehrerschein") === "on", maxPendelKm: parseNum(fd.get("maxPendelKm")), appSprache: String(fd.get("appSprache") ?? "de") === "en" ? "en" : "de", profilBestaetigtAm: new Date() };
  const geaendert = (["telefon", "email", "strasse", "plz", "ort"] as const).filter((k) => (p[k] ?? "") !== (daten[k] ?? ""));
  await db.person.update({ where: { id: p.id }, data: daten });
  if (geaendert.length) await db.aktivitaet.create({ data: { typ: "STATUS", text: `Kontaktdaten über die App geändert: ${geaendert.join(", ")}`, nutzerName: name(p), personId: p.id } });
  revalidatePath("/app/profil");
  redirect("/app/profil?ok=1");
}

/** Dokument hochladen (Ausweis, e-card, Führerschein, Nachweise …) – landet ungeprüft bei der Dispo */
export async function dokumentHochladenApp(fd: FormData) {
  const p = await person();
  const file = fd.get("datei"); const kategorie = str(fd.get("kategorie")) || "Sonstiges";
  if (!(file instanceof File) || !file.size) redirect("/app/profil?fehler=datei");
  if (file.size > MAX_UPLOAD) redirect("/app/profil?fehler=gross");
  const ablauf = parseDate(fd.get("gultigBis"));
  const d = await speichereDokument({ kostenstelleId: p.kostenstelleId, dateiname: `${kategorie.replace(/[^\wäöüÄÖÜß-]+/g, "_")}_${p.nachname}.${(file.name.split(".").pop() ?? "pdf").toLowerCase()}`, mime: file.type || "application/octet-stream", inhalt: Buffer.from(await file.arrayBuffer()), kategorie, personId: p.id, sichtbarImPortal: true, hochgeladenVon: name(p), geprueft: false, quelle: "APP", gultigBis: ablauf, fehlerZiel: "/app/profil" });
  if (kategorie === "Foto") await db.person.update({ where: { id: p.id }, data: { fotoDokumentId: d.id } });
  // Nachweise mit Ablaufdatum gleich als Qualifikation vormerken (Dispo prüft)
  if (["Führerschein", "Staplerschein", "Aufenthaltstitel / Arbeitserlaubnis", "Kranschein", "Sicherheitsunterweisung", "Gesundheitszeugnis"].includes(kategorie)) await db.qualifikation.create({ data: { personId: p.id, typ: kategorie, gultigBis: ablauf, notiz: `Über die App hochgeladen – bitte prüfen (Dokument ${d.dateiname})` } });
  await aufgabeFuerDispo(p, "DOKUMENT_PRUEFEN", `Dokument „${kategorie}“ von ${name(p)} prüfen`, "Dokument", d.id);
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Dokument über die App hochgeladen: ${kategorie}`, nutzerName: name(p), personId: p.id } });
  revalidatePath("/app/profil"); revalidatePath("/app/dokumente");
  redirect("/app/profil?ok=upload");
}

/** Freunde werben Freunde – Empfehlung abgeben */
export async function empfehlungAbgeben(fd: FormData) {
  const p = await person();
  const cfg = await einstellung<{ aktiv: boolean }>("empfehlung", { aktiv: true });
  if (!cfg.aktiv) redirect("/app/empfehlen");
  const n = str(fd.get("name")); const telefon = strOrNull(fd.get("telefon")); const email = strOrNull(fd.get("email"));
  if (!n || (!telefon && !email)) redirect("/app/empfehlen?fehler=pflicht");
  if (fd.get("einverstanden") !== "on") redirect("/app/empfehlen?fehler=einverstanden");
  const e = await db.empfehlung.create({ data: { werberId: p.id, name: n, telefon, email, notiz: strOrNull(fd.get("notiz")) } });
  await db.aufgabe.create({ data: { kostenstelleId: p.kostenstelleId, typ: "MANUELL", titel: `Empfehlung von ${name(p)}: ${n} (${telefon ?? email}) kontaktieren – Freunde werben Freunde`, faelligAm: new Date(Date.now() + 2 * 86400000), personId: p.id, referenzTyp: "Empfehlung", referenzId: e.id } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Empfehlung über die App: ${n}`, nutzerName: name(p), personId: p.id } });
  revalidatePath("/app/empfehlen");
  redirect("/app/empfehlen?ok=1");
}

/** Wochenstatus-Hilfe für die Stunden-Seite */
export async function wocheInfo(jahr?: number, kw?: number) {
  const heute = new Date();
  const w = jahr && kw ? { jahr, kw } : isoWoche(heute);
  const montag = montagDerKw(w.jahr, w.kw);
  return { ...w, montag, tage: Array.from({ length: 7 }, (_, i) => new Date(montag.getFullYear(), montag.getMonth(), montag.getDate() + i)) };
}

/** Der Mitarbeiter bewertet seinen Beschäftiger (App-Variante der Kundenbewertung). */
export async function beschaeftigerBewerten(fd: FormData) {
  const p = await person();
  const kundeId = String(fd.get("kundeId") ?? "");
  if (!kundeId) redirect("/app/bewerten");
  const einsatz = await db.einsatz.findFirst({ where: { personId: p.id, kundeId }, orderBy: { von: "desc" } });
  await db.kundenBewertung.create({ data: {
    personId: p.id, kundeId, einsatzId: einsatz?.id ?? null,
    sterne: Math.min(5, Math.max(1, parseNum(fd.get("sterne")) ?? 4)),
    kommentar: strOrNull(fd.get("kommentar")), merkmale: merkmaleAusForm(fd),
    wiederArbeiten: fd.get("wiederArbeiten") === "on", quelle: "APP",
  } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Beschäftiger über die App bewertet`, nutzerName: name(p), personId: p.id } });
  revalidatePath("/app/bewerten");
  redirect("/app/bewerten?ok=1");
}

/** Datenschutzinformation bestätigen (Nachweis nach Art. 5 Abs. 2 DSGVO) – Fotofreigabe ist freiwillig. */
export async function datenschutzBestaetigen(fd: FormData) {
  const p = await person();
  if (fd.get("ok") !== "on") redirect("/app/profil?fehler=datenschutz");
  await db.person.update({ where: { id: p.id }, data: { datenschutzAkzeptiertAm: new Date(), datenschutzVersion: DATENSCHUTZ_VERSION } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Datenschutzinformation (Fassung ${DATENSCHUTZ_VERSION}) in der App bestätigt${fd.get("foto") === "on" ? " · Fotofreigabe erteilt" : " · keine Fotofreigabe"}`, nutzerName: name(p), personId: p.id } });
  revalidatePath("/app/profil");
  redirect("/app/profil?ok=1");
}
