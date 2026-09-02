"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, darfKostenstelle } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushAn, PUSH_TEXTE } from "@/lib/push";
import { str } from "@/lib/format";

/** Antwort der Disposition im Chat */
export async function antwortSenden(personId: string, fd: FormData) {
  const s = await requireSession();
  const p = await db.person.findUnique({ where: { id: personId } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId)) redirect("/nachrichten?fehler=berechtigung");
  const text = str(fd.get("text"));
  if (text) {
    await db.nachricht.create({ data: { personId, vonMitarbeiter: false, text: text.slice(0, 2000), nutzerName: s.name } });
    await pushAn(personId, PUSH_TEXTE.CHAT(text.slice(0, 120))).catch(() => undefined);
  }
  await db.nachricht.updateMany({ where: { personId, vonMitarbeiter: true, gelesenAm: null }, data: { gelesenAm: new Date() } });
  revalidatePath("/nachrichten"); revalidatePath("/app/chat");
  redirect(`/nachrichten?person=${personId}`);
}
