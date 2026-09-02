"use server";
import { kundeLoeschen as loescheKunde, dokumentLoeschen as loescheDokument } from "@/lib/loeschen";
import { merkmaleAusForm } from "@/lib/bewertung";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, darfKostenstelle, zielKostenstelle } from "@/lib/auth";
import { audit, diffOf } from "@/lib/audit";
import { anredeZeile } from "@/lib/anrede";
import { parseDate, parseNum, str, strOrNull } from "@/lib/format";
import { speichereDokument } from "@/lib/storage";
import { uebernahmeHonorar, volleMonate } from "@/lib/agb";

async function ladeKunde(id: string) {
  const s = await requireSession();
  const k = await db.kunde.findUnique({ where: { id } });
  if (!k || !darfKostenstelle(s, k.kostenstelleId)) redirect("/kunden?fehler=nicht-gefunden");
  return { s, k };
}

function kundeDaten(fd: FormData) {
  return {
    firmenname: str(fd.get("firmenname")),
    kurzname: strOrNull(fd.get("kurzname")),
    strasse: strOrNull(fd.get("strasse")), plz: strOrNull(fd.get("plz")), ort: strOrNull(fd.get("ort")), land: str(fd.get("land")) || "Österreich", bundesland: strOrNull(fd.get("bundesland")),
    uid: strOrNull(fd.get("uid")), telefon: strOrNull(fd.get("telefon")), email: strOrNull(fd.get("email")), rechnungsemail: strOrNull(fd.get("rechnungsemail")), rechnungCcEmail: strOrNull(fd.get("rechnungCcEmail")), website: strOrNull(fd.get("website")),
    zahlungszielTage: parseNum(fd.get("zahlungszielTage")) ?? 0, skontoProzent: parseNum(fd.get("skontoProzent")),
    anredeDu: str(fd.get("anredeDu")) === "DU", stundennachweisVomKunden: str(fd.get("stundennachweisVomKunden")) === "KUNDE",
    notizen: strOrNull(fd.get("notizen")),
    rahmenvertragBeginn: parseDate(fd.get("rahmenvertragBeginn")), rahmenvertragEnde: parseDate(fd.get("rahmenvertragEnde")), kuendigungsfrist: strOrNull(fd.get("kuendigungsfrist")), erinnerungTageVorher: parseNum(fd.get("erinnerungTageVorher")) ?? 60,
    status: (str(fd.get("status")) || "AKTIV") as "AKTIV" | "INAKTIV",
    arbeitszeitmodell: strOrNull(fd.get("arbeitszeitmodell")),
    kollektivvertrag: strOrNull(fd.get("kollektivvertrag")),
    referenzKvId: strOrNull(fd.get("referenzKvId")),
    referenzKvAngestellteId: strOrNull(fd.get("referenzKvAngestellteId")),
    kvGueltigBis: parseDate(fd.get("kvGueltigBis")),
    rahmenvertragPflicht: str(fd.get("rahmenvertragPflicht")) !== "0",
    agbVersion: strOrNull(fd.get("agbVersion")),
    agbAkzeptiertAm: parseDate(fd.get("agbAkzeptiertAm")),
    agbAkzeptiertVon: strOrNull(fd.get("agbAkzeptiertVon")),
    uebernahmeProzent: (parseNum(fd.get("uebernahmeProzent")) ?? 30) / 100,
    uebernahmeMindest: parseNum(fd.get("uebernahmeMindest")) ?? 2500,
    vermittlungProzent: (parseNum(fd.get("vermittlungProzent")) ?? 30) / 100,
    uidGeprueftAm: parseDate(fd.get("uidGeprueftAm")),
    uidGeprueftStufe: strOrNull(fd.get("uidGeprueftStufe")),
    uidGueltig: str(fd.get("uidGueltig")) === "" ? null : str(fd.get("uidGueltig")) === "1",
    anforderungen: strOrNull(fd.get("anforderungen")),
    erforderlicheQualifikationen: str(fd.get("erforderlicheQualifikationen")).split(",").map((x) => x.trim()).filter(Boolean),
    lat: null as number | null, lon: null as number | null, // wird nach Adressänderung neu geokodiert
  };
}

export async function kundeAnlegen(fd: FormData) {
  const s = await requireSession();
  const kostenstelleId = zielKostenstelle(s, strOrNull(fd.get("kostenstelleId")));
  const data = kundeDaten(fd);
  if (!data.firmenname) redirect("/kunden/neu?fehler=name");
  if (!data.arbeitszeitmodell || !data.kollektivvertrag || !data.kvGueltigBis) redirect("/kunden/neu?fehler=pflicht");
  if (!data.uid || !data.strasse || !data.plz || !data.ort || !data.rechnungsemail) redirect("/kunden/neu?fehler=stammdaten");
  const ap = str(fd.get("ap_name"));
  if (!ap || !str(fd.get("ap_funktion")) || !str(fd.get("ap_telefon")) || !str(fd.get("ap_email"))) redirect("/kunden/neu?fehler=ansprechpartner");
  // Kundennummer fortlaufend ab 200001 (erscheint auf Rechnungen)
  const letzte = await db.kunde.findFirst({ where: { kundennummer: { not: null } }, orderBy: { kundennummer: "desc" }, select: { kundennummer: true } });
  const kundennummer = String(Math.max(200000, Number(letzte?.kundennummer ?? 0)) + 1);
  const k = await db.kunde.create({ data: { ...data, kostenstelleId, kundennummer } });
  if (ap) await db.ansprechpartner.create({ data: { kundeId: k.id, name: ap, funktion: strOrNull(fd.get("ap_funktion")), telefon: strOrNull(fd.get("ap_telefon")), email: strOrNull(fd.get("ap_email")), istHaupt: true } });
  await audit(s, "CREATE", "Kunde", k.id, `${k.firmenname} angelegt`, undefined, kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "STATUS", text: "Kunde angelegt", nutzerName: s.name, kundeId: k.id } });
  redirect(`/kunden/${k.id}`);
}

export async function kundeSpeichern(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const data = kundeDaten(fd);
  if (!data.arbeitszeitmodell || !data.kollektivvertrag || !data.kvGueltigBis) redirect(`/kunden/${id}/bearbeiten?fehler=pflicht`);
  if (!data.uid || !data.strasse || !data.plz || !data.ort || !data.rechnungsemail) redirect(`/kunden/${id}/bearbeiten?fehler=stammdaten`);
  await db.kunde.update({ where: { id }, data });
  await audit(s, "UPDATE", "Kunde", id, `${data.firmenname} bearbeitet`, diffOf(k as unknown as Record<string, unknown>, data), k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}`);
}

export async function ansprechpartnerAnlegen(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const haupt = fd.get("istHaupt") === "on";
  if (haupt) await db.ansprechpartner.updateMany({ where: { kundeId: id }, data: { istHaupt: false } });
  if (!str(fd.get("name")) || !str(fd.get("funktion")) || !str(fd.get("telefon")) || !str(fd.get("email"))) redirect(`/kunden/${id}?tab=ansprechpartner&fehler=ap`);
  const du = str(fd.get("anredeDu"));
  await db.ansprechpartner.create({ data: { kundeId: id, name: str(fd.get("name")), funktion: strOrNull(fd.get("funktion")), telefon: strOrNull(fd.get("telefon")), email: strOrNull(fd.get("email")), istHaupt: haupt, rollen: fd.getAll("rollen").map(String), anrede: strOrNull(fd.get("anrede")), anredeDu: du === "" ? null : du === "DU" } });
  await audit(s, "CREATE", "Ansprechpartner", id, str(fd.get("name")), undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=kontakte`);
}
/** Anrede eines bestehenden Ansprechpartners ändern – ohne den ganzen Datensatz neu anzulegen. */
export async function ansprechpartnerAnrede(id: string, apId: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const du = str(fd.get("anredeDu"));
  await db.ansprechpartner.updateMany({ where: { id: apId, kundeId: id }, data: { anrede: strOrNull(fd.get("anrede")), anredeDu: du === "" ? null : du === "DU" } });
  await audit(s, "UPDATE", "Ansprechpartner", apId, `Anrede: ${du === "" ? "wie Kunde" : du === "DU" ? "Du" : "Sie"}`, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=kontakte`);
}

export async function ansprechpartnerLoeschen(id: string, apId: string) {
  const { k, s } = await ladeKunde(id);
  await db.ansprechpartner.deleteMany({ where: { id: apId, kundeId: id } }); // nur Ansprechpartner DIESES Kunden
  await audit(s, "DELETE", "Ansprechpartner", apId, undefined, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
}

export async function konditionAnlegen(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  await db.kondition.create({ data: { kundeId: id, rolle: str(fd.get("rolle")), stundensatz: parseNum(fd.get("stundensatz")) ?? 0, ueberstundenZuschlag: (parseNum(fd.get("ueberstunden")) ?? 35) / 100, nachtZuschlag: (parseNum(fd.get("nacht")) ?? 25) / 100, wochenendZuschlag: (parseNum(fd.get("wochenende")) ?? 70) / 100, gultigVon: parseDate(fd.get("gultigVon")), gultigBis: parseDate(fd.get("gultigBis")) } });
  await audit(s, "CREATE", "Kondition", id, `${str(fd.get("rolle"))} ${str(fd.get("stundensatz"))} €/Std`, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=konditionen`);
}
export async function konditionLoeschen(id: string, kId: string) {
  const { k, s } = await ladeKunde(id);
  await db.kondition.deleteMany({ where: { id: kId, kundeId: id } }); // nur Konditionen DIESES Kunden
  await audit(s, "DELETE", "Kondition", kId, undefined, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
}

export async function kundeNotiz(id: string, fd: FormData) {
  const { s } = await ladeKunde(id);
  const text = str(fd.get("text"));
  if (text) await db.aktivitaet.create({ data: { typ: str(fd.get("typ")) || "NOTIZ", text, nutzerName: s.name, kundeId: id } });
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=historie`);
}

export async function kundeDokument(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const file = fd.get("datei");
  if (file instanceof File && file.size > 0) {
    const doc = await speichereDokument({ kostenstelleId: k.kostenstelleId, dateiname: file.name, mime: file.type || "application/octet-stream", inhalt: Buffer.from(await file.arrayBuffer()), kategorie: str(fd.get("kategorie")) || "Sonstiges", kundeId: id, hochgeladenVon: s.name , fehlerZiel: `/kunden/${id}` });
    await audit(s, "CREATE", "Dokument", doc.id, `${doc.kategorie}: ${doc.dateiname}`, undefined, k.kostenstelleId);
  }
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=dokumente`);
}


export async function kundenBewertungAnlegen(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const personId = str(fd.get("personId"));
  if (!personId) redirect(`/kunden/${id}?tab=bewertungen`);
  // personId kommt aus dem Formular – prüfen, dass die Person zum eigenen Mandanten gehört, sonst
  // ließe sich der Name einer fremden Person an den eigenen Kunden heften (Cross-Tenant-Leck).
  const bp = await db.person.findUnique({ where: { id: personId }, select: { kostenstelleId: true } });
  if (!bp || !darfKostenstelle(s, bp.kostenstelleId)) redirect(`/kunden/${id}?tab=bewertungen&fehler=berechtigung`);
  await db.kundenBewertung.create({ data: { kundeId: id, personId, einsatzId: strOrNull(fd.get("einsatzId")), sterne: Math.min(5, Math.max(1, parseNum(fd.get("sterne")) ?? 3)), kommentar: strOrNull(fd.get("kommentar")), merkmale: merkmaleAusForm(fd), wiederArbeiten: fd.get("wieder") === "on", quelle: "INTERN" } });
  await audit(s, "CREATE", "KundenBewertung", id, "Mitarbeiter-Bewertung des Kunden erfasst", undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=bewertungen`);
}

/** Kunde per Link um Bewertung eines Mitarbeiters bitten */
export async function bewertungAnfragen(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const personId = str(fd.get("personId"));
  const an = str(fd.get("an"));
  if (!personId || !an) redirect(`/kunden/${id}?tab=bewertungen&fehler=pflicht`);
  const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
  // Name und Anfrage gehen per E-Mail an eine frei wählbare Adresse – nur eigene Mitarbeiter zulassen
  if (!darfKostenstelle(s, p.kostenstelleId)) redirect(`/kunden/${id}?tab=bewertungen&fehler=berechtigung`);
  const { randomToken, sha256 } = await import("@/lib/crypto");
  const { sendeMail } = await import("@/lib/mail");
  const { firma } = await import("@/lib/einstellungen");
  const token = randomToken(24);
  await db.bewertungsAnfrage.create({ data: { kundeId: id, personId, einsatzId: strOrNull(fd.get("einsatzId")), tokenHash: sha256(token), an, gultigBis: new Date(Date.now() + 14 * 86400000) } });
  const f = await firma();
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/bewerten/${token}`;
  const r = await sendeMail({ an, betreff: `Kurze Rückmeldung zu ${p.vorname} ${p.nachname} – ${f.name}`, text: `Sehr geehrte Damen und Herren,\n\nwie zufrieden sind Sie mit ${p.vorname} ${p.nachname}? Zwei Klicks genügen – der Link ist 14 Tage gültig:\n\n${url}\n\nVielen Dank!\n${s.name}\n${f.name} · ${f.telefon}`, referenzTyp: "BewertungsAnfrage", referenzId: id });
  await audit(s, "SEND", "BewertungsAnfrage", id, `an ${an} für ${p.vorname} ${p.nachname} (${r.status})`, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=bewertungen&gesendet=${r.status}`);
}


/**
 * Kunde endgültig löschen (nur Systemadmin). Ohne „erzwingen“ nicht möglich, wenn Rechnungen
 * existieren; mit „erzwingen“ werden die Rechnungen des Kunden mitgelöscht.
 */
export async function kundeLoeschen(id: string, fd?: FormData) {
  const { s, k } = await ladeKunde(id);
  if (s.rolle !== "SYSTEMADMIN") redirect(`/kunden/${id}?fehler=berechtigung`);
  const erzwingen = fd?.get("erzwingen") === "ja";
  try { await loescheKunde(id, { erzwingen }); } catch (e) { redirect(`/kunden/${id}?fehler=${encodeURIComponent(e instanceof Error ? e.message : "Löschen nicht möglich")}`); }
  await audit(s, "DELETE", "Kunde", id, `${k.firmenname} endgültig gelöscht${erzwingen ? " – mit Rechnungen (erzwungen)" : ""}`, undefined, k.kostenstelleId);
  revalidatePath("/kunden");
  redirect(`/kunden?geloescht=${encodeURIComponent(k.firmenname)}`);
}

/** Dokument beim Kunden löschen (nur Systemadmin) */
export async function kundeDokumentLoeschen(id: string, dokumentId: string) {
  const { s, k } = await ladeKunde(id);
  if (s.rolle !== "SYSTEMADMIN") redirect(`/kunden/${id}?tab=dokumente&fehler=berechtigung`);
  await loescheDokument(dokumentId);
  await audit(s, "DELETE", "Dokument", dokumentId, undefined, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=dokumente`);
}

/** Übernahme (Abwerbung) einer überlassenen Arbeitskraft erfassen – Honorar nach AGB Punkt 6.1. */
export async function uebernahmeAnlegen(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const personId = str(fd.get("personId"));
  const uebernahmeAm = parseDate(fd.get("uebernahmeAm")) ?? new Date();
  const brutto = parseNum(fd.get("bruttojahresentgelt")) ?? 0;
  if (!personId || !brutto) redirect(`/kunden/${id}?tab=uebernahmen&fehler=pflicht`);
  const p = await db.person.findUnique({ where: { id: personId } });
  // personId stammt aus dem Formular – nur eigene Personen zulassen, sonst landet der Name einer
  // fremden Person in der Historie des eigenen Kunden und im Akt der fremden Person.
  if (!p || !darfKostenstelle(s, p.kostenstelleId)) redirect(`/kunden/${id}?tab=uebernahmen&fehler=pflicht`);
  const einsatz = await db.einsatz.findFirst({ where: { personId, kundeId: id }, orderBy: { von: "asc" } });
  const monate = parseNum(fd.get("monateUeberlassen")) ?? (einsatz ? volleMonate(einsatz.von, uebernahmeAm) : 0);
  const h = uebernahmeHonorar({ bruttojahresentgelt: brutto, monateUeberlassen: monate, prozent: k.uebernahmeProzent, mindest: k.uebernahmeMindest });
  const u = await db.uebernahme.create({ data: {
    kostenstelleId: k.kostenstelleId, kundeId: id, personId, einsatzId: einsatz?.id ?? null,
    uebernahmeAm, bruttojahresentgelt: brutto, monateUeberlassen: monate,
    prozent: k.uebernahmeProzent, mindesthonorar: k.uebernahmeMindest, honorar: h.honorar,
    status: h.frei ? "VERZICHTET" : "OFFEN",
    notiz: strOrNull(fd.get("notiz")) ?? (h.frei ? "Nach 12 vollen Überlassungsmonaten kostenlos (AGB Punkt 6.1)." : null),
  } });
  await db.aktivitaet.createMany({ data: [
    { typ: "STATUS", text: `Übernahme ${p.vorname} ${p.nachname} zum ${uebernahmeAm.toLocaleDateString("de-AT")} – Honorar ${h.honorar.toLocaleString("de-AT", { style: "currency", currency: "EUR" })} (${monate} Überlassungsmonate)`, nutzerName: s.name, kundeId: id },
    { typ: "STATUS", text: `Vom Beschäftiger ${k.firmenname} übernommen zum ${uebernahmeAm.toLocaleDateString("de-AT")}`, nutzerName: s.name, personId },
  ] });
  await audit(s, "CREATE", "Uebernahme", u.id, `${p.vorname} ${p.nachname} → ${k.firmenname}`, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`); redirect(`/kunden/${id}?tab=uebernahmen&ok=1`);
}

export async function uebernahmeStatus(id: string, uebernahmeId: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const status = str(fd.get("status")) || "OFFEN";
  const treffer = await db.uebernahme.updateMany({ where: { id: uebernahmeId, kundeId: id }, data: { status } }); // nur Übernahmen DIESES Kunden
  if (!treffer.count) redirect(`/kunden/${id}?tab=uebernahmen`);
  await db.aufgabe.updateMany({ where: { typ: "UEBERNAHME_VERRECHNEN", referenzId: uebernahmeId, erledigt: false }, data: { erledigt: status !== "OFFEN", erledigtAm: new Date() } });
  await audit(s, "STATUS", "Uebernahme", uebernahmeId, `Status ${status}`, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`); redirect(`/kunden/${id}?tab=uebernahmen&ok=1`);
}

/** Kundenportal-Link an den Beschäftiger senden: Stundenfreigabe und Bewertung ohne Login. */
export async function portalLinkSenden(id: string, fd: FormData) {
  const { s, k } = await ladeKunde(id);
  const an = str(fd.get("an"));
  if (!an) redirect(`/kunden/${id}?tab=uebernahmen&fehler=email`);
  // Ist vereinbart, dass der Beschäftiger uns die Stundenzettel schickt, geht kein Freigabe-Link hinaus.
  if (k.stundennachweisVomKunden && str(fd.get("zweck")) !== "BEWERTUNG") redirect(`/kunden/${id}?tab=uebernahmen&fehler=nachweisvomkunden`);
  const { kundenPortalLink } = await import("@/lib/kundenportal");
  const { sendeMail } = await import("@/lib/mail");
  const { firma } = await import("@/lib/einstellungen");
  const jahr = parseNum(fd.get("jahr")) ?? undefined;
  const kw = parseNum(fd.get("kw")) ?? undefined;
  const zweck = (str(fd.get("zweck")) || "BEIDES") as "STUNDEN" | "BEWERTUNG" | "BEIDES";
  const { url, gultigBis } = await kundenPortalLink({ kundeId: id, an, name: strOrNull(fd.get("name")), zweck, jahr, kw });
  const empfaenger = await db.ansprechpartner.findFirst({ where: { kundeId: id, email: { equals: an, mode: "insensitive" } } });
  const f = await firma();
  const was = zweck === "BEWERTUNG" ? "eine kurze Rückmeldung zu unseren Mitarbeitern" : zweck === "STUNDEN" ? "die Freigabe der Wochenstunden" : "die Freigabe der Wochenstunden und eine kurze Rückmeldung";
  const r = await sendeMail({
    an, betreff: `Stundenfreigabe ${kw ? `KW ${kw} ` : ""}– ${f.name}`,
    text: `${anredeZeile(empfaenger, k.anredeDu)}\n\nüber den folgenden Link erreichen Sie ${was}. Ein Login ist nicht nötig. Der Link gilt bis ${gultigBis.toLocaleDateString("de-AT")} und nach dem ersten Öffnen noch 24 Stunden – bitte nicht weiterleiten:\n\n${url}\n\nIhre Freigabe im Portal ersetzt die Unterschrift auf dem Stundenzettel (Punkt 4.7 unserer AGB) und ist die Grundlage für die Rechnung.\n\nVielen Dank und beste Grüße\n${s.name}\n${f.name} · ${f.telefon}`,
    referenzTyp: "KundenPortalToken", referenzId: id,
  });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Kundenportal-Link an ${an} gesendet (${zweck.toLowerCase()})`, nutzerName: s.name, kundeId: id } });
  await audit(s, "SEND", "KundenPortalToken", id, `Portal-Link an ${an} (${r.status})`, undefined, k.kostenstelleId);
  revalidatePath(`/kunden/${id}`);
  redirect(`/kunden/${id}?tab=uebernahmen&gesendet=${r.status}`);
}
