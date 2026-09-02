"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { cent, summen } from "@/lib/geld";
import { requireSession, darfKostenstelle, darfRechnungen, darfSensibel } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { rechnungPdf } from "./pdf";
import { stundennachweisBeilage } from "@/lib/stundennachweis-beilage";
import { speichereDokument } from "@/lib/storage";
import { sendeMail } from "@/lib/mail";
import { MAHNTEXTE } from "@/lib/rechnung";
import { naechsteNummer, nummerFreigeben } from "@/lib/nummern";
import { eur, datum, parseNum, parseDate, str, strOrNull } from "@/lib/format";

async function lade(id: string) {
  const s = await requireSession();
  if (!darfRechnungen(s)) redirect("/rechnungen?fehler=berechtigung");
  const r = await db.rechnung.findUnique({ where: { id }, include: { kunde: true, positionen: true, kostenstelle: true } });
  if (!r || !darfKostenstelle(s, r.kostenstelleId)) redirect("/rechnungen");
  return { s, r };
}

export async function rechnungVersenden(id: string, fd: FormData) {
  const { s, r } = await lade(id);
  const an = str(fd.get("an")) || r.kunde.rechnungsemail || r.kunde.email || "";
  if (!an) redirect(`/rechnungen/${id}?fehler=email`);
  // Beilage: bestätigte Stundennachweise des Leistungsmonats (Übersicht + Fotos) automatisch mitsenden
  const beilage = await stundennachweisBeilage(id);
  const pdf = await rechnungPdf(id, 0, beilage.beschreibung.length ? beilage.beschreibung : undefined);
  const doc = await speichereDokument({ kostenstelleId: r.kostenstelleId, dateiname: `Rechnung_${r.nummer}.pdf`, mime: "application/pdf", inhalt: pdf, kategorie: "Rechnung", kundeId: r.kundeId, rechnungId: id, hochgeladenVon: s.name });
  if (beilage.anhaenge[0]) await speichereDokument({ kostenstelleId: r.kostenstelleId, dateiname: beilage.anhaenge[0].filename, mime: "application/pdf", inhalt: beilage.anhaenge[0].content, kategorie: "Stundennachweise (Rechnungsbeilage)", kundeId: r.kundeId, rechnungId: id, hochgeladenVon: s.name });
  const f = await ladeFirma();
  const m = await sendeMail({ an, cc: r.kunde.rechnungCcEmail, betreff: `Rechnung ${r.nummer} – ${f.name}`, text: str(fd.get("text")) || `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die Rechnung ${r.nummer} über ${eur(r.brutto)} für den Leistungszeitraum ${String(r.leistungMonat).padStart(2, "0")}/${r.leistungJahr}, zahlbar ${r.faelligAm <= new Date() ? "sofort" : `bis ${datum(r.faelligAm)}`} ohne Abzug.${beilage.anzahl ? `\n\nAls Beilage finden Sie die von Ihnen bestätigten Stundennachweise (${beilage.anzahl} Wochen), die dieser Abrechnung zugrunde liegen.` : ""}\n\nMit freundlichen Grüßen\n${s.name}\n${f.name} · ${f.rechtstraeger}\n${f.telefon} · ${f.email}`, anhang: { filename: `Rechnung_${r.nummer}.pdf`, content: pdf, contentType: "application/pdf" }, anhaenge: beilage.anhaenge, referenzTyp: "Rechnung", referenzId: id });
  // Beim ersten Versand wird das Rechnungsdatum auf heute gestellt – dann muss auch die Fälligkeit
  // neu vom heutigen Tag rechnen. Sonst verkürzt die Liegezeit des Entwurfs das Zahlungsziel des Kunden.
  const neuFaellig = r.status === "ENTWURF" ? new Date(Date.now() + (r.kunde.zahlungszielTage ?? 0) * 86400000) : r.faelligAm;
  await db.rechnung.update({ where: { id }, data: { status: r.status === "ENTWURF" ? "VERSENDET" : r.status, versendetAm: new Date(), pdfDokumentId: doc.id, rechnungsdatum: r.status === "ENTWURF" ? new Date() : r.rechnungsdatum, faelligAm: neuFaellig } });
  await audit(s, "SEND", "Rechnung", id, `${r.nummer} an ${an} (${m.status})`, undefined, r.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "RECHNUNG", text: `Rechnung ${r.nummer} an ${an} versendet${beilage.anzahl ? ` inkl. ${beilage.anzahl} Stundennachweise` : ""}${m.status === "TEST" ? " (Testmodus)" : ""}`, nutzerName: s.name, kundeId: r.kundeId } });
  revalidatePath(`/rechnungen/${id}`);
  redirect(`/rechnungen/${id}?gesendet=${m.status}`);
}

export async function zahlungErfassen(id: string, fd: FormData) {
  const { s, r } = await lade(id);
  const betrag = parseNum(fd.get("betrag")) ?? r.brutto - r.bezahltBetrag;
  const gesamt = cent(r.bezahltBetrag + betrag);
  const status = gesamt >= r.brutto - 0.005 ? "BEZAHLT" : "TEILBEZAHLT";
  // Bei vollständiger Zahlung fällt auch die Mahnstufe – eine später erneut belastete Rechnung
  // startet sonst gleich bei Stufe 3.
  await db.rechnung.update({ where: { id }, data: { bezahltBetrag: gesamt, bezahltAm: parseDate(fd.get("datum")) ?? new Date(), status, ...(status === "BEZAHLT" ? { mahnstufe: 0 } : {}) } });
  if (status === "BEZAHLT") await db.aufgabe.updateMany({ where: { referenzTyp: "Rechnung", referenzId: id }, data: { erledigt: true, erledigtAm: new Date() } });
  await audit(s, "UPDATE", "Rechnung", id, `Zahlung ${eur(betrag)} erfasst → ${status}`, undefined, r.kostenstelleId);
  revalidatePath(`/rechnungen/${id}`);
  redirect(`/rechnungen/${id}`);
}

export async function mahnungSenden(id: string, fd: FormData) {
  const { s, r } = await lade(id);
  const stufe = Math.min(3, Math.max(1, parseNum(fd.get("stufe")) ?? r.mahnstufe + 1));
  const an = str(fd.get("an")) || r.kunde.rechnungsemail || r.kunde.email || "";
  if (!an) redirect(`/rechnungen/${id}?fehler=email`);
  const f = await ladeFirma();
  const frist = datum(new Date(Date.now() + 7 * 86400000));
  const t = MAHNTEXTE[stufe - 1];
  const pdf = await rechnungPdf(id, stufe);
  const m = await sendeMail({ an, cc: r.kunde.rechnungCcEmail, betreff: `${t.titel} – Rechnung ${r.nummer}`, text: `${t.text(r.nummer, eur(r.brutto - r.bezahltBetrag), frist, `IBAN ${f.iban}`)}\n\nMit freundlichen Grüßen\n${s.name}\nGeschäftsführung, ${f.rechtstraeger} (${f.name})\n${f.telefon}`, anhang: { filename: `Rechnung_${r.nummer}.pdf`, content: pdf, contentType: "application/pdf" }, referenzTyp: "Mahnung", referenzId: id });
  await db.rechnung.update({ where: { id }, data: { mahnstufe: stufe, letzteErinnerungAm: new Date(), status: r.status === "VERSENDET" ? "UEBERFAELLIG" : r.status } });
  await audit(s, "SEND", "Rechnung", id, `${t.titel} an ${an} (${m.status})`, undefined, r.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "RECHNUNG", text: `${t.titel} zu ${r.nummer} an ${an}`, nutzerName: s.name, kundeId: r.kundeId } });
  revalidatePath(`/rechnungen/${id}`);
  redirect(`/rechnungen/${id}?gesendet=${m.status}`);
}

export async function rechnungStornieren(id: string) {
  const { s, r } = await lade(id);
  if (r.status === "STORNIERT") redirect(`/rechnungen/${id}`);
  const nummer = await naechsteNummer(r.kostenstelleId, "RE", new Date().getFullYear());
  // Wurde auf die Rechnung schon gezahlt, entsteht die Gutschrift als OFFEN – es ist noch Geld an den
  // Kunden zurückzuzahlen, und das muss in den offenen Posten sichtbar bleiben. Ohne Zahlung ist die
  // Gutschrift ein reiner Buchungsakt und sofort erledigt.
  const bezahlt = r.bezahltBetrag > 0.005;
  let stornoId = "";
  try {
    stornoId = await db.$transaction(async (tx) => {
      const storno = await tx.rechnung.create({ data: { kostenstelleId: r.kostenstelleId, kundeId: r.kundeId, nummer, leistungJahr: r.leistungJahr, leistungMonat: r.leistungMonat, faelligAm: new Date(), status: bezahlt ? "VERSENDET" : "BEZAHLT", netto: -r.netto, ustProzent: r.ustProzent, ust: -(r.ust || r.brutto - r.netto), brutto: -r.brutto, bezahltBetrag: bezahlt ? 0 : -r.brutto, bezahltAm: bezahlt ? null : new Date(), notiz: `Stornorechnung zu ${r.nummer}${bezahlt ? ` – auf die Originalrechnung wurden bereits ${eur(r.bezahltBetrag)} gezahlt, Rückzahlung offen` : ""}`, positionen: { create: r.positionen.map((p) => ({ personId: p.personId, einsatzId: p.einsatzId, beschreibung: `Storno: ${p.beschreibung}`, menge: p.menge, einheit: p.einheit, einzelpreis: -p.einzelpreis, betrag: -p.betrag })) } } });
      await tx.rechnung.update({ where: { id }, data: { status: "STORNIERT", storniertDurchId: storno.id } });
      // Trägerzeile einer freien Rechnung (kein Einsatz, keine Stunden, kein Lohn) verschwindet mit der
      // Rechnung. Würde sie nur freigegeben, stünde sie als offene Abrechnung ohne Grundlage da und der
      // nächste Rechnungslauf würde das Honorar ein zweites Mal fakturieren.
      await tx.monatsabrechnung.deleteMany({ where: { rechnungId: id, einsatzId: null, stunden: null, bruttolohn: null } });
      await tx.monatsabrechnung.updateMany({ where: { rechnungId: id }, data: { rechnungId: null, status: "OFFEN" } });
      return storno.id;
    });
  } catch (e) {
    await nummerFreigeben(r.kostenstelleId, "RE", new Date().getFullYear(), nummer).catch(() => {});
    throw e;
  }
  await audit(s, "STATUS", "Rechnung", id, `Storniert durch ${nummer}${bezahlt ? " – Rückzahlung offen" : ""} (Nummernkreis bleibt lückenlos)`, undefined, r.kostenstelleId);
  redirect(`/rechnungen/${stornoId}`);
}

export async function rechnungNotiz(id: string, fd: FormData) {
  const { r } = await lade(id);
  await db.rechnung.update({ where: { id }, data: { notiz: strOrNull(fd.get("notiz")), faelligAm: parseDate(fd.get("faelligAm")) ?? r.faelligAm } });
  revalidatePath(`/rechnungen/${id}`);
  redirect(`/rechnungen/${id}`);
}


/**
 * Rechnung endgültig löschen – nur Systemadmin, nur Entwürfe, stornierte Rechnungen und Storno-Gutschriften (Testbuchungen).
 * Verrechnete Monate werden wieder freigegeben; ist die Nummer die höchste des Kreises, wird der Nummernkreis zurückgesetzt,
 * damit die Nummer erneut vergeben wird (keine Lücke).
 */
export async function rechnungLoeschen(id: string) {
  const s = await requireSession();
  if (s.rolle !== "SYSTEMADMIN") redirect(`/rechnungen/${id}?fehler=berechtigung`);
  const r = await db.rechnung.findUnique({ where: { id }, include: { dokumente: true } });
  if (!r) redirect("/rechnungen");
  const istStornoGutschrift = r.netto < 0;
  if (!(r.status === "ENTWURF" || r.status === "STORNIERT" || istStornoGutschrift)) redirect(`/rechnungen/${id}?fehler=loeschen`);
  // Freie Rechnung: Die eigens angelegte Abrechnungszeile (kein Einsatz, keine Stunden, kein Lohn)
  // verschwindet mit der Rechnung – sonst bliebe eine offene Abrechnung ohne Grundlage stehen und der
  // nächste Rechnungslauf würde sie ein zweites Mal fakturieren.
  await db.monatsabrechnung.deleteMany({ where: { rechnungId: id, einsatzId: null, stunden: null, bruttolohn: null } });
  await db.monatsabrechnung.updateMany({ where: { rechnungId: id }, data: { rechnungId: null, status: "OFFEN" } });
  await db.rechnung.updateMany({ where: { storniertDurchId: id }, data: { storniertDurchId: null } });
  await db.dokument.updateMany({ where: { rechnungId: id }, data: { rechnungId: null } });
  await db.rechnung.delete({ where: { id } });
  // Gelöschte Nummer wieder freigeben: ist es die zuletzt vergebene, Zähler zurückdrehen, sonst als freie Nummer merken (wird als Nächste vergeben)
  await nummerFreigeben(r.kostenstelleId, "RE", r.rechnungsdatum.getFullYear(), r.nummer);
  await audit(s, "DELETE", "Rechnung", id, `${r.nummer} gelöscht (${r.status}${istStornoGutschrift ? ", Gutschrift" : ""}) – Nummernkreis ggf. zurückgesetzt`, undefined, r.kostenstelleId);
  revalidatePath("/rechnungen");
  redirect("/rechnungen?geloescht=" + encodeURIComponent(r.nummer));
}

/**
 * Freie Rechnung anlegen – für alles, was nicht aus der Monatsabrechnung kommt.
 *
 * Der Anlass ist die Direktvermittlung: Dort gibt es keine Stunden, sondern ein Honorar. Dasselbe
 * gilt für Nachverrechnungen und vereinbarte Pauschalen. Ohne diesen Weg würden solche Rechnungen an
 * der Software vorbei geschrieben – mit eigener Nummer, und der Nummernkreis nach § 11 UStG bekäme
 * Löcher, die bei einer Prüfung erklärt werden müssen.
 *
 * Die Rechnung entsteht als Entwurf und durchläuft danach denselben Weg wie jede andere: prüfen,
 * PDF, versenden, Zahlungseingang, Mahnwesen.
 */
export async function freieRechnungAnlegen(fd: FormData) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/rechnungen?fehler=berechtigung");
  const kundeId = str(fd.get("kundeId"));
  if (!kundeId) redirect("/rechnungen/neu?fehler=kunde");
  const k = await db.kunde.findUnique({ where: { id: kundeId } });
  if (!k || !darfKostenstelle(s, k.kostenstelleId)) redirect("/rechnungen?fehler=berechtigung");
  // Kostenstelle für den Umsatz frei wählbar (Standard: die des Kunden) – so lässt sich der Erlös
  // und damit die Provision gezielt einer Kostenstelle zuordnen. Für Nicht-Zentrale bleibt es die eigene.
  const gewuenschteKs = strOrNull(fd.get("kostenstelleId"));
  let zielKs = k.kostenstelleId;
  if (gewuenschteKs) {
    if (!darfKostenstelle(s, gewuenschteKs)) redirect("/rechnungen?fehler=berechtigung");
    const zk = await db.kostenstelle.findUnique({ where: { id: gewuenschteKs }, select: { id: true, aktiv: true } });
    if (zk?.aktiv) zielKs = zk.id;
  }

  const personId = strOrNull(fd.get("personId"));
  if (!personId) redirect(`/rechnungen/neu?kundeId=${kundeId}&fehler=person`);
  // personId kommt aus dem Formular – nur eigene Personen zulassen, sonst landet ein fremder Name
  // auf der eigenen Rechnung und in der eigenen Monatsabrechnung.
  const rp = await db.person.findUnique({ where: { id: personId }, select: { kostenstelleId: true } });
  if (!rp || !darfKostenstelle(s, rp.kostenstelleId)) redirect(`/rechnungen/neu?kundeId=${kundeId}&fehler=person`);
  const positionen: { personId: string | null; beschreibung: string; menge: number; einheit: string; einzelpreis: number; betrag: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const beschreibung = str(fd.get(`bez_${i}`));
    const einzelpreis = parseNum(fd.get(`preis_${i}`));
    if (!beschreibung || einzelpreis == null) continue;
    const menge = parseNum(fd.get(`menge_${i}`)) ?? 1;
    positionen.push({
      personId, beschreibung, menge, einheit: str(fd.get(`einheit_${i}`)) || "pauschal",
      einzelpreis: cent(einzelpreis), betrag: cent(menge * cent(einzelpreis)),
    });
  }
  if (!positionen.length) redirect(`/rechnungen/neu?kundeId=${kundeId}&fehler=positionen`);

  const f = await ladeFirma();
  const sum = summen(positionen, f.ustProzent);
  const leistung = str(fd.get("leistung")) || new Date().toISOString().slice(0, 7);
  const [jahr, monat] = leistung.split("-").map(Number);
  const zielTage = parseNum(fd.get("zahlungszielTage")) ?? k.zahlungszielTage ?? 0;

  const nummer = await naechsteNummer(zielKs, "RE", jahr);
  let r;
  try {
    r = await db.rechnung.create({
      data: {
        kostenstelleId: zielKs, kundeId, nummer,
        leistungJahr: jahr, leistungMonat: monat,
        faelligAm: new Date(Date.now() + zielTage * 86400000),
        status: "ENTWURF",
        netto: sum.netto, ustProzent: f.ustProzent, ust: sum.ust, brutto: sum.brutto,
        notiz: [strOrNull(fd.get("kopftext")), strOrNull(fd.get("notiz"))].filter(Boolean).join(" · ") || null,
        positionen: { create: positionen },
      },
    });
  } catch (e) {
    // Nummer war schon gezogen, die Rechnung ist es nicht geworden – zurück in den Kreis.
    await nummerFreigeben(zielKs, "RE", jahr, nummer).catch(() => {});
    throw e;
  }
  // Damit die Rechnung im Deckungsbeitrag ankommt.
  //
  // Das Controlling rechnet DB1 und DB2 ausschließlich aus der Monatsabrechnung. Eine freie Rechnung
  // hätte dort nie stattgefunden – das Vermittlungshonorar wäre auf dem Konto gelandet, im DB1 aber
  // nicht aufgetaucht. Deshalb entsteht zur Rechnung eine Abrechnungszeile ohne Einsatz, ohne Stunden
  // und ohne Lohn: reiner Umsatz, also fließt der volle Betrag in den Deckungsbeitrag.
  //
  // Je Mitarbeiter, Kunde und Monat gibt es genau eine solche Zeile. Ist sie schon da (der Mitarbeiter
  // ist bei diesem Kunden im Einsatz), wird hier bewusst **nicht** dazugerechnet: Ein Honorar auf einer
  // fremden Zeile stillschweigend mitzuführen hieße, Umsatz zu vermischen, den später niemand mehr
  // auseinanderdividieren kann – und beim Stornieren müsste geraten werden, welcher Teil zurückgeht.
  // Lieber eine klare Ansage als eine Zahl, der man nicht trauen kann.
  const vorhanden = await db.monatsabrechnung.findUnique({ where: { personId_kundeId_jahr_monat: { personId, kundeId, jahr, monat } } });
  if (vorhanden) {
    await db.rechnung.delete({ where: { id: r.id } });
    await nummerFreigeben(zielKs, "RE", jahr, nummer).catch(() => {});
    redirect(`/rechnungen/neu?kundeId=${kundeId}&fehler=belegt`);
  }
  // Art der Leistung an der Trägerzeile: Ohne Einsatz weiß das Controlling sonst nicht, ob es sich um
  // Überlassung (20 %) oder Direktvermittlung (50 % Provision) handelt – und rechnete bisher immer mit 20 %.
  const art = str(fd.get("art")) === "DIREKTVERMITTLUNG" ? "DIREKTVERMITTLUNG" : "UEBERLASSUNG";
  await db.monatsabrechnung.create({
    data: {
      kostenstelleId: zielKs, personId, kundeId, jahr, monat,
      verrechnung: sum.netto, status: "ABGERECHNET", rechnungId: r.id, art,
    },
  });
  await audit(s, "CREATE", "Rechnung", r.id, `Freie Rechnung ${nummer} für ${k.firmenname} (${positionen.length} Positionen, ${eur(sum.brutto)})`, undefined, k.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "RECHNUNG", text: `Freie Rechnung ${nummer} erstellt (${eur(sum.brutto)})`, nutzerName: s.name, kundeId } });
  revalidatePath("/rechnungen");
  redirect(`/rechnungen/${r.id}`);
}
