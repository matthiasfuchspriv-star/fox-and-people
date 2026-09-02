"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRolle } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { frageAssistent, wissenImportieren, erzeugeMonatsreport } from "@/lib/wissen";
import { str, strOrNull, parseNum } from "@/lib/format";
import { randomToken } from "@/lib/crypto";

const admin = () => requireRolle("SYSTEMADMIN");

export async function frageStellen(unterhaltungId: string | null, frage: string): Promise<{ unterhaltungId: string; antwort: string; quellen: { titel: string; text: string; kategorie: string }[]; modus: string; fehler?: string }> {
  const s = await admin();
  const uid = unterhaltungId || randomToken(8);
  const verlauf = await db.assistentNachricht.findMany({ where: { unterhaltungId: uid }, orderBy: { erstelltAm: "asc" } });
  await db.assistentNachricht.create({ data: { unterhaltungId: uid, nutzerId: s.nutzerId, rolle: "user", text: frage } });
  try {
    const r = await frageAssistent(frage, verlauf.map((m) => ({ rolle: m.rolle, text: m.text })));
    await db.assistentNachricht.create({ data: { unterhaltungId: uid, nutzerId: s.nutzerId, rolle: "assistant", text: r.antwort, quellen: r.quellen.map((q) => ({ titel: q.titel, index: q.index, kategorie: q.kategorie })) } });
    return { unterhaltungId: uid, antwort: r.antwort, quellen: r.quellen.map((q) => ({ titel: q.titel, text: q.text.slice(0, 400), kategorie: q.kategorie })), modus: r.modus };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { unterhaltungId: uid, antwort: "", quellen: [], modus: "fehler", fehler: msg };
  }
}

export async function wissenHochladen(fd: FormData) {
  const s = await admin();
  const files = fd.getAll("dateien").filter((f): f is File => f instanceof File && f.size > 0);
  const kategorie = str(fd.get("kategorie")) || "Firmenwissen";
  let n = 0;
  for (const f of files) {
    const r = await wissenImportieren(Buffer.from(await f.arrayBuffer()), f.name, f.type, kategorie, strOrNull(fd.get("titel")) ?? undefined);
    await audit(s, "IMPORT", "WissenDokument", r.doc.id, `${f.name}: ${r.chunks} Abschnitte, ${r.zeichen} Zeichen`);
    n++;
  }
  revalidatePath("/assistent");
  redirect(`/assistent?tab=wissen&ok=${n}`);
}

export async function wissenLoeschen(id: string) {
  const s = await admin();
  await db.wissenDokument.delete({ where: { id } });
  await audit(s, "DELETE", "WissenDokument", id);
  revalidatePath("/assistent");
}

export async function reportErzeugen(fd: FormData) {
  const s = await admin();
  const jahr = parseNum(fd.get("jahr")) ?? new Date().getFullYear();
  const monat = parseNum(fd.get("monat")) ?? new Date().getMonth() + 1;
  const r = await erzeugeMonatsreport(jahr, monat, strOrNull(fd.get("kostenstelleId")) ?? undefined, s.name);
  await audit(s, "CREATE", "Monatsreport", r.id, `${monat}/${jahr}`);
  redirect(`/assistent/reports?id=${r.id}`);
}
