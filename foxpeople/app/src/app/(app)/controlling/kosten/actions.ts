"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, istZentrale } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseNum, str, strOrNull } from "@/lib/format";
import { fixkostenUebernehmen } from "@/lib/kosten";

/** Kosten sind Sache der Zentrale – Kostenstellen sehen weder DB1 noch die Kostenbasis. */
async function zentrale() {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/controlling?fehler=berechtigung");
  return s;
}

export async function kostenSpeichern(fd: FormData) {
  const s = await zentrale();
  const id = strOrNull(fd.get("id"));
  const jahr = Number(parseNum(fd.get("jahr")) ?? new Date().getFullYear());
  const monat = Number(parseNum(fd.get("monat")) ?? new Date().getMonth() + 1);
  const bezeichnung = str(fd.get("bezeichnung"));
  const betrag = parseNum(fd.get("betrag")) ?? 0;
  if (!bezeichnung) redirect(`/controlling/kosten?jahr=${jahr}&monat=${monat}&fehler=pflicht`);
  const data = { jahr, monat, bezeichnung, kategorie: str(fd.get("kategorie")) || "Sonstiges", betrag, fix: fd.get("fix") !== "variabel", notiz: strOrNull(fd.get("notiz")) };
  const k = id ? await db.kostenposition.update({ where: { id }, data }) : await db.kostenposition.create({ data });
  await audit(s, id ? "UPDATE" : "CREATE", "Kostenposition", k.id, `${k.bezeichnung} ${k.betrag.toFixed(2)} € (${k.monat}/${k.jahr}, ${k.fix ? "fix" : "variabel"})`);
  revalidatePath("/controlling/kosten");
  redirect(`/controlling/kosten?jahr=${jahr}&monat=${monat}&ok=1`);
}

export async function kostenLoeschen(id: string, jahr: number, monat: number) {
  const s = await zentrale();
  const k = await db.kostenposition.findUnique({ where: { id } });
  if (k) {
    await db.kostenposition.delete({ where: { id } });
    await audit(s, "DELETE", "Kostenposition", id, `${k.bezeichnung} ${k.betrag.toFixed(2)} €`);
  }
  revalidatePath("/controlling/kosten");
  redirect(`/controlling/kosten?jahr=${jahr}&monat=${monat}`);
}

/** Fixkosten des Monats in den Folgemonat übernehmen. */
export async function fixkostenWeiter(jahr: number, monat: number) {
  const s = await zentrale();
  const n = await fixkostenUebernehmen(jahr, monat);
  await audit(s, "CREATE", "Kostenposition", null, `${n} Fixkosten aus ${monat}/${jahr} in den Folgemonat übernommen`);
  revalidatePath("/controlling/kosten");
  const zielMonat = monat === 12 ? 1 : monat + 1;
  const zielJahr = monat === 12 ? jahr + 1 : jahr;
  redirect(`/controlling/kosten?jahr=${zielJahr}&monat=${zielMonat}&uebernommen=${n}`);
}
