"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, darfKostenstelle, requireRolle } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { einstellung, setEinstellung } from "@/lib/einstellungen";
import { str, strOrNull, parseNum } from "@/lib/format";
import { EMPFEHLUNG_DEFAULT, type EmpfehlungConfig } from "@/lib/empfehlung";
import type { EmpfehlungStatus } from "@/generated/prisma/enums";

/** Status einer Empfehlung setzen; bei „eingestellt“ Person verknüpfen und Prämien-Fälligkeit berechnen */
export async function empfehlungStatus(id: string, fd: FormData) {
  const s = await requireSession();
  const e = await db.empfehlung.findUnique({ where: { id }, include: { werber: true } });
  if (!e || !darfKostenstelle(s, e.werber.kostenstelleId)) redirect("/empfehlungen?fehler=berechtigung");
  const status = str(fd.get("status")) as EmpfehlungStatus;
  const cfg = { ...EMPFEHLUNG_DEFAULT, ...(await einstellung<Partial<EmpfehlungConfig>>("empfehlung", {})) };
  const data: Record<string, unknown> = { status };
  if (status === "EINGESTELLT") {
    const personId = strOrNull(fd.get("empfohlenePersonId"));
    const eingestelltAm = new Date();
    data.empfohlenePersonId = personId; data.eingestelltAm = eingestelltAm; data.praemieBetrag = cfg.praemieWerber;
    data.faelligAm = new Date(eingestelltAm.getFullYear(), eingestelltAm.getMonth() + cfg.praemieNachMonaten, eingestelltAm.getDate());
  }
  if (status === "AUSBEZAHLT") {
    // Die Prämie trägt die Zentrale und mindert deren DB1 im Monat der Auszahlung (Entscheidung Matthias, 30.08.2026)
    const heute = new Date();
    data.ausbezahltAm = heute;
    data.belastetJahr = heute.getFullYear();
    data.belastetMonat = heute.getMonth() + 1;
    if (e.praemieBetrag == null) data.praemieBetrag = cfg.praemieWerber;
  }
  await db.empfehlung.update({ where: { id }, data });
  await db.aufgabe.updateMany({ where: { referenzTyp: "Empfehlung", referenzId: id, erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  const TEXT: Record<string, string> = { KONTAKTIERT: `Wir haben ${e.name} kontaktiert – danke für deine Empfehlung!`, EINGESTELLT: `${e.name} ist bei uns eingestellt. Deine Prämie von ${cfg.praemieWerber} € wird fällig, sobald ${e.name} ${cfg.praemieNachMonaten} Monate im Einsatz ist.`, PRAEMIE_FAELLIG: `Deine Empfehlungsprämie für ${e.name} ist fällig und kommt mit der nächsten Lohnabrechnung.`, AUSBEZAHLT: `Deine Empfehlungsprämie für ${e.name} wurde ausbezahlt – danke, dass du uns weiterempfiehlst!`, ABGELEHNT: `Leider hat es mit ${e.name} diesmal nicht gepasst – trotzdem danke fürs Empfehlen.` };
  if (TEXT[status]) await db.nachricht.create({ data: { personId: e.werberId, vonMitarbeiter: false, nutzerName: s.name, text: TEXT[status] } });
  await audit(s, "STATUS", "Empfehlung", id, `${e.name} → ${status}`, undefined, e.werber.kostenstelleId);
  revalidatePath("/empfehlungen"); revalidatePath("/app/empfehlen");
  redirect("/empfehlungen?ok=1");
}

/** Programm-Einstellungen (Zentrale/Admin) */
export async function empfehlungKonfig(fd: FormData) {
  const s = await requireRolle("SYSTEMADMIN", "ZENTRALE");
  const cfg: EmpfehlungConfig = { aktiv: fd.get("aktiv") === "on", praemieWerber: parseNum(fd.get("praemieWerber")) ?? 100, praemieGeworbener: parseNum(fd.get("praemieGeworbener")) ?? 0, praemieNachMonaten: parseNum(fd.get("praemieNachMonaten")) ?? 3, bonusJeAnzahl: parseNum(fd.get("bonusJeAnzahl")) ?? 5, bonusBetrag: parseNum(fd.get("bonusBetrag")) ?? 100, bedingungen: str(fd.get("bedingungen")) || EMPFEHLUNG_DEFAULT.bedingungen };
  await setEinstellung("empfehlung", cfg);
  await audit(s, "UPDATE", "Einstellung", "empfehlung", `Empfehlungsprogramm: ${cfg.aktiv ? "aktiv" : "pausiert"}, ${cfg.praemieWerber} € nach ${cfg.praemieNachMonaten} Monaten, ${cfg.bonusBetrag} € Bonus je ${cfg.bonusJeAnzahl} Empfehlungen`);
  revalidatePath("/empfehlungen"); revalidatePath("/app/empfehlen");
  redirect("/empfehlungen?ok=1");
}
