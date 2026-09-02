"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, darfKostenstelle, zielKostenstelle, darfSensibel } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { naechsteNummer } from "@/lib/nummern";
import { aktuelleSaetze, firma as ladeFirma } from "@/lib/einstellungen";
import { berechneAngebotsposition, monatsstunden } from "@/lib/angebot-kalkulation";
import { parseDate, str, strOrNull, datum } from "@/lib/format";
import { sendeMail } from "@/lib/mail";
import { anredeZeile, grussformel, duSie } from "@/lib/anrede";
import { speichereDokument } from "@/lib/storage";
import { angebotPdfBuffer } from "./pdf";
import type { AngebotStatus, Kalkulationsart } from "@/generated/prisma/enums";

async function lade(id: string) {
  const s = await requireSession();
  const a = await db.angebot.findUnique({ where: { id }, include: { kunde: { include: { ansprechpartner: true } }, positionen: { orderBy: { reihenfolge: "asc" } }, kostenstelle: true } });
  if (!a || !darfKostenstelle(s, a.kostenstelleId)) redirect("/angebote?fehler=nicht-gefunden");
  return { s, a };
}

export async function angebotAnlegen(fd: FormData) {
  const s = await requireSession();
  const kundeId = str(fd.get("kundeId"));
  const k = await db.kunde.findUnique({ where: { id: kundeId }, include: { kostenstelle: true } });
  if (!k || !darfKostenstelle(s, k.kostenstelleId)) redirect("/angebote/neu?fehler=kunde");
  const kostenstelleId = zielKostenstelle(s, k.kostenstelleId);
  const f = await ladeFirma();
  const nummer = await naechsteNummer(kostenstelleId, "AN");
  const a = await db.angebot.create({ data: { kostenstelleId, kundeId, nummer, betreff: str(fd.get("betreff")) || "Angebot Arbeitskräfteüberlassung", bundesland: k.kostenstelle.bundesland, gultigBis: new Date(Date.now() + f.angebotGueltigTage * 86400000), erstelltVon: s.name } });
  await audit(s, "CREATE", "Angebot", a.id, `${nummer} für ${k.firmenname}`, undefined, kostenstelleId);
  redirect(`/angebote/${a.id}`);
}

export interface PositionInput { id?: string; kalkulationsart: Kalkulationsart; rolle: string; anzahlPersonen: number; stundenlohn: number | null; bruttogehalt: number | null; wochenstunden: number | null; stundenProMonat: number | null; verrechnungssatz: number | null; aufschlagMonat: number | null; honorar: number | null; kvId: string | null; beschaeftigungsgruppe: string | null; zuschlag50: number | null; zuschlag100: number | null; zulagenIds: string[] }

export async function angebotSpeichern(id: string, kopf: { betreff: string; gultigBis: string; bundesland: string; einleitung: string; schlusstext: string; stundennachweisVomKunden: boolean }, positionen: PositionInput[]) {
  const { s, a } = await lade(id);
  if (a.status !== "ENTWURF") return { ok: false, fehler: "Nur Entwürfe können bearbeitet werden." };
  const { saetze, setId } = await aktuelleSaetze(kopf.bundesland || a.bundesland);
  const kvs = await db.kvLohnstufe.findMany();
  // Werte aus dem Browser nachprüfen: Der Editor ist eine Hilfe, kein Torwächter. Ein negativer
  // Zuschlag oder 500 Wochenstunden dürfen nicht in ein Angebot geraten, das an einen Kunden geht.
  const zulagenAusStamm = new Set((await db.zulage.findMany({ where: { aktiv: true, weiterverrechnen: true }, select: { id: true } })).map((z) => z.id));
  const grenze = (n: number | null | undefined, min: number, max: number, standard: number) =>
    n == null || !Number.isFinite(n) ? standard : Math.min(max, Math.max(min, n));
  await db.$transaction(async (tx) => {
    await tx.angebot.update({ where: { id }, data: { betreff: kopf.betreff, gultigBis: kopf.gultigBis ? new Date(kopf.gultigBis) : null, bundesland: kopf.bundesland || null, einleitung: kopf.einleitung || null, schlusstext: kopf.schlusstext || null, satzSetId: setId, stundennachweisVomKunden: !!kopf.stundennachweisVomKunden } });
    await tx.angebotsposition.deleteMany({ where: { angebotId: id } });
    for (const [i, p] of positionen.entries()) {
      const stufe = kvs.find((k) => k.kvId === p.kvId && k.beschaeftigungsgruppe === p.beschaeftigungsgruppe);
      const mindestlohn = p.kalkulationsart === "PAYROLL" ? stufe?.mindestMonatsbrutto ?? null : stufe?.mindestStundenlohn ?? null;
      // Ein Angebot gilt für eine Gruppe, nicht für eine Kopfzahl: intern immer eine Person je Position.
      const wochenstunden = p.wochenstunden == null ? null : grenze(p.wochenstunden, 0, 80, 38.5);
      const std = monatsstunden(wochenstunden);
      const kalk = berechneAngebotsposition({ ...p, anzahlPersonen: 1, stundenProMonat: std, mindestlohn }, saetze);
      await tx.angebotsposition.create({ data: { angebotId: id, reihenfolge: i, kalkulationsart: p.kalkulationsart, rolle: p.rolle, anzahlPersonen: 1, stundenlohn: p.stundenlohn, bruttogehalt: p.bruttogehalt, wochenstunden, stundenProMonat: std, verrechnungssatz: p.verrechnungssatz, aufschlagMonat: p.aufschlagMonat, honorar: p.honorar, kvId: p.kvId, beschaeftigungsgruppe: p.beschaeftigungsgruppe, zuschlag50: grenze(p.zuschlag50, 0, 5, 0.35), zuschlag100: grenze(p.zuschlag100, 0, 5, 0.7), zulagenIds: (p.zulagenIds ?? []).filter((z) => zulagenAusStamm.has(z)).slice(0, 30), kalkulation: JSON.parse(JSON.stringify(kalk)) } });
    }
  });
  await audit(s, "UPDATE", "Angebot", id, `${a.nummer} gespeichert (${positionen.length} Positionen)`, undefined, a.kostenstelleId);
  revalidatePath(`/angebote/${id}`);
  return { ok: true };
}

export async function angebotStatus(id: string, fd: FormData) {
  const { s, a } = await lade(id);
  const status = str(fd.get("status")) as AngebotStatus;
  await db.angebot.update({ where: { id }, data: { status, entschiedenAm: ["ANGENOMMEN", "ABGELEHNT"].includes(status) ? new Date() : null } });
  if (status === "ANGENOMMEN") {
    // Verrechnungssätze des Angebots als Kundenkonditionen je Rolle hinterlegen – Basis für Einsatz und Rechnung
    const pos = await db.angebotsposition.findMany({ where: { angebotId: id, verrechnungssatz: { not: null } } });
    for (const p of pos) {
      const daten = { stundensatz: p.verrechnungssatz!, ueberstundenZuschlag: p.zuschlag50, wochenendZuschlag: p.zuschlag100 };
      const vorhanden = await db.kondition.findFirst({ where: { kundeId: a.kundeId, rolle: { equals: p.rolle, mode: "insensitive" } } });
      if (vorhanden) await db.kondition.update({ where: { id: vorhanden.id }, data: daten });
      else await db.kondition.create({ data: { kundeId: a.kundeId, rolle: p.rolle, ...daten } });
    }
    // Vereinbarung zum Stundennachweis gilt ab jetzt für den Kunden – davon hängt ab, ob ein Freigabe-Link hinausgeht
    await db.kunde.update({ where: { id: a.kundeId }, data: { stundennachweisVomKunden: a.stundennachweisVomKunden } });
  }
  await audit(s, "STATUS", "Angebot", id, `${a.status} → ${status}`, undefined, a.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "ANGEBOT", text: `Angebot ${a.nummer}: ${status.toLowerCase()}`, nutzerName: s.name, kundeId: a.kundeId } });
  revalidatePath(`/angebote/${id}`);
  redirect(`/angebote/${id}`);
}

export async function angebotVersenden(id: string, fd: FormData) {
  const { s, a } = await lade(id);
  if (!darfSensibel(s)) redirect(`/angebote/${id}?fehler=berechtigung`);
  const an = str(fd.get("an")) || a.kunde.email || "";
  if (!an) redirect(`/angebote/${id}?fehler=email`);
  const pdf = await angebotPdfBuffer(id);
  const doc = await speichereDokument({ kostenstelleId: a.kostenstelleId, dateiname: `Angebot_${a.nummer}.pdf`, mime: "application/pdf", inhalt: pdf, kategorie: "Angebot", kundeId: a.kundeId, angebotId: id, hochgeladenVon: s.name });
  const f = await ladeFirma();
  const ap = a.kunde.ansprechpartner.find((x) => x.email && x.email.toLowerCase() === an.toLowerCase()) ?? a.kunde.ansprechpartner.find((x) => x.istHaupt) ?? a.kunde.ansprechpartner[0];
  const w = duSie(ap, a.kunde.anredeDu);
  const text = str(fd.get("text")) || `${anredeZeile(ap, a.kunde.anredeDu)}\n\nanbei ${w.haben === "hast" ? "bekommst du" : "erhalten Sie"} unser Angebot ${a.nummer} (${a.betreff}), gültig bis ${datum(a.gultigBis)}.\n\nFür Rückfragen ${w.haben === "hast" ? "melde dich einfach" : "stehen wir gerne zur Verfügung"}.\n\n${grussformel(ap, a.kunde.anredeDu)}\n${s.name}\n${f.name} · ${f.rechtstraeger}\n${f.telefon} · ${f.email}`;
  const r = await sendeMail({ an, betreff: `Angebot ${a.nummer} – ${a.betreff}`, text, anhang: { filename: `Angebot_${a.nummer}.pdf`, content: pdf, contentType: "application/pdf" }, referenzTyp: "Angebot", referenzId: id });
  await db.angebot.update({ where: { id }, data: { status: "VERSENDET", versendetAm: new Date(), versendetAn: an, pdfDokumentId: doc.id } });
  await audit(s, "SEND", "Angebot", id, `${a.nummer} an ${an} (${r.status})`, undefined, a.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "ANGEBOT", text: `Angebot ${a.nummer} an ${an} versendet${r.status === "TEST" ? " (Testmodus – nicht zugestellt)" : ""}`, nutzerName: s.name, kundeId: a.kundeId } });
  revalidatePath(`/angebote/${id}`);
  redirect(`/angebote/${id}?gesendet=${r.status}`);
}

export async function angebotKopieren(id: string) {
  const { s, a } = await lade(id);
  const nummer = await naechsteNummer(a.kostenstelleId, "AN");
  const f = await ladeFirma();
  const n = await db.angebot.create({ data: { kostenstelleId: a.kostenstelleId, kundeId: a.kundeId, nummer, betreff: a.betreff, einleitung: a.einleitung, schlusstext: a.schlusstext, bundesland: a.bundesland, gultigBis: new Date(Date.now() + f.angebotGueltigTage * 86400000), erstelltVon: s.name, stundennachweisVomKunden: a.stundennachweisVomKunden, positionen: { create: a.positionen.map((p) => ({ reihenfolge: p.reihenfolge, kalkulationsart: p.kalkulationsart, rolle: p.rolle, anzahlPersonen: p.anzahlPersonen, stundenlohn: p.stundenlohn, bruttogehalt: p.bruttogehalt, wochenstunden: p.wochenstunden, stundenProMonat: p.stundenProMonat, verrechnungssatz: p.verrechnungssatz, aufschlagMonat: p.aufschlagMonat, honorar: p.honorar, kvId: p.kvId, beschaeftigungsgruppe: p.beschaeftigungsgruppe, zuschlag50: p.zuschlag50, zuschlag100: p.zuschlag100, zulagenIds: p.zulagenIds, kalkulation: p.kalkulation ?? undefined })) } } });
  await audit(s, "CREATE", "Angebot", n.id, `${nummer} kopiert aus ${a.nummer}`, undefined, a.kostenstelleId);
  redirect(`/angebote/${n.id}`);
}
