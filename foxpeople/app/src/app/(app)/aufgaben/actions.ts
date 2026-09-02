"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, darfKostenstelle, zielKostenstelle } from "@/lib/auth";
import { parseDate, str, strOrNull } from "@/lib/format";

export async function aufgabeErledigt(id: string) {
  const s = await requireSession();
  const a = await db.aufgabe.findUnique({ where: { id } });
  if (a && darfKostenstelle(s, a.kostenstelleId)) await db.aufgabe.update({ where: { id }, data: { erledigt: true, erledigtAm: new Date() } });
  revalidatePath("/aufgaben"); revalidatePath("/");
}
export async function aufgabeAnlegen(fd: FormData) {
  const s = await requireSession();
  const kostenstelleId = zielKostenstelle(s, strOrNull(fd.get("kostenstelleId")));
  await db.aufgabe.create({ data: { kostenstelleId, typ: "MANUELL", titel: str(fd.get("titel")), faelligAm: parseDate(fd.get("faelligAm")) ?? new Date(), nutzerId: s.nutzerId, referenzTyp: "Manuell", referenzId: `${Date.now()}` } });
  revalidatePath("/aufgaben");
  redirect("/aufgaben");
}
