"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { str, strOrNull, parseNum, parseDate } from "@/lib/format";

/** Nur die Zentrale/Systemadmin pflegt Kollektivverträge – sie gelten mandantenübergreifend. */
async function wache() {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  return s;
}

export async function kvAnlegen(fd: FormData) {
  const s = await wache();
  const name = str(fd.get("name"));
  const kuerzel = str(fd.get("kuerzel"));
  if (!name || !kuerzel) redirect("/kollektivvertraege?fehler=pflicht");
  const kv = await db.kollektivvertrag.create({
    data: {
      name, kuerzel,
      gultigAb: parseDate(fd.get("gultigAb")) ?? new Date(),
      wochenstunden: parseNum(fd.get("wochenstunden")) ?? 38.5,
      monatsteiler: parseNum(fd.get("monatsteiler")) ?? 167,
      istReferenz: fd.get("istReferenz") === "on",
      gruppe: str(fd.get("gruppe")) || "ARBEITER",
      hinweis: strOrNull(fd.get("hinweis")),
    },
  });
  await audit(s, "CREATE", "Kollektivvertrag", kv.id, `${name} (${kuerzel}) angelegt`);
  revalidatePath("/kollektivvertraege");
  redirect(`/kollektivvertraege/${kv.id}`);
}

export async function kvSpeichern(id: string, fd: FormData) {
  const s = await wache();
  const name = str(fd.get("name"));
  const kuerzel = str(fd.get("kuerzel"));
  if (!name || !kuerzel) redirect(`/kollektivvertraege/${id}?fehler=pflicht`);
  await db.kollektivvertrag.update({
    where: { id },
    data: {
      name, kuerzel,
      gultigAb: parseDate(fd.get("gultigAb")) ?? undefined,
      wochenstunden: parseNum(fd.get("wochenstunden")) ?? 38.5,
      monatsteiler: parseNum(fd.get("monatsteiler")) ?? 167,
      istReferenz: fd.get("istReferenz") === "on",
      referenzzuschlagPruefen: fd.get("referenzzuschlagPruefen") === "on",
      gruppe: str(fd.get("gruppe")) || "ARBEITER",
      hinweis: strOrNull(fd.get("hinweis")),
    },
  });
  await audit(s, "UPDATE", "Kollektivvertrag", id, `${name} (${kuerzel}) bearbeitet`);
  revalidatePath(`/kollektivvertraege/${id}`);
  redirect(`/kollektivvertraege/${id}?ok=1`);
}

export async function kvLoeschen(id: string) {
  const s = await wache();
  const genutzt = await db.person.count({ where: { kvId: id } });
  const kunden = await db.kunde.count({ where: { OR: [{ referenzKvId: id }, { referenzKvAngestellteId: id }] } });
  if (genutzt > 0 || kunden > 0) redirect(`/kollektivvertraege/${id}?fehler=${encodeURIComponent("Kollektivvertrag ist noch bei Mitarbeitern oder Kunden verknüpft – dort zuerst umhängen.")}`);
  await db.kollektivvertrag.delete({ where: { id } }); // Lohnstufen hängen per Cascade dran
  await audit(s, "DELETE", "Kollektivvertrag", id, "Kollektivvertrag gelöscht");
  revalidatePath("/kollektivvertraege");
  redirect("/kollektivvertraege?geloescht=1");
}

/** Lohnstufe anlegen oder ändern (stufeId leer = neu). */
export async function lohnstufeSpeichern(kvId: string, fd: FormData) {
  const s = await wache();
  const bg = str(fd.get("beschaeftigungsgruppe"));
  if (!bg) redirect(`/kollektivvertraege/${kvId}?fehler=gruppe`);
  const data = {
    beschaeftigungsgruppe: bg,
    bezeichnung: strOrNull(fd.get("bezeichnung")),
    mindestStundenlohn: parseNum(fd.get("mindestStundenlohn")),
    mindestMonatsbrutto: parseNum(fd.get("mindestMonatsbrutto")),
    referenzzuschlagProzent: parseNum(fd.get("referenzzuschlagProzent")),
    gultigAb: parseDate(fd.get("gultigAb")),
  };
  const stufeId = strOrNull(fd.get("stufeId"));
  if (stufeId) {
    const vorhanden = await db.kvLohnstufe.findUnique({ where: { id: stufeId }, select: { kvId: true } });
    if (!vorhanden || vorhanden.kvId !== kvId) redirect(`/kollektivvertraege/${kvId}`);
    await db.kvLohnstufe.update({ where: { id: stufeId }, data });
  } else {
    await db.kvLohnstufe.create({ data: { kvId, ...data } });
  }
  await audit(s, "UPDATE", "Kollektivvertrag", kvId, `Lohnstufe ${bg} ${stufeId ? "geändert" : "angelegt"}`);
  revalidatePath(`/kollektivvertraege/${kvId}`);
  redirect(`/kollektivvertraege/${kvId}?ok=1`);
}

export async function lohnstufeLoeschen(kvId: string, stufeId: string) {
  const s = await wache();
  // deleteMany bindet die Stufe an ihren KV – keine fremde Stufe über eine geratene ID löschbar.
  await db.kvLohnstufe.deleteMany({ where: { id: stufeId, kvId } });
  await audit(s, "UPDATE", "Kollektivvertrag", kvId, "Lohnstufe gelöscht");
  revalidatePath(`/kollektivvertraege/${kvId}`);
  redirect(`/kollektivvertraege/${kvId}`);
}
