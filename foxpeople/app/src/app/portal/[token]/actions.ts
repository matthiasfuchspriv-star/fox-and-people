"use server";
import { merkmaleAusForm } from "@/lib/bewertung";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { parseNum, str, strOrNull } from "@/lib/format";

export async function kundeBewertenPortal(token: string, fd: FormData) {
  const t = await db.portalToken.findUnique({ where: { tokenHash: sha256(token) }, include: { person: { select: { appGesperrtAm: true, status: true } } } });
  if (!t || t.gultigBis < new Date() || t.person.appGesperrtAm || t.person.status === "AUSGESCHIEDEN" || t.person.status === "GESPERRT") redirect(`/portal/${token}`);
  const kundeId = str(fd.get("kundeId"));
  const e = await db.einsatz.findFirst({ where: { personId: t.personId, kundeId } });
  if (!e) redirect(`/portal/${token}`);
  await db.kundenBewertung.create({ data: { kundeId, personId: t.personId, einsatzId: e.id, sterne: Math.min(5, Math.max(1, parseNum(fd.get("sterne")) ?? 4)), kommentar: strOrNull(fd.get("kommentar")), merkmale: merkmaleAusForm(fd), wiederArbeiten: fd.get("wieder") === "on", quelle: "PORTAL" } });
  redirect(`/portal/${token}?danke=1`);
}
