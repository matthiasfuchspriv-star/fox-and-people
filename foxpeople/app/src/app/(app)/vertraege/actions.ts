"use server";
import { vertragLoeschen as loescheVertrag } from "@/lib/loeschen";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, darfKostenstelle, zielKostenstelle } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { naechsteNummer } from "@/lib/nummern";
import { vertragsKontext, renderVorlage } from "@/lib/vertrag";
import { str, strOrNull } from "@/lib/format";
import { speichereDokument } from "@/lib/storage";
import { sendeMail } from "@/lib/mail";
import { agbPdf } from "@/lib/agb-pdf";
import { AGB_VERSION } from "@/lib/agb";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { vertragPdf } from "./pdf";
import type { VertragStatus } from "@/generated/prisma/enums";
import { titel, vertragDateiname } from "./titel";

export async function vertragAnlegen(fd: FormData) {
  const s = await requireSession();
  const vorlageId = str(fd.get("vorlageId"));
  const vorlage = await db.vertragsvorlage.findUnique({ where: { id: vorlageId } });
  if (!vorlage) redirect("/vertraege/neu?fehler=vorlage");
  const personId = strOrNull(fd.get("personId")); const kundeId = strOrNull(fd.get("kundeId")); const einsatzId = strOrNull(fd.get("einsatzId"));
  const einsatz = einsatzId ? await db.einsatz.findUnique({ where: { id: einsatzId } }) : null;
  const ref = einsatz ?? (personId ? await db.person.findUnique({ where: { id: personId } }) : null) ?? (kundeId ? await db.kunde.findUnique({ where: { id: kundeId } }) : null);
  if (!ref || !darfKostenstelle(s, ref.kostenstelleId)) redirect("/vertraege/neu?fehler=bezug");
  const kostenstelleId = zielKostenstelle(s, ref.kostenstelleId);
  const { ctx } = await vertragsKontext({ personId: einsatz?.personId ?? personId, kundeId: einsatz?.kundeId ?? kundeId, einsatzId, kostenstelleId });
  const nummer = await naechsteNummer(kostenstelleId, "VT");
  const v = await db.vertrag.create({ data: { kostenstelleId, nummer, typ: vorlage.typ, vorlageId, personId: einsatz?.personId ?? personId, kundeId: einsatz?.kundeId ?? kundeId, einsatzId, inhalt: renderVorlage(vorlage.inhalt, ctx) } });
  await audit(s, "CREATE", "Vertrag", v.id, `${nummer} (${vorlage.name})`, undefined, kostenstelleId);
  // Entwurf sofort als PDF bei Mitarbeiter und Kunde ablegen (Übersicht in beiden Akten)
  try {
    const pdf = await vertragPdf(v.id);
    const personName = v.personId ? await db.person.findUnique({ where: { id: v.personId }, select: { vorname: true, nachname: true } }) : null;
    const doc = await speichereDokument({ kostenstelleId, dateiname: vertragDateiname(vorlage.typ, nummer, personName), mime: "application/pdf", inhalt: pdf, kategorie: titel(vorlage.typ), personId: v.personId, kundeId: v.kundeId, vertragId: v.id, sichtbarImPortal: false, hochgeladenVon: s.name });
    await db.vertrag.update({ where: { id: v.id }, data: { pdfEntwurfDokumentId: doc.id } });
    if (v.personId) await db.aktivitaet.create({ data: { typ: "DOKUMENT", text: `${titel(vorlage.typ)} ${nummer} erstellt`, nutzerName: s.name, personId: v.personId } });
    if (v.kundeId) await db.aktivitaet.create({ data: { typ: "DOKUMENT", text: `${titel(vorlage.typ)} ${nummer} erstellt${v.personId ? "" : ""}`, nutzerName: s.name, kundeId: v.kundeId } });
  } catch { /* PDF-Ablage optional */ }
  redirect(`/vertraege/${v.id}`);
}

async function lade(id: string) {
  const s = await requireSession();
  const v = await db.vertrag.findUnique({ where: { id }, include: { person: true, kunde: true, kostenstelle: true } });
  if (!v || !darfKostenstelle(s, v.kostenstelleId)) redirect("/vertraege");
  return { s, v };
}

export async function vertragSpeichern(id: string, fd: FormData) {
  const { s, v } = await lade(id);
  if (v.status !== "ENTWURF") redirect(`/vertraege/${id}`);
  await db.vertrag.update({ where: { id }, data: { inhalt: str(fd.get("inhalt")) } });
  await audit(s, "UPDATE", "Vertrag", id, "Vertragstext bearbeitet", undefined, v.kostenstelleId);
  revalidatePath(`/vertraege/${id}`);
  redirect(`/vertraege/${id}`);
}


export async function vertragVersenden(id: string, fd: FormData) {
  const { s, v } = await lade(id);
  const an = str(fd.get("an"));
  if (!an) redirect(`/vertraege/${id}?fehler=email`);
  const pdf = await vertragPdf(id);
  const doc = await speichereDokument({ kostenstelleId: v.kostenstelleId, dateiname: vertragDateiname(v.typ, v.nummer, v.person), mime: "application/pdf", inhalt: pdf, kategorie: titel(v.typ), personId: v.personId, kundeId: v.kundeId, vertragId: id, sichtbarImPortal: !!v.personId, hochgeladenVon: s.name });
  const f = await ladeFirma();
  // Rahmen- und Überlassungsverträge gehen immer mit den geltenden AGB raus – sie sind Vertragsbestandteil.
  const agbArt = v.typ === "VERMITTLUNGSVERTRAG" ? "VERMITTLUNG" : v.typ === "RAHMENVERTRAG" || v.typ === "UEBERLASSUNGSVERTRAG" ? "UEBERLASSUNG" : null;
  const agb = agbArt ? await agbPdf(agbArt, v.kundeId) : null;
  const r = await sendeMail({ anhaenge: agb ? [{ filename: agb.dateiname, content: agb.buf, contentType: "application/pdf" }] : undefined, an, betreff: `${titel(v.typ)} ${v.nummer} – ${f.name}`, text: str(fd.get("text")) || (v.personId ? `${v.person?.geschlecht === "W" ? "Liebe" : v.person?.geschlecht === "M" ? "Lieber" : "Hallo"} ${v.person?.vorname ?? ""},\n\nanbei erhältst du deine ${titel(v.typ)} ${v.nummer}. Bitte lies sie durch, unterschreibe sie und gib sie uns unterschrieben zurück (Foto/Scan über die Mitarbeiter-App genügt).` : `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie den ${titel(v.typ)} ${v.nummer} zur Durchsicht und Unterschrift. Bitte senden Sie uns die unterschriebene Fassung zurück.`) + `\n\nMit freundlichen Grüßen\n${s.name}\n${f.name} · ${f.telefon}`, anhang: { filename: vertragDateiname(v.typ, v.nummer, v.person), content: pdf, contentType: "application/pdf" }, referenzTyp: "Vertrag", referenzId: id });
  await db.vertrag.update({ where: { id }, data: { status: "VERSENDET", versendetAm: new Date(), pdfEntwurfDokumentId: doc.id } });
  if (agb && v.kundeId) await db.kunde.update({ where: { id: v.kundeId }, data: { agbVersion: AGB_VERSION } });
  await audit(s, "SEND", "Vertrag", id, `${v.nummer} an ${an} (${r.status})`, undefined, v.kostenstelleId);
  // Versand gehört in die Historie des Akts, nicht nur ins Audit-Protokoll – dort schaut niemand nach.
  if (v.personId) await db.aktivitaet.create({ data: { typ: "DOKUMENT", text: `${titel(v.typ)} ${v.nummer} per E-Mail versendet`, nutzerName: s.name, personId: v.personId } });
  revalidatePath(`/vertraege/${id}`);
  redirect(`/vertraege/${id}?gesendet=${r.status}`);
}

export async function vertragUnterschrieben(id: string, fd: FormData) {
  const { s, v } = await lade(id);
  const file = fd.get("datei");
  let docId: string | null = null;
  if (file instanceof File && file.size > 0) {
    const doc = await speichereDokument({ kostenstelleId: v.kostenstelleId, dateiname: vertragDateiname(v.typ, v.nummer, v.person).replace(/\.pdf$/, `_unterschrieben${file.name.slice(file.name.lastIndexOf("."))}`), mime: file.type || "application/pdf", inhalt: Buffer.from(await file.arrayBuffer()), kategorie: titel(v.typ), personId: v.personId, kundeId: v.kundeId, vertragId: id, sichtbarImPortal: !!v.personId, hochgeladenVon: s.name , fehlerZiel: `/vertraege/${id}` });
    docId = doc.id;
  }
  await db.vertrag.update({ where: { id }, data: { status: "UNTERSCHRIEBEN", unterschriebenAm: new Date(), pdfUnterschriebenDokumentId: docId ?? undefined } });
  if (v.typ === "RAHMENVERTRAG" && v.kundeId) await db.kunde.update({ where: { id: v.kundeId }, data: { rahmenvertragBeginn: v.kunde?.rahmenvertragBeginn ?? new Date() } });
  await audit(s, "STATUS", "Vertrag", id, "Unterschrieben abgelegt", undefined, v.kostenstelleId);
  if (v.personId) await db.aktivitaet.create({ data: { typ: "DOKUMENT", text: `${titel(v.typ)} ${v.nummer} unterschrieben zurück${docId ? " – Scan im Akt abgelegt" : ""}`, nutzerName: s.name, personId: v.personId } });
  revalidatePath(`/vertraege/${id}`);
  redirect(`/vertraege/${id}`);
}

export async function vertragStatus(id: string, fd: FormData) {
  const { s, v } = await lade(id);
  const status = str(fd.get("status")) as VertragStatus;
  await db.vertrag.update({ where: { id }, data: { status } });
  await audit(s, "STATUS", "Vertrag", id, `${v.status} → ${status}`, undefined, v.kostenstelleId);
  revalidatePath(`/vertraege/${id}`);
  redirect(`/vertraege/${id}`);
}



/** Vertrag löschen (nur Systemadmin) – Dokumente bleiben bei Person/Kunde erhalten. */
export async function vertragLoeschen(id: string) {
  const { s, v } = await lade(id);
  if (s.rolle !== "SYSTEMADMIN") redirect(`/vertraege/${id}?fehler=berechtigung`);
  await loescheVertrag(id);
  await audit(s, "DELETE", "Vertrag", id, `${v.nummer} gelöscht`, undefined, v.kostenstelleId);
  revalidatePath("/vertraege");
  redirect("/vertraege?geloescht=" + encodeURIComponent(v.nummer));
}
