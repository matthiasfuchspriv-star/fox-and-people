"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { merkmaleAusForm } from "@/lib/bewertung";
import { portalGueltig } from "@/lib/kundenportal";
import { parseNum, str, strOrNull } from "@/lib/format";
import { berechneWoche, wochentage } from "@/lib/zeitaufzeichnung";
import { eintraegeAus } from "@/lib/nachweis-pdf";
import { montagDerKw } from "@/lib/wochen";

async function portal(token: string) {
  const t = await db.kundenPortalToken.findUnique({ where: { tokenHash: sha256(token) }, include: { kunde: true } });
  if (!t || !portalGueltig(t)) redirect(`/kundenportal/${token}`);
  return t;
}

/**
 * Welche Personen darf dieser Beschäftiger überhaupt anfassen? Nur die, die bei ihm im Einsatz sind
 * oder waren. Ohne diese Prüfung könnte jemand mit gültigem Link fremde Stundennachweise freigeben
 * und fremde Mitarbeiter bewerten, indem er einfach eine andere ID ins Formular schreibt.
 */
async function eigenePersonen(kundeId: string): Promise<Set<string>> {
  const e = await db.einsatz.findMany({ where: { kundeId }, select: { personId: true } });
  return new Set(e.map((x) => x.personId));
}

/** Der Beschäftiger gibt die Wochenstunden frei – das ersetzt die Unterschrift auf dem Papierzettel (AGB Punkt 4.7). */
export async function stundenFreigeben(token: string, fd: FormData) {
  const t = await portal(token);
  const jahr = Number(fd.get("jahr")); const kw = Number(fd.get("kw"));
  const ids = fd.getAll("nachweisId").map(String);
  const name = str(fd.get("name")) || t.name || t.an;
  const erlaubt = await eigenePersonen(t.kundeId);
  let freigegeben = 0;
  for (const id of ids) {
    if (fd.get(`ok_${id}`) !== "on") continue;
    const n = await db.stundennachweis.findUnique({ where: { id }, include: { person: true } });
    if (!n || n.jahr !== jahr || n.kw !== kw) continue;
    if (!erlaubt.has(n.personId)) continue; // fremder Mitarbeiter – nicht freigebbar
    const w = berechneWoche(eintraegeAus(n), { daten: wochentage(n.jahr, n.kw).map((x) => x.datum), wochennormal: n.person.wochenstunden ?? 38.5 });
    await db.stundennachweis.update({ where: { id }, data: { bestaetigtVon: name, bestaetigtAm: new Date(), quelle: "PORTAL", summeNormal: w.normal, summeUe50: w.ue50, summeUe100: w.ue100 } });
    await db.aktivitaet.create({ data: { typ: "STATUS", text: `Stundennachweis KW ${kw}/${jahr} vom Beschäftiger ${t.kunde.firmenname} freigegeben (${name})`, nutzerName: "Kundenportal", personId: n.personId } });
    freigegeben++;
  }
  // Anmerkung des Beschäftigers als Aufgabe für die Dispo
  const anmerkung = strOrNull(fd.get("anmerkung"));
  if (anmerkung) await db.aufgabe.create({ data: { kostenstelleId: t.kunde.kostenstelleId, typ: "MANUELL", titel: `Rückmeldung ${t.kunde.firmenname} zur KW ${kw}/${jahr}: ${anmerkung}`, faelligAm: new Date(), kundeId: t.kundeId } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Kundenportal: ${freigegeben} Stundennachweis(e) der KW ${kw}/${jahr} freigegeben von ${name}`, nutzerName: "Kundenportal", kundeId: t.kundeId } });
  revalidatePath("/stundennachweise");
  redirect(`/kundenportal/${token}?ok=${freigegeben}`);
}

/** Kurzbewertung eines überlassenen Mitarbeiters durch den Beschäftiger. */
export async function portalBewerten(token: string, fd: FormData) {
  const t = await portal(token);
  const personId = str(fd.get("personId"));
  if (!personId) redirect(`/kundenportal/${token}`);
  const erlaubt = await eigenePersonen(t.kundeId);
  if (!erlaubt.has(personId)) redirect(`/kundenportal/${token}`); // nur eigene überlassene Mitarbeiter
  const name = str(fd.get("name")) || t.name || t.an;
  await db.bewertung.create({ data: {
    personId, kundeId: t.kundeId,
    sterne: Math.min(5, Math.max(1, parseNum(fd.get("sterne")) ?? 4)),
    kommentar: strOrNull(fd.get("kommentar")), merkmale: merkmaleAusForm(fd),
    wiedereinsatzEmpfohlen: fd.get("wiedereinsatz") === "on",
    erfasstVon: `Kunde: ${name}`,
  } });
  await db.aufgabe.updateMany({ where: { typ: "BEWERTUNG_OFFEN", personId, kundeId: t.kundeId, erledigt: false }, data: { erledigt: true, erledigtAm: new Date() } });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Bewertung über das Kundenportal von ${t.kunde.firmenname} (${name})`, nutzerName: "Kundenportal", personId } });
  redirect(`/kundenportal/${token}?bewertet=1`);
}
