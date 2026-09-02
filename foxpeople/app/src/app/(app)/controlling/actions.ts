"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRolle } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseNum, str, strOrNull } from "@/lib/format";
import { setEinstellung } from "@/lib/einstellungen";
import { provisionsbelegErzeugen } from "@/lib/provisionsbeleg";

/** Controlling-Kosten je Geschäftsjahr speichern (nur Zentrale/Admin). */
export async function kostenSpeichern(fd: FormData) {
  const s = await requireRolle("SYSTEMADMIN", "ZENTRALE");
  const jahr = parseNum(fd.get("jahr"));
  const gesamtkosten = parseNum(fd.get("gesamtkosten"));
  const kostenProMitarbeiterMonat = parseNum(fd.get("kostenProMitarbeiterMonat"));
  // Beide Beträge sind freiwillig: Wer seine Kosten monatlich erfasst, braucht hier gar nichts –
  // die erfassten Positionen werden ohnehin gegen den DB1 gerechnet.
  if (!jahr) redirect("/controlling?fehler=pflicht");
  const kostenstelleId = strOrNull(fd.get("kostenstelleId")) ?? "";
  const data = { gesamtkosten: gesamtkosten ?? 0, kostenProMitarbeiterMonat: kostenProMitarbeiterMonat ?? 0, kostenProVermittlung: parseNum(fd.get("kostenProVermittlung")), notiz: strOrNull(fd.get("notiz")) };
  const k = await db.controllingkosten.upsert({ where: { jahr_kostenstelleId: { jahr, kostenstelleId } }, update: data, create: { jahr, kostenstelleId, ...data } });
  await audit(s, "UPDATE", "Controllingkosten", k.id, `Controlling-Kosten ${jahr}${kostenstelleId ? ` (Kostenstelle ${kostenstelleId})` : " (Standard)"}: gesamt ${gesamtkosten} €, je Mitarbeiter ${kostenProMitarbeiterMonat} €/Monat`);
  revalidatePath("/"); revalidatePath("/controlling");
  redirect(`/controlling?jahr=${jahr}&ok=1${kostenstelleId ? `&ks=${kostenstelleId}` : ""}`);
}

/** Planwerte je Jahr/Kostenstelle */
export async function planSpeichern(fd: FormData) {
  const s = await requireRolle("SYSTEMADMIN", "ZENTRALE");
  const jahr = parseNum(fd.get("jahr"))!;
  const kostenstelleId = strOrNull(fd.get("kostenstelleId")) ?? "";
  const data = { zielUmsatz: parseNum(fd.get("zielUmsatz")) ?? 0, zielDb1: parseNum(fd.get("zielDb1")) ?? 0, zielMitarbeiter: parseNum(fd.get("zielMitarbeiter")) ?? 0, notiz: strOrNull(fd.get("notiz")) };
  const p = await db.planwert.upsert({ where: { jahr_kostenstelleId: { jahr, kostenstelleId } }, update: data, create: { jahr, kostenstelleId, ...data } });
  await audit(s, "UPDATE", "Planwert", p.id, `Planwerte ${jahr}: Umsatz ${data.zielUmsatz}, DB1 ${data.zielDb1}`);
  revalidatePath("/controlling"); revalidatePath("/");
  redirect(`/controlling?tab=plan&jahr=${jahr}&ok=1${kostenstelleId ? `&ks=${kostenstelleId}` : ""}`);
}

/** Kontostand für die Liquiditätsvorschau */
export async function kontostandSpeichern(fd: FormData) {
  const s = await requireRolle("SYSTEMADMIN", "ZENTRALE");
  const betrag = parseNum(fd.get("betrag")) ?? 0;
  await setEinstellung("kontostand", { betrag, datum: new Date().toISOString() });
  await audit(s, "UPDATE", "Einstellung", "kontostand", `Kontostand ${betrag} € hinterlegt`);
  revalidatePath("/controlling");
  redirect("/controlling?tab=liquiditaet&ok=1");
}

/** Provisionsbeleg erzeugen (Entwurf) */
export async function provisionErzeugen(fd: FormData) {
  await requireRolle("SYSTEMADMIN", "ZENTRALE");
  const kostenstelleId = str(fd.get("kostenstelleId")); const jahr = parseNum(fd.get("jahr"))!; const monat = parseNum(fd.get("monat"))!;
  const r = await provisionsbelegErzeugen(kostenstelleId, jahr, monat);
  revalidatePath("/controlling");
  redirect(`/controlling?tab=provisionen&jahr=${jahr}&monat=${monat}${r.ok ? "&ok=1" : `&fehler=${encodeURIComponent(r.fehler)}`}`);
}

export async function provisionStatus(id: string, status: "FREIGEGEBEN" | "AUSBEZAHLT" | "ENTWURF") {
  const s = await requireRolle("SYSTEMADMIN", "ZENTRALE");
  const b = await db.provisionsabrechnung.update({ where: { id }, data: status === "FREIGEGEBEN" ? { status, freigegebenAm: new Date(), freigegebenVon: s.name } : status === "AUSBEZAHLT" ? { status, ausbezahltAm: new Date() } : { status, freigegebenAm: null, freigegebenVon: null, ausbezahltAm: null } });
  await audit(s, "UPDATE", "Provisionsabrechnung", id, `Provisionsbeleg ${b.monat}/${b.jahr} → ${status}`, undefined, b.kostenstelleId);
  revalidatePath("/controlling"); revalidatePath("/");
  redirect(`/controlling?tab=provisionen&jahr=${b.jahr}&monat=${b.monat}&ok=1`);
}
