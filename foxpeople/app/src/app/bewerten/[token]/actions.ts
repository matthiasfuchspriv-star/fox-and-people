"use server";
import { merkmaleAusForm } from "@/lib/bewertung";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { parseNum, str, strOrNull } from "@/lib/format";

export async function bewertungAbgeben(token: string, fd: FormData) {
  const a = await db.bewertungsAnfrage.findUnique({ where: { tokenHash: sha256(token) }, include: { kunde: { include: { ansprechpartner: true } } } });
  if (!a || a.gultigBis < new Date() || a.erledigtAm) redirect(`/bewerten/${token}`);
  const ap = a.kunde.ansprechpartner.find((x) => x.email === a.an);
  await db.bewertung.create({ data: { personId: a.personId, kundeId: a.kundeId, einsatzId: a.einsatzId, sterne: Math.min(5, Math.max(1, parseNum(fd.get("sterne")) ?? 4)), kommentar: strOrNull(fd.get("kommentar")), merkmale: merkmaleAusForm(fd), wiedereinsatzEmpfohlen: fd.get("wiedereinsatz") === "on", erfasstVon: `Kunde: ${ap?.name ?? a.an}` } });
  await db.bewertungsAnfrage.update({ where: { id: a.id }, data: { erledigtAm: new Date() } });
  await db.aufgabe.updateMany({ where: { typ: "BEWERTUNG_OFFEN", personId: a.personId, kundeId: a.kundeId, erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Kundenbewertung erhalten (${str(fd.get("sterne"))} Sterne) von ${a.kunde.firmenname}`, nutzerName: "Kundenlink", personId: a.personId } });
  redirect(`/bewerten/${token}?danke=1`);
}
