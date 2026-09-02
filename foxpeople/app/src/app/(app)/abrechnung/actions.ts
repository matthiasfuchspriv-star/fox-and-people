"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { verrechnungAufschluesseln } from "@/lib/verrechnung";
import { sollstundenFuerEinsatz } from "@/lib/soll";
import { requireSession, darfKostenstelle, darfSensibel } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseNum, str } from "@/lib/format";
import { wochenGanzImMonat } from "@/lib/wochen";

/** Speichert alle Zeilen des Monats: Felder stunden_<einsatzId>, verrechnung_<einsatzId>, bruttolohn_<einsatzId> */
export async function monatSpeichern(jahr: number, monat: number, fd: FormData) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/abrechnung?fehler=berechtigung");
  const ids = new Set<string>();
  for (const k of fd.keys()) { const m = k.match(/^(stunden|ue50|ue100|verrechnung|bruttolohn|selbstkosten|sonderzahlung)_(.+)$/); if (m) ids.add(m[2]); }
  const zulagenFelder = [...fd.keys()].filter((k) => k.startsWith("zul_"));
  let n = 0;
  for (const einsatzId of ids) {
    const e = await db.einsatz.findUnique({ where: { id: einsatzId } });
    if (!e || !darfKostenstelle(s, e.kostenstelleId)) continue;
    let stunden = parseNum(fd.get(`stunden_${einsatzId}`));
    // Ohne Eingabe: Sollstunden aus der Einsatzplanung (X-Tage) übernehmen, sofern der Monat geplant ist.
    // Bewusst auf den Zeitraum DIESES Einsatzes begrenzt: je Person geholt bekämen bei einem
    // Kundenwechsel im Monat beide Zeilen die vollen Monatsstunden – der Monat würde doppelt fakturiert.
    if (stunden == null && e.art !== "DIREKTVERMITTLUNG") {
      const soll = await sollstundenFuerEinsatz(jahr, monat, e);
      if (soll > 0) stunden = soll;
    }
    const ueberstunden50 = parseNum(fd.get(`ue50_${einsatzId}`));
    const ueberstunden100 = parseNum(fd.get(`ue100_${einsatzId}`));
    // Zulagen-Mengen (Stunden bzw. Tage je Zulage) aus dem Formular: zul_<einsatzId>_<KUERZEL>
    const zulagenMengen: Record<string, number> = {};
    for (const k of zulagenFelder) {
      if (!k.startsWith(`zul_${einsatzId}_`)) continue;
      const kuerzel = k.slice(`zul_${einsatzId}_`.length);
      const v = parseNum(fd.get(k));
      if (kuerzel && v != null && v > 0) zulagenMengen[kuerzel] = v;
    }
    let verrechnung = parseNum(fd.get(`verrechnung_${einsatzId}`));
    // Verrechnung automatisch aus Normal-/Überstunden und Zulagen (eigene Rechnungspositionen), wenn nicht manuell überschrieben
    const auf = (stunden != null || ueberstunden50 != null || ueberstunden100 != null) ? await verrechnungAufschluesseln(einsatzId, { stunden, ueberstunden50, ueberstunden100, zulagenMengen }) : null;
    const zulagenBetrag = auf ? (auf.zeilen.filter((z) => z.typ === "ZULAGE").reduce((a, z) => a + z.betrag, 0) || null) : null;
    const vorhanden = await db.monatsabrechnung.findUnique({ where: { personId_kundeId_jahr_monat: { personId: e.personId, kundeId: e.kundeId, jahr, monat } } });
    // Das Formular schickt den gespeicherten Betrag unverändert wieder mit. Unverändert heißt: kein
    // manuelles Überschreiben – dann rechnet die Software neu (sonst würde eine geänderte
    // Zulagen-Menge oder Stundenzahl den alten Betrag für immer festnageln).
    if (verrechnung != null && vorhanden?.verrechnung != null && Math.abs(verrechnung - vorhanden.verrechnung) < 0.005 && auf) verrechnung = auf.summe;
    if (verrechnung == null && auf) verrechnung = auf.summe;
    const bruttolohn = parseNum(fd.get(`bruttolohn_${einsatzId}`));
    const selbstkostenIst = parseNum(fd.get(`selbstkosten_${einsatzId}`));
    const sonderzahlungIst = parseNum(fd.get(`sonderzahlung_${einsatzId}`));
    if (verrechnung == null && stunden != null && e.verrechnungssatz) verrechnung = Math.round(stunden * e.verrechnungssatz * 100) / 100;
    if (e.art === "DIREKTVERMITTLUNG" && verrechnung == null && e.vermittlungshonorar && e.von.getUTCFullYear() === jahr && e.von.getUTCMonth() + 1 === monat && !vorhanden) verrechnung = e.vermittlungshonorar;
    if (vorhanden?.status === "ABGERECHNET") continue; // bereits fakturiert – nicht überschreiben
    if (stunden == null && ueberstunden50 == null && ueberstunden100 == null && verrechnung == null && bruttolohn == null && selbstkostenIst == null && sonderzahlungIst == null) { if (vorhanden) {
      await db.monatsabrechnung.delete({ where: { id: vorhanden.id } });
      // Mit der Abrechnung geht auch das Wochenraster dieses Monats – sonst stehen in der
      // Einsatzplanung weiter Sollstunden für einen Monat, für den es keine Abrechnung mehr gibt.
      // Nur Wochen, die ganz in diesem Monat liegen; eine Woche über den Monatswechsel gehört zur
      // Hälfte dem Nachbarmonat.
      const wochen = wochenGanzImMonat(jahr, monat);
      if (wochen.length) await db.wochenstatus.deleteMany({ where: { personId: vorhanden.personId, OR: wochen } });
    } continue; }
    await db.monatsabrechnung.upsert({
      where: { personId_kundeId_jahr_monat: { personId: e.personId, kundeId: e.kundeId, jahr, monat } },
      create: { kostenstelleId: e.kostenstelleId, personId: e.personId, kundeId: e.kundeId, einsatzId, jahr, monat, stunden, ueberstunden50, ueberstunden100, zulagenBetrag, zulagenMengen, art: e.art, verrechnung, bruttolohn, selbstkostenIst, sonderzahlungIst },
      update: { stunden, ueberstunden50, ueberstunden100, zulagenBetrag, zulagenMengen, art: e.art, verrechnung, bruttolohn, selbstkostenIst, sonderzahlungIst, einsatzId },
    });
    n++;
  }
  await audit(s, "UPDATE", "Monatsabrechnung", `${jahr}-${monat}`, `${n} Zeilen für ${String(monat).padStart(2, "0")}/${jahr} gespeichert`, undefined, s.aktiveKostenstelleId ?? s.kostenstelleId);
  revalidatePath("/abrechnung");
  redirect(`/abrechnung?jahr=${jahr}&monat=${monat}&gespeichert=${n}`);
}

export async function monatFakturieren(jahr: number, monat: number, fd: FormData) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/abrechnung?fehler=berechtigung");
  const { rechnungenErzeugen } = await import("@/lib/rechnung");
  const kundeId = str(fd.get("kundeId")) || undefined;
  let erg: string[];
  try {
    erg = await rechnungenErzeugen(s, jahr, monat, kundeId);
  } catch (e) {
    // Beim Geld ist ein stiller Abbruch das Schlimmste: Die Rechnungen fehlen, und niemand weiß
    // warum. Der Fehler wird protokolliert (und steht am nächsten Morgen in der Mail), die
    // bearbeitende Person bekommt sofort eine Meldung.
    const { fehlerMelden, fehlertext } = await import("@/lib/fehler");
    await fehlerMelden("Rechnungslauf", e, { detail: `${String(monat).padStart(2, "0")}/${jahr}${kundeId ? ` · Kunde ${kundeId}` : ""}` });
    redirect(`/abrechnung?jahr=${jahr}&monat=${monat}&fehler=${encodeURIComponent(fehlertext(e).slice(0, 200))}`);
  }
  redirect(`/rechnungen?jahr=${jahr}&monat=${monat}&erzeugt=${erg.length}`);
}
