"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, darfKostenstelle } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendeMail } from "@/lib/mail";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { str, strOrNull } from "@/lib/format";
import { erzeugeKundenprofil } from "@/lib/profil-pdf";
import { speichereDokument } from "@/lib/storage";

/** Freie E-Mail aus dem Programm an eine hinterlegte Person / einen Ansprechpartner – wird im MailLog und in der Historie protokolliert. */
export async function mailSenden(fd: FormData) {
  const s = await requireSession();
  const an = str(fd.get("an")); const cc = strOrNull(fd.get("cc")); const betreff = str(fd.get("betreff")); const text = str(fd.get("text"));
  const personId = strOrNull(fd.get("personId")); const kundeId = strOrNull(fd.get("kundeId"));
  const zurueck = personId ? `/personen/${personId}?tab=historie` : kundeId ? `/kunden/${kundeId}?tab=historie` : "/";
  if (!an || !betreff || !text) redirect(`/mail/neu?${new URLSearchParams({ an, betreff, personId: personId ?? "", kundeId: kundeId ?? "", fehler: "pflicht" })}`);
  // Ohne Bezug zu einer Person oder einem Kunden gibt es keinen freien Versand: Das Firmenpostfach
  // ist sonst ein offener Mailversand für jeden angemeldeten Nutzer (Phishing-/Reputationsrisiko).
  if (!personId && !kundeId) redirect(`/mail/neu?${new URLSearchParams({ an, betreff, fehler: "bezug" })}`);
  const { darfZugreifen } = await import("@/lib/bremse");
  if (!(await darfZugreifen(`mailfrei:${s.nutzerId}`, { anzahl: 30, fensterMinuten: 60 }))) redirect(`/mail/neu?${new URLSearchParams({ an, betreff, personId: personId ?? "", kundeId: kundeId ?? "", fehler: "zuoft" })}`);
  if (personId) { const p = await db.person.findUnique({ where: { id: personId } }); if (!p || (!darfKostenstelle(s, p.kostenstelleId) && p.status !== "SUCHT")) redirect("/?fehler=keine-berechtigung"); }
  if (kundeId) { const k = await db.kunde.findUnique({ where: { id: kundeId } }); if (!k || !darfKostenstelle(s, k.kostenstelleId)) redirect("/?fehler=keine-berechtigung"); }
  const f = await ladeFirma();
  const signatur = `\n\n--\n${s.name}\n${f.name} · ${f.rechtstraeger}\n${f.strasse}, ${f.plz} ${f.ort}\nTel. ${f.telefon} · ${f.email}`;
  let anhang: { filename: string; content: Buffer; contentType?: string } | undefined;
  const file = fd.get("anhang");
  if (file instanceof File && file.size > 0) anhang = { filename: file.name, content: Buffer.from(await file.arrayBuffer()), contentType: file.type || undefined };
  // Kundenprofil als Anhang: PDF frisch erzeugen, mitsenden und als Dokument bei der Person ablegen
  const profilPersonId = strOrNull(fd.get("profilPersonId"));
  let profilDokId: string | null = null; let profilPerson: { id: string; vorname: string; nachname: string; kostenstelleId: string } | null = null;
  if (profilPersonId) {
    const r = await erzeugeKundenprofil(profilPersonId, s.name);
    if (!r || !darfKostenstelle(s, r.person.kostenstelleId)) redirect("/?fehler=keine-berechtigung");
    profilPerson = r.person;
    anhang = { filename: r.dateiname, content: r.buf, contentType: "application/pdf" };
    const dok = await speichereDokument({ kostenstelleId: r.person.kostenstelleId, dateiname: `${new Date().toISOString().slice(0, 10)}_versendet_an_${an.replace(/[^a-z0-9@._-]/gi, "_")}_${r.dateiname}`, mime: "application/pdf", inhalt: r.buf, kategorie: "Kundenprofil versendet", personId: r.person.id, kundeId, hochgeladenVon: s.name });
    profilDokId = dok.id;
  }
  const empfaenger = cc ? `${an}, ${cc}` : an;
  const m = await sendeMail({ an: empfaenger, betreff, text: text + signatur, anhang, referenzTyp: personId ? "Person" : kundeId ? "Kunde" : "Mail", referenzId: personId ?? kundeId ?? undefined });
  const eintrag = `E-Mail an ${an}${cc ? ` (CC ${cc})` : ""}: „${betreff}“${anhang ? ` – Anhang ${anhang.filename}` : ""} [${m.status}]`;
  if (personId || kundeId) await db.aktivitaet.create({ data: { typ: "EMAIL", text: eintrag, nutzerName: s.name, personId, kundeId } });
  if (profilPerson) {
    const kunde = kundeId ? await db.kunde.findUnique({ where: { id: kundeId }, select: { firmenname: true } }) : null;
    const txt = `Kundenprofil versendet an ${an}${kunde ? ` (${kunde.firmenname})` : ""} – „${betreff}“ [${m.status}]`;
    await db.aktivitaet.create({ data: { typ: "PROFIL", text: txt + (profilDokId ? " – Kopie unter Dokumente" : ""), nutzerName: s.name, personId: profilPerson.id } });
    if (kundeId && personId !== profilPerson.id) await db.aktivitaet.create({ data: { typ: "PROFIL", text: `Kundenprofil ${profilPerson.vorname} ${profilPerson.nachname} versendet an ${an}`, nutzerName: s.name, kundeId } });
    revalidatePath(`/personen/${profilPerson.id}`);
  }
  await audit(s, "SEND", personId ? "Person" : "Kunde", personId ?? kundeId ?? an, eintrag);
  if (personId) revalidatePath(`/personen/${personId}`); if (kundeId) revalidatePath(`/kunden/${kundeId}`);
  redirect(`${zurueck}${zurueck.includes("?") ? "&" : "?"}mail=${m.status}`);
}
