"use server";
import { personLoeschen as loeschePerson, dokumentLoeschen as loescheDokument } from "@/lib/loeschen";
import { merkmaleAusForm } from "@/lib/bewertung";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, darfKostenstelle, zielKostenstelle, darfSensibel } from "@/lib/auth";
import { audit, diffOf } from "@/lib/audit";
import { brauchtAblaufdatum, istAusweis } from "@/lib/dokumente";
import { encryptField } from "@/lib/crypto";
import { parseDate, parseNum, str, strOrNull } from "@/lib/format";
import { speichereDokument } from "@/lib/storage";
import { pushAn, PUSH_TEXTE } from "@/lib/push";
import { sendeMail } from "@/lib/mail";
import { firma } from "@/lib/einstellungen";
import { anredeZeile, grussformel } from "@/lib/anrede";
import { mailFuer } from "@/lib/kontakte";
import { appBasis } from "@/lib/werbelink";
import type { PersonStatus, AbwesenheitTyp } from "@/generated/prisma/enums";

async function ladePerson(id: string) {
  const s = await requireSession();
  const p = await db.person.findUnique({ where: { id } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId)) redirect("/personen?fehler=nicht-gefunden");
  return { s, p };
}

function personDaten(fd: FormData, sensibel: boolean) {
  const svnr = str(fd.get("svnr")).replace(/\s/g, "");
  const verf = str(fd.get("verfuegbar"));
  const d: Record<string, unknown> = {
    nachname: str(fd.get("nachname")),
    vorname: str(fd.get("vorname")),
    geburtsdatum: parseDate(fd.get("geburtsdatum")),
    telefon: strOrNull(fd.get("telefon")),
    email: strOrNull(fd.get("email")),
    strasse: strOrNull(fd.get("strasse")),
    plz: strOrNull(fd.get("plz")),
    ort: strOrNull(fd.get("ort")),
    staatsangehoerigkeit: strOrNull(fd.get("staatsangehoerigkeit")),
    standardrolle: strOrNull(fd.get("standardrolle")),
    verfuegbarSofort: verf === "sofort",
    verfuegbarAb: verf === "datum" ? parseDate(fd.get("verfuegbarAb")) : null,
    hinterlegterKundeId: strOrNull(fd.get("hinterlegterKundeId")),
    notizen: strOrNull(fd.get("notizen")),
    aufnahmedatum: parseDate(fd.get("aufnahmedatum")) ?? undefined,
    ausweisArt: strOrNull(fd.get("ausweisArt")),
    ausweisNummer: strOrNull(fd.get("ausweisNummer")),
    ausweisGultigBis: parseDate(fd.get("ausweisGultigBis")),
    quelle: strOrNull(fd.get("quelle")),
    pipelineStufe: strOrNull(fd.get("pipelineStufe")) ?? "NEU",


    absageAm: str(fd.get("pipelineStufe")) === "ABGESAGT" ? (parseDate(fd.get("absageAm")) ?? new Date()) : null,


    geschlecht: strOrNull(fd.get("geschlecht")),
    fuehrerschein: fd.get("fuehrerschein") === "on",
    autoVorhanden: fd.get("autoVorhanden") === "on",
    maxPendelKm: parseNum(fd.get("maxPendelKm")),
    lat: null, lon: null, // nach Adressänderung neu geokodieren
  };
  if (sensibel) {
    const ams = fd.get("amsGefoerdert") === "on";
    d.amsGefoerdert = ams;
    d.amsFoerderungArt = ams ? strOrNull(fd.get("amsFoerderungArt")) : null;
    d.amsFoerderungBetrag = ams ? parseNum(fd.get("amsFoerderungBetrag")) : null;
    d.amsFoerderungVon = ams ? parseDate(fd.get("amsFoerderungVon")) : null;
    d.amsFoerderungBis = ams ? parseDate(fd.get("amsFoerderungBis")) : null;
    d.amsFoerderungNotiz = ams ? strOrNull(fd.get("amsFoerderungNotiz")) : null;
    if (svnr) { d.svnrEnc = encryptField(svnr); d.svnrLast4 = svnr.slice(-4); }
    else if (fd.get("svnrLoeschen")) { d.svnrEnc = null; d.svnrLast4 = null; }
  }
  return d;
}

/** Werdegang-Zeilen aus dem Formular (Zeitraum / Firma / Tätigkeit / Notiz) ersetzen. */
/** Werdegang allein speichern – aus dem eigenen Reiter „Kundenprofil“, ohne den ganzen Personalakt. */
export async function werdegangNurSpeichern(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  await werdegangSpeichern(id, fd);
  await audit(s, "UPDATE", "Person", id, "Werdegang (Kundenprofil) aktualisiert", undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=kundenprofil&ok=werdegang`);
}

/**
 * Kundenprofil an einen Beschäftiger senden.
 *
 * Drei Dinge passieren dabei, die vorher niemand festgehalten hat: Das PDF wird beim Kunden **und**
 * beim Mitarbeiter abgelegt, der Versand kommt mit Uhrzeit in eine Liste, und in drei Tagen erinnert
 * die Software an die Rückmeldung. Ohne das dritte weiß nach zwei Wochen niemand mehr, bei wem man
 * nachfassen wollte.
 */
export async function profilSenden(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const kundeId = str(fd.get("kundeId"));
  const k = await db.kunde.findUnique({ where: { id: kundeId }, include: { ansprechpartner: true } });
  if (!k || !darfKostenstelle(s, k.kostenstelleId)) redirect(`/personen/${id}?tab=kundenprofil&fehler=kunde`);

  const { erzeugeKundenprofil } = await import("@/lib/profil-pdf");
  const erg = await erzeugeKundenprofil(id, s.name);
  if (!erg) redirect(`/personen/${id}?tab=kundenprofil&fehler=pdf`);

  const doc = await speichereDokument({
    kostenstelleId: p.kostenstelleId, dateiname: `Kundenprofil_${p.nachname}_${p.vorname}_${k.firmenname.replace(/[^\w]+/g, "_")}.pdf`,
    mime: "application/pdf", inhalt: erg.buf, kategorie: "Kundenprofil", personId: id, kundeId, hochgeladenVon: s.name,
  });

  const an = strOrNull(fd.get("an")) ?? mailFuer(k, "DISPOSITION");
  let status = "OHNE_MAIL";
  if (an) {
    const ap = k.ansprechpartner.find((x) => x.email && x.email.toLowerCase() === an.toLowerCase()) ?? k.ansprechpartner.find((x) => x.istHaupt) ?? null;
    const f = await firma();
    const text = str(fd.get("text")) || `${anredeZeile(ap, k.anredeDu)}\n\nanbei das Profil von ${p.vorname} ${p.nachname}${p.standardrolle ? ` (${p.standardrolle})` : ""}.\n\nBei Interesse melde dich einfach, dann klären wir Beginn und Konditionen.\n\n${grussformel(ap, k.anredeDu)}\n${s.name}\n${f.name} · ${f.telefon}`;
    const r = await sendeMail({ an, betreff: `Personalvorschlag: ${p.vorname} ${p.nachname}${p.standardrolle ? ` – ${p.standardrolle}` : ""}`, text, anhang: { filename: doc.dateiname, content: erg.buf, contentType: "application/pdf" }, referenzTyp: "Person", referenzId: id });
    status = r.status;
  }

  await db.profilVersand.create({ data: { kostenstelleId: p.kostenstelleId, personId: id, kundeId, an, gesendetVon: s.name, dokumentId: doc.id } });
  await db.aufgabe.create({ data: {
    kostenstelleId: p.kostenstelleId, typ: "BEWERTUNG_OFFEN",
    titel: `Rückmeldung zu ${p.vorname} ${p.nachname} bei ${k.firmenname} nachfragen`,
    faelligAm: new Date(Date.now() + 3 * 86400000), personId: id, kundeId, referenzTyp: "PROFIL", referenzId: doc.id,
  } }).catch(() => undefined);
  await db.aktivitaet.createMany({ data: [
    { typ: "MAIL", text: `Kundenprofil an ${k.firmenname} gesendet${an ? ` (${an})` : " (ohne Mail abgelegt)"}`, nutzerName: s.name, personId: id },
    { typ: "MAIL", text: `Kundenprofil ${p.vorname} ${p.nachname} erhalten`, nutzerName: s.name, kundeId },
  ] });
  await audit(s, "SEND", "Person", id, `Kundenprofil an ${k.firmenname} (${status})`, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=kundenprofil&gesendet=${status}`);
}

/** Rückmeldung des Beschäftigers festhalten – schließt die Wiedervorlage. */
export async function profilRueckmeldung(id: string, versandId: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const v = await db.profilVersand.findFirst({ where: { id: versandId, personId: id } });
  if (!v) redirect(`/personen/${id}?tab=kundenprofil`);
  await db.profilVersand.update({ where: { id: versandId }, data: { rueckmeldungAm: new Date(), rueckmeldung: str(fd.get("rueckmeldung")) || "Rückmeldung erhalten" } });
  await db.aufgabe.updateMany({ where: { referenzTyp: "PROFIL", referenzId: v.dokumentId ?? "", erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  await audit(s, "UPDATE", "Person", id, `Rückmeldung zum Kundenprofil: ${str(fd.get("rueckmeldung"))}`, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=kundenprofil&ok=rueckmeldung`);
}

async function werdegangSpeichern(personId: string, fd: FormData) {
  const z = fd.getAll("be_zeitraum").map(String), f = fd.getAll("be_firma").map(String), t = fd.getAll("be_taetigkeit").map(String), n = fd.getAll("be_notiz").map(String);
  const rows = z.map((_, i) => ({ zeitraum: z[i].trim(), firma: f[i]?.trim() ?? "", taetigkeit: t[i]?.trim() ?? "", notiz: n[i]?.trim() || null })).filter((r) => r.zeitraum || r.firma || r.taetigkeit);
  const alt = await db.berufserfahrung.findMany({ where: { personId }, orderBy: { reihenfolge: "asc" } });
  const gleich = alt.length === rows.length && alt.every((a, i) => a.zeitraum === rows[i].zeitraum && a.firma === rows[i].firma && a.taetigkeit === rows[i].taetigkeit && (a.notiz ?? null) === rows[i].notiz);
  if (gleich) return false;
  await db.berufserfahrung.deleteMany({ where: { personId } });
  if (rows.length) await db.berufserfahrung.createMany({ data: rows.map((r, i) => ({ ...r, personId, reihenfolge: i })) });
  return true;
}

const FELD_LABEL: Record<string, string> = { nachname: "Nachname", vorname: "Vorname", geburtsdatum: "Geburtsdatum", telefon: "Telefon", email: "E-Mail", strasse: "Straße", plz: "PLZ", ort: "Ort", staatsangehoerigkeit: "Staatsangehörigkeit", standardrolle: "Standardrolle", verfuegbarSofort: "Verfügbar sofort", verfuegbarAb: "Verfügbar ab", hinterlegterKundeId: "Hinterlegter Kunde", notizen: "Notizen", aufnahmedatum: "Aufnahmedatum", geschlecht: "Geschlecht", fuehrerschein: "Führerschein B", autoVorhanden: "Auto vorhanden", maxPendelKm: "Max. Pendel-km", amsGefoerdert: "AMS-Förderung", amsFoerderungArt: "AMS-Förderart", amsFoerderungBetrag: "AMS-Förderbetrag", amsFoerderungVon: "AMS-Förderung von", amsFoerderungBis: "AMS-Förderung bis", amsFoerderungNotiz: "AMS-Notiz", svnrLast4: "SVNR", ausweisArt: "Ausweisart", ausweisNummer: "Ausweisnummer", ausweisGultigBis: "Ausweis gültig bis", quelle: "Bewerbungsquelle", pipelineStufe: "Recruiting-Stufe", erstkontaktAm: "Erstkontakt", absagegrund: "Absagegrund", talentpool: "Talent-Pool", wiedervorlageAm: "Wiedervorlage" };
const wert = (v: unknown) => (v == null || v === "" ? "leer" : typeof v === "boolean" ? (v ? "ja" : "nein") : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleDateString("de-AT") : String(v).length > 40 ? String(v).slice(0, 40) + "…" : String(v));

export async function personAnlegen(fd: FormData) {
  const s = await requireSession();
  const kostenstelleId = zielKostenstelle(s, strOrNull(fd.get("kostenstelleId")));
  const data = personDaten(fd, darfSensibel(s));
  if (!data.nachname || !data.vorname) redirect("/personen/neu?fehler=name");
  if (!data.staatsangehoerigkeit) redirect("/personen/neu?fehler=staat");
  const p = await db.person.create({ data: { ...(data as object), kostenstelleId, status: (str(fd.get("status")) || "SUCHT") as PersonStatus } as never });
  await audit(s, "CREATE", "Person", p.id, `${p.vorname} ${p.nachname} angelegt`, undefined, kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "STATUS", text: "Datensatz angelegt", nutzerName: s.name, personId: p.id } });
  await werdegangSpeichern(p.id, fd);
  redirect(`/personen/${p.id}`);
}

export async function personSpeichern(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const data = personDaten(fd, darfSensibel(s));
  const upd = await db.person.update({ where: { id }, data: data as never });
  const diff = diffOf(p as unknown as Record<string, unknown>, data, ["svnrEnc", "lat", "lon"]);
  await audit(s, "UPDATE", "Person", id, `${upd.vorname} ${upd.nachname} bearbeitet`, diff, p.kostenstelleId);
  const werdegangNeu = await werdegangSpeichern(id, fd);
  const aenderungen = Object.entries(diff ?? {}).map(([k, v]) => `${FELD_LABEL[k] ?? k}: ${k === "svnrLast4" ? "geändert" : `${wert(v.vorher)} → ${wert(v.nachher)}`}`);
  if (werdegangNeu) aenderungen.push("Werdegang (Kundenprofil) aktualisiert");
  if (aenderungen.length) await db.aktivitaet.create({ data: { typ: "AENDERUNG", text: `Stammdaten geändert – ${aenderungen.join("; ")}`, nutzerName: s.name, personId: id } });
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}`);
}

export async function personStatus(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const status = str(fd.get("status")) as PersonStatus;
  const grund = strOrNull(fd.get("grund"));
  if (status === "GESPERRT" && !darfSensibel(s)) redirect(`/personen/${id}?fehler=berechtigung`);
  const data = status === "GESPERRT"
    ? { status, gesperrtSeit: new Date(), gesperrtGrund: grund ?? "Kein Grund angegeben", gesperrtVon: s.name }
    : status === "AUSGESCHIEDEN" ? { status, austrittsdatum: new Date() } : { status, gesperrtSeit: null, gesperrtGrund: null, gesperrtVon: null };
  await db.person.update({ where: { id }, data });
  if (status === "GESPERRT") await db.einsatz.updateMany({ where: { personId: id, status: { in: ["GEPLANT", "AKTIV"] } }, data: { status: "ABGEBROCHEN" } });
  await audit(s, "STATUS", "Person", id, `Status ${p.status} → ${status}`, status === "GESPERRT" ? { grund } : undefined, p.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Status geändert: ${p.status} → ${status}${grund ? ` (${grund})` : ""}`, nutzerName: s.name, personId: id } });
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}`);
}

export async function qualifikationAnlegen(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const q = await db.qualifikation.create({ data: { personId: id, typ: str(fd.get("typ")), nummer: strOrNull(fd.get("nummer")), bezeichnung: strOrNull(fd.get("bezeichnung")), ausgestelltAm: parseDate(fd.get("ausgestelltAm")), gultigBis: parseDate(fd.get("gultigBis")), erinnerungTageVorher: parseNum(fd.get("erinnerung")) ?? 60, notiz: strOrNull(fd.get("notiz")) } });
  const file = fd.get("datei");
  if (file instanceof File && file.size > 0) {
    const doc = await speichereDokument({ kostenstelleId: p.kostenstelleId, dateiname: file.name, mime: file.type || "application/octet-stream", inhalt: Buffer.from(await file.arrayBuffer()), kategorie: "Qualifikationsnachweis", personId: id, hochgeladenVon: s.name , fehlerZiel: `/personen/${id}?tab=dokumente` });
    await db.qualifikation.update({ where: { id: q.id }, data: { dokumentId: doc.id } });
  }
  await audit(s, "CREATE", "Qualifikation", q.id, `${q.typ} für ${p.vorname} ${p.nachname}`, undefined, p.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "AENDERUNG", text: `Nachweis hinzugefügt: ${q.typ}${q.nummer ? ` Nr. ${q.nummer}` : ""}${q.gultigBis ? ` (gültig bis ${q.gultigBis.toLocaleDateString("de-AT")})` : ""}`, nutzerName: s.name, personId: id } });
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=qualifikationen`);
}

export async function qualifikationLoeschen(id: string, qId: string) {
  const { s, p } = await ladePerson(id);
  await db.qualifikation.deleteMany({ where: { id: qId, personId: id } }); // nur Nachweise DIESER Person
  await audit(s, "DELETE", "Qualifikation", qId, undefined, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
}

export async function abwesenheitAnlegen(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const von = parseDate(fd.get("von"))!;
  const bis = parseDate(fd.get("bis")) ?? von;
  const { werktageZwischen } = await import("@/lib/wochen");
  // Ohne Eingabe: Werktage (Mo–Fr ohne Feiertage) statt Kalendertage – wie in der Einsatzplanung.
  const tage = parseNum(fd.get("tage")) ?? Math.max(1, werktageZwischen(von, bis));
  await db.abwesenheit.create({ data: { personId: id, typ: str(fd.get("typ")) as AbwesenheitTyp, von, bis, tage, notiz: strOrNull(fd.get("notiz")) } });
  await audit(s, "CREATE", "Abwesenheit", id, `${str(fd.get("typ"))} ${tage} Tage`, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=abwesenheiten`);
}

export async function bewertungAnlegen(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const bewKundeId = strOrNull(fd.get("kundeId"));
  // kundeId aus dem Formular gegen den eigenen Mandanten prüfen – sonst ließe sich ein fremder Kunde referenzieren.
  if (bewKundeId) { const bk = await db.kunde.findUnique({ where: { id: bewKundeId }, select: { kostenstelleId: true } }); if (!bk || !darfKostenstelle(s, bk.kostenstelleId)) redirect(`/personen/${id}?tab=bewertungen&fehler=kunde`); }
  await db.bewertung.create({ data: { personId: id, kundeId: bewKundeId, sterne: Math.min(5, Math.max(1, parseNum(fd.get("sterne")) ?? 3)), kommentar: strOrNull(fd.get("kommentar")), merkmale: merkmaleAusForm(fd), wiedereinsatzEmpfohlen: fd.get("wiedereinsatz") === "on", erfasstVon: s.name } });
  await db.aktivitaet.create({ data: { typ: "BEWERTUNG", text: `Bewertung erfasst: ${Math.min(5, Math.max(1, parseNum(fd.get("sterne")) ?? 3))} Sterne${merkmaleAusForm(fd).length ? ` – ${merkmaleAusForm(fd).join(", ")}` : ""}`, nutzerName: s.name, personId: id } });
  await audit(s, "CREATE", "Bewertung", id, undefined, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=bewertungen`);
}

/**
 * Anruf mit einem Klick festhalten – Telefon-Button am Akt.
 *
 * Ergebnis kommt aus dem gedrückten Knopf (erreicht / nicht erreicht), die Notiz ist optional.
 * Landet als ANRUF-Eintrag in der Historie; die Dispo sieht so ohne Suchen, wann zuletzt
 * telefoniert wurde und ob jemand rangegangen ist.
 */
export async function anrufFesthalten(id: string, fd: FormData) {
  const { s } = await ladePerson(id);
  const erreicht = str(fd.get("ergebnis")) === "erreicht";
  const notiz = str(fd.get("notiz"));
  await db.aktivitaet.create({ data: { typ: "ANRUF", text: `Anruf: ${erreicht ? "erreicht" : "nicht erreicht"}${notiz ? ` – ${notiz}` : ""}`, nutzerName: s.name, personId: id } });
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=historie`);
}

export async function notizAnlegen(id: string, fd: FormData) {
  const { s } = await ladePerson(id);
  const text = str(fd.get("text"));
  if (text) await db.aktivitaet.create({ data: { typ: str(fd.get("typ")) || "NOTIZ", text, nutzerName: s.name, personId: id } });
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=historie`);
}

export async function dokumentHochladen(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const file = fd.get("datei");
  const kategorie = str(fd.get("kategorie")) || "Sonstiges";
  // Der Lohnzettel-Reiter lädt über dieselbe Aktion hoch – zurück geht es dorthin, wo man herkam.
  const zielTab = str(fd.get("zielTab")) === "lohnzettel" ? "lohnzettel" : "dokumente";
  const gultigBis = parseDate(fd.get("gultigBis"));
  // Ein Ausweis ohne Ablaufdatum ist im Akt wertlos: Er läuft irgendwann ab und niemand merkt es.
  if (brauchtAblaufdatum(kategorie) && !gultigBis) redirect(`/personen/${id}?tab=${zielTab}&fehler=ablaufdatum`);
  if (file instanceof File && file.size > 0) {
    const doc = await speichereDokument({ kostenstelleId: p.kostenstelleId, dateiname: file.name, mime: file.type || "application/octet-stream", inhalt: Buffer.from(await file.arrayBuffer()), kategorie, personId: id, sichtbarImPortal: fd.get("portal") === "on", hochgeladenVon: s.name , fehlerZiel: `/personen/${id}?tab=${zielTab}` });
    if (gultigBis) await db.dokument.update({ where: { id: doc.id }, data: { gultigBis } });
    // Der Identitätsnachweis wandert gleich in den Akt-Kopf, damit die Einsatzprüfung ihn findet
    if (istAusweis(kategorie)) await db.person.update({ where: { id }, data: { ausweisDokumentId: doc.id, ausweisArt: kategorie, ausweisGultigBis: gultigBis } });
    await audit(s, "CREATE", "Dokument", doc.id, `${doc.kategorie}: ${doc.dateiname}`, undefined, p.kostenstelleId);
    // Lohnzettel gehören auch in die Historie – dort sucht die Dispo zuerst, nicht im Audit.
    if (doc.kategorie === "Lohnzettel") await db.aktivitaet.create({ data: { typ: "DOKUMENT", text: `Lohnzettel abgelegt: ${doc.dateiname}${doc.sichtbarImPortal ? " (in der App sichtbar)" : ""}`, nutzerName: s.name, personId: id } });
    // Der Mitarbeiter erfährt sofort, dass etwas für ihn da ist – sonst schaut niemand von selbst nach
    if (doc.sichtbarImPortal) await pushAn(id, doc.kategorie === "Lohnzettel"
      ? PUSH_TEXTE.LOHNZETTEL("Dein neuer Lohnzettel liegt in der App.")
      : { anlass: "EINSATZ", titel: "Neues Dokument", text: `${doc.kategorie}: ${doc.dateiname}`, url: "/app/dokumente" }).catch(() => undefined);
  }
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=${zielTab}`);
}

export async function personAnonymisieren(id: string) {
  const { s, p } = await ladePerson(id);
  if (s.rolle !== "SYSTEMADMIN") redirect(`/personen/${id}?fehler=berechtigung`);
  await db.person.update({ where: { id }, data: { status: "AUSGESCHIEDEN", nachname: `Gelöscht #${id.slice(-6)}`, vorname: "", geburtsdatum: null, telefon: null, email: null, strasse: null, plz: null, ort: null, svnrEnc: null, svnrLast4: null, gesperrtGrund: p.gesperrtGrund ? "(anonymisiert)" : null, notizen: null, anonymisiertAm: new Date() } });
  await db.dokument.deleteMany({ where: { personId: id } });
  await db.qualifikation.deleteMany({ where: { personId: id } });
  await audit(s, "DELETE", "Person", id, "Anonymisiert (Löschkonzept)", undefined, p.kostenstelleId);
  redirect(`/personen/${id}`);
}

export async function fotoHochladen(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const file = fd.get("foto");
  if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
    const doc = await speichereDokument({ kostenstelleId: p.kostenstelleId, dateiname: `Foto_${p.nachname}_${p.vorname}${file.name.slice(file.name.lastIndexOf("."))}`, mime: file.type, inhalt: Buffer.from(await file.arrayBuffer()), kategorie: "Foto", personId: id, hochgeladenVon: s.name , fehlerZiel: `/personen/${id}?tab=dokumente` });
    await db.person.update({ where: { id }, data: { fotoDokumentId: doc.id } });
    await audit(s, "UPDATE", "Person", id, "Foto hochgeladen", undefined, p.kostenstelleId);
  }
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}`);
}

/** Bewerber aus dem gemeinsamen Pool in die eigene Kostenstelle übernehmen */
export async function poolUebernehmen(id: string) {
  const s = await requireSession();
  const p = await db.person.findUnique({ where: { id } });
  if (!p || p.status !== "SUCHT") redirect(`/personen/${id}`);
  const ziel = zielKostenstelle(s);
  await db.person.update({ where: { id }, data: { kostenstelleId: ziel } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Aus dem Bewerber-Pool übernommen (Kostenstelle gewechselt)`, nutzerName: s.name, personId: id } });
  await audit(s, "UPDATE", "Person", id, `Aus Pool übernommen von ${p.kostenstelleId} nach ${ziel}`, undefined, ziel);
  redirect(`/personen/${id}`);
}


export async function onboardingSpeichern(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const { ONBOARDING } = await import("@/lib/onboarding");
  const alt = (p.onboarding as Record<string, string> | null) ?? {};
  const neu: Record<string, string> = {};
  for (const o of ONBOARDING) if (fd.get(`ob_${o.key}`) === "on") neu[o.key] = alt[o.key] ?? new Date().toISOString().slice(0, 10);
  await db.person.update({ where: { id }, data: { onboarding: neu, oegkAngemeldet: !!neu.oegk } });
  if (neu.oegk) await db.aufgabe.updateMany({ where: { typ: "OEGK_ANMELDUNG", personId: id, erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  await audit(s, "UPDATE", "Person", id, `Onboarding: ${Object.keys(neu).length}/${ONBOARDING.length} erledigt`, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=onboarding`);
}

/** Zeitkonto-Buchung (Korrektur, Zeitausgleich, Auszahlung, Übertrag) */
export async function zeitbuchungAnlegen(id: string, fd: FormData) {
  const s = await requireSession();
  const p = await db.person.findUnique({ where: { id } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId) || !darfSensibel(s)) redirect(`/personen/${id}?tab=zeitkonto&fehler=berechtigung`);
  const stunden = parseNum(fd.get("stunden"));
  const typ = str(fd.get("typ")) as "KORREKTUR" | "ZEITAUSGLEICH" | "AUSZAHLUNG" | "UEBERTRAG";
  if (stunden == null || !typ) redirect(`/personen/${id}?tab=zeitkonto`);
  // Zeitausgleich und Auszahlung bauen das Konto ab → negativ buchen
  const vorzeichen = typ === "ZEITAUSGLEICH" || typ === "AUSZAHLUNG" ? -Math.abs(stunden) : stunden;
  const b = await db.zeitbuchung.create({ data: { personId: id, datum: parseDate(fd.get("datum")) ?? new Date(), stunden: vorzeichen, typ, notiz: strOrNull(fd.get("notiz")) } });
  await audit(s, "CREATE", "Zeitbuchung", b.id, `${typ} ${vorzeichen} h für ${p.vorname} ${p.nachname}`, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=zeitkonto`);
}

/** Urlaubsantrag / Abwesenheit aus der App entscheiden */
export async function abwesenheitEntscheiden(id: string, abwId: string, status: "GENEHMIGT" | "ABGELEHNT") {
  const s = await requireSession();
  const p = await db.person.findUnique({ where: { id } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId) || !darfSensibel(s)) redirect(`/personen/${id}?tab=abwesenheiten&fehler=berechtigung`);
  // Nur Abwesenheiten DIESER Person – die Kind-ID kommt aus dem Formular und wird gegen die Eltern-ID geprüft.
  const a = await db.abwesenheit.findFirst({ where: { id: abwId, personId: id } });
  if (!a) redirect(`/personen/${id}?tab=abwesenheiten`);
  await db.abwesenheit.update({ where: { id: a.id }, data: { status, entschiedenVon: s.name, entschiedenAm: new Date() } });
  await db.aufgabe.updateMany({ where: { referenzTyp: "Abwesenheit", referenzId: abwId, erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  await db.nachricht.create({ data: { personId: id, vonMitarbeiter: false, nutzerName: s.name, text: `Dein ${a.typ === "URLAUB" ? "Urlaubsantrag" : "Antrag"} ${a.von.toLocaleDateString("de-AT")} – ${a.bis.toLocaleDateString("de-AT")} wurde ${status === "GENEHMIGT" ? "genehmigt. Schönen Urlaub!" : "leider abgelehnt – bitte melde dich bei uns für einen anderen Termin."}` } });
  await pushAn(id, PUSH_TEXTE.URLAUB(`${a.typ === "URLAUB" ? "Urlaub" : "Antrag"} ${a.von.toLocaleDateString("de-AT")} – ${a.bis.toLocaleDateString("de-AT")}: ${status === "GENEHMIGT" ? "genehmigt" : "abgelehnt"}`)).catch(() => undefined);
  await audit(s, "STATUS", "Abwesenheit", abwId, `${a.typ} ${status}`, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`); revalidatePath("/app/abwesenheit");
  redirect(`/personen/${id}?tab=abwesenheiten`);
}

/** App-Upload als geprüft markieren */
export async function dokumentGeprueft(id: string, dokId: string) {
  const s = await requireSession();
  const p = await db.person.findUnique({ where: { id } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId)) redirect(`/personen/${id}?tab=dokumente&fehler=berechtigung`);
  await db.dokument.updateMany({ where: { id: dokId, personId: id }, data: { geprueft: true } }); // nur Dokumente DIESER Person
  await db.aufgabe.updateMany({ where: { typ: "DOKUMENT_PRUEFEN", referenzId: dokId, erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  revalidatePath(`/personen/${id}`); revalidatePath("/app/dokumente");
  redirect(`/personen/${id}?tab=dokumente`);
}


/**
 * Endgültig löschen (nur Systemadmin) – Bewerber/Mitarbeiter samt Einsätzen, Nachweisen, Dokumenten.
 * Mit „erzwingen“ werden auch Rechnungspositionen und abgerechnete Monate mitgelöscht.
 */
export async function personLoeschen(id: string, fd?: FormData) {
  const { s, p } = await ladePerson(id);
  if (s.rolle !== "SYSTEMADMIN") redirect(`/personen/${id}?fehler=berechtigung`);
  const erzwingen = fd?.get("erzwingen") === "ja";
  try { await loeschePerson(id, { erzwingen }); } catch (e) { redirect(`/personen/${id}?fehler=${encodeURIComponent(e instanceof Error ? e.message : "Löschen nicht möglich")}`); }
  await audit(s, "DELETE", "Person", id, `${p.vorname} ${p.nachname} endgültig gelöscht${erzwingen ? " – mit Rechnungsdaten (erzwungen)" : ""}`, undefined, p.kostenstelleId);
  revalidatePath("/personen");
  redirect(`/personen?geloescht=${encodeURIComponent(`${p.vorname} ${p.nachname}`)}`);
}

/** Bewertung löschen (nur Systemadmin) */
export async function bewertungLoeschen(id: string, bewertungId: string, art: "MA" | "KUNDE") {
  const { s, p } = await ladePerson(id);
  if (s.rolle !== "SYSTEMADMIN") redirect(`/personen/${id}?tab=bewertungen&fehler=berechtigung`);
  if (art === "MA") await db.bewertung.deleteMany({ where: { id: bewertungId, personId: id } });
  else await db.kundenBewertung.deleteMany({ where: { id: bewertungId, personId: id } });
  await audit(s, "DELETE", "Bewertung", bewertungId, undefined, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=bewertungen`);
}

/** Dokument löschen (nur Systemadmin) */
export async function dokumentLoeschen(id: string, dokumentId: string) {
  const { s, p } = await ladePerson(id);
  if (s.rolle !== "SYSTEMADMIN") redirect(`/personen/${id}?tab=dokumente&fehler=berechtigung`);
  await loescheDokument(dokumentId);
  await audit(s, "DELETE", "Dokument", dokumentId, undefined, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=dokumente`);
}

/** Sperre setzen – generell oder nur bei einem bestimmten Beschäftiger (Sperrlisten-Katalog statt Freitext). */
export async function sperreAnlegen(id: string, fd: FormData) {
  const { s, p } = await ladePerson(id);
  const grundId = strOrNull(fd.get("grundId"));
  const kundeId = strOrNull(fd.get("kundeId"));
  if (!grundId) redirect(`/personen/${id}?tab=sperren&fehler=grund`);
  // Eine kundenspezifische Sperre darf sich nur auf einen eigenen Kunden beziehen – sonst ließe sich
  // der Firmenname eines fremden Kunden über die Historie zurücklesen.
  if (kundeId) { const sk = await db.kunde.findUnique({ where: { id: kundeId }, select: { kostenstelleId: true } }); if (!sk || !darfKostenstelle(s, sk.kostenstelleId)) redirect(`/personen/${id}?tab=sperren&fehler=grund`); }
  const sp = await db.sperre.create({ data: { personId: id, kundeId, grundId, ab: parseDate(fd.get("ab")) ?? new Date(), bis: parseDate(fd.get("bis")), notiz: strOrNull(fd.get("notiz")), erfasstVon: s.name } });
  const grund = await db.sperrgrund.findUnique({ where: { id: grundId } });
  // Eine generelle Sperre setzt zusätzlich den Personenstatus – kundenspezifische Sperren nicht
  if (!kundeId && grund?.sperrtEinsatz) await db.person.update({ where: { id }, data: { status: "GESPERRT", gesperrtSeit: sp.ab, gesperrtCode: grund.code, gesperrtVon: s.name } });
  const kunde = kundeId ? await db.kunde.findUnique({ where: { id: kundeId }, select: { firmenname: true } }) : null;
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Sperre erfasst: ${grund?.bezeichnung ?? "–"}${kunde ? ` (nur ${kunde.firmenname})` : " (generell)"}`, nutzerName: s.name, personId: id } });
  await audit(s, "STATUS", "Person", id, `Sperre ${grund?.code ?? ""}${kunde ? ` bei ${kunde.firmenname}` : " generell"}`, undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`); redirect(`/personen/${id}?tab=sperren&ok=1`);
}

/** Sperre aufheben. Fällt die letzte generelle Sperre weg, wird der Mitarbeiter wieder freigegeben. */
export async function sperreAufheben(id: string, sperreId: string) {
  const { s, p } = await ladePerson(id);
  const sp = await db.sperre.findUnique({ where: { id: sperreId }, include: { grund: true, kunde: { select: { firmenname: true } } } });
  if (!sp || sp.personId !== id) redirect(`/personen/${id}?tab=sperren`);
  await db.sperre.delete({ where: { id: sperreId } });
  const restGenerell = await db.sperre.count({ where: { personId: id, kundeId: null } });
  if (!restGenerell && p.status === "GESPERRT") await db.person.update({ where: { id }, data: { status: "SUCHT", gesperrtSeit: null, gesperrtCode: null, gesperrtGrund: null, gesperrtVon: null } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Sperre aufgehoben: ${sp.grund?.bezeichnung ?? "–"}${sp.kunde ? ` (${sp.kunde.firmenname})` : ""}`, nutzerName: s.name, personId: id } });
  await audit(s, "STATUS", "Person", id, "Sperre aufgehoben", undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`); redirect(`/personen/${id}?tab=sperren&ok=1`);
}

/**
 * Einladung zur Mitarbeiter-App per E-Mail: Link, Erklärung in drei Sätzen und der Hinweis zum
 * Installieren am Handy. Der Anmeldecode selbst kommt erst, wenn der Mitarbeiter ihn anfordert –
 * so ist die Einladung beliebig oft wiederholbar und nichts läuft ab.
 */
export async function appEinladungSenden(id: string) {
  const { s, p } = await ladePerson(id);
  if (!darfSensibel(s)) redirect(`/personen/${id}?fehler=berechtigung`);
  if (!p.email) redirect(`/personen/${id}?tab=profil&fehler=keinemail`);
  const f = await firma();
  const url = appBasis();
  const text = `Hallo ${p.vorname},

ab sofort hast du alles rund um deinen Job bei ${f.name ?? "Fox & People"} am Handy:

${url}

Dort trägst du deine Stunden ein, siehst deine Einsätze und Lohnzettel, beantragst Urlaub und empfiehlst uns weiter (${"Freunde werben Freunde"}).

So geht's – dauert eine Minute:
1. Den Link oben am Handy öffnen.
2. Deine E-Mail-Adresse (${p.email}) eintippen und "Code anfordern".
3. Den 6-stelligen Code aus der E-Mail eingeben – fertig, kein Passwort nötig.
4. iPhone: unten auf das Teilen-Symbol, dann "Zum Home-Bildschirm". Android: Menü, dann "App installieren". So hast du das Fuchs-Symbol wie eine normale App am Bildschirm.

Wichtig: Eine Krankmeldung geht weiterhin ausschliesslich telefonisch unter ${f.telefon ?? "+43 676 4574096"} - nicht über die App.

Bei Fragen einfach anrufen.

${f.name ?? "Fox & People"}
${f.telefon ?? ""}`;
  const r = await sendeMail({ an: p.email, betreff: "Deine Fox & People App – so meldest du dich an", text, referenzTyp: "Person", referenzId: id });
  await db.aktivitaet.create({ data: { typ: "EMAIL", text: `Einladung zur Mitarbeiter-App an ${p.email} gesendet`, nutzerName: s.name, personId: id } });
  await audit(s, "SEND", "Person", id, "App-Einladung gesendet", undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`);
  redirect(`/personen/${id}?tab=profil&mail=${r.status}`);
}

/** App-Zugang sperren oder wieder freigeben (Austritt, verlorenes Handy) – wirkt sofort, auch bei laufender Session. */
export async function appZugangSchalten(id: string, sperren: boolean) {
  const { s, p } = await ladePerson(id);
  if (!darfSensibel(s)) redirect(`/personen/${id}?fehler=berechtigung`);
  await db.person.update({ where: { id }, data: { appGesperrtAm: sperren ? new Date() : null } });
  if (sperren) { await db.appLogin.deleteMany({ where: { personId: id } }); await db.pushAbo.deleteMany({ where: { personId: id } }); }
  await db.aktivitaet.create({ data: { typ: "STATUS", text: sperren ? "App-Zugang gesperrt (alle Geräte abgemeldet)" : "App-Zugang wieder freigegeben", nutzerName: s.name, personId: id } });
  await audit(s, "STATUS", "Person", id, sperren ? "App-Zugang gesperrt" : "App-Zugang freigegeben", undefined, p.kostenstelleId);
  revalidatePath(`/personen/${id}`); redirect(`/personen/${id}?tab=profil&ok=1`);
}
