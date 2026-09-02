import { db } from "./db";
import { istAusweis, istBewilligung } from "./dokumente";
import { IST_BEWILLIGUNG, brauchtArbeitsbewilligung } from "./staaten";

/**
 * Verfallsmonitor: alles, was ablaufen kann und den Einsatz oder die Rechnung gefährdet – auf der
 * Mitarbeiterseite Arbeitsbewilligung, Ausweis und Nachweise, auf der Kundenseite Rahmenvertrag,
 * Kollektivvertrag, AGB-Akzeptanz und die jährliche UID-Prüfung (Stufe 2).
 *
 * Vorwarnzeit ist einheitlich 8 Wochen (56 Tage) – so bleibt genug Zeit für Verlängerungen beim AMS,
 * für einen neuen Rahmenvertrag und für die Anpassung der Verrechnungssätze.
 */
export const VORWARNUNG_TAGE = 56;

export type VerfallArt = "BEWILLIGUNG" | "AUSWEIS" | "QUALIFIKATION" | "RAHMENVERTRAG" | "KV" | "UID" | "AGB";
export interface VerfallEintrag {
  art: VerfallArt;
  titel: string;
  detail: string;
  faelligAm: Date | null;
  tageRest: number | null;
  abgelaufen: boolean;
  /** true = ohne Behebung ist kein Einsatz bzw. keine Verrechnung möglich */
  blockiert: boolean;
  personId?: string; kundeId?: string; kostenstelleId: string;
}

/**
 * Stabiler Schlüssel eines Verfallseintrags – dient dazu, einen abgehakten ("erledigten") Eintrag
 * wiederzuerkennen und aus der Liste zu nehmen. Das Fälligkeitsdatum ist Teil des Schlüssels: Wird
 * ein Nachweis verlängert und läuft später erneut ab, ändert sich das Datum und der Eintrag taucht
 * wieder auf – ein einmal Abgehaktes bleibt also nicht für immer versteckt.
 */
export function verfallSchluessel(v: Pick<VerfallEintrag, "art" | "personId" | "kundeId" | "titel" | "faelligAm">) {
  return [v.art, v.personId ?? v.kundeId ?? "", v.titel, v.faelligAm ? v.faelligAm.toISOString().slice(0, 10) : "-"].join("|");
}

const tage = (d: Date, ab = new Date()) => Math.floor((d.getTime() - ab.getTime()) / 86400000);

/** Mitarbeiterseite: Bewilligung, Ausweis, Nachweise. */
export async function verfallMitarbeiter(kostenstelleId?: string | null): Promise<VerfallEintrag[]> {
  const heute = new Date();
  const grenze = new Date(heute.getTime() + VORWARNUNG_TAGE * 86400000);
  const personen = await db.person.findMany({
    // Nur aktive Mitarbeiter: Bei einem Bewerber im Pool ist eine fehlende Ausweiskopie keine
    // offene Pflicht, sondern der Normalzustand – zwischen tausenden solcher Zeilen ginge das
    // unter, was wirklich zählt.
    where: { status: "VERMITTELT", ...(kostenstelleId ? { kostenstelleId } : {}) },
    include: { qualifikationen: true, dokumente: { select: { kategorie: true, gultigBis: true } } },
  });
  const out: VerfallEintrag[] = [];
  for (const p of personen) {
    const name = `${p.vorname} ${p.nachname}`;
    const bewilligungen = [
      ...p.qualifikationen.filter((q) => IST_BEWILLIGUNG.test(q.typ)).map((q) => ({ typ: q.typ, gultigBis: q.gultigBis, nummer: q.nummer })),
      ...p.dokumente.filter((d) => istBewilligung(d.kategorie)).map((d) => ({ typ: d.kategorie, gultigBis: d.gultigBis, nummer: null as string | null })),
    ];
    if (brauchtArbeitsbewilligung(p.staatsangehoerigkeit)) {
      const beste = bewilligungen.filter((q) => q.gultigBis).sort((a, b) => b.gultigBis!.getTime() - a.gultigBis!.getTime())[0]
        ?? bewilligungen.find((q) => !q.gultigBis);
      if (!beste) out.push({ art: "BEWILLIGUNG", titel: `${name}: Arbeitsbewilligung fehlt`, detail: `${p.staatsangehoerigkeit ?? "Drittstaat"} – ohne gültigen Arbeitsmarktzugang kein Einsatz (AuslBG).`, faelligAm: null, tageRest: null, abgelaufen: true, blockiert: true, personId: p.id, kostenstelleId: p.kostenstelleId });
      else if (beste.gultigBis && beste.gultigBis <= grenze)
        out.push({ art: "BEWILLIGUNG", titel: `${name}: ${beste.typ} läuft ab`, detail: `Gültig bis ${beste.gultigBis.toLocaleDateString("de-AT")}${beste.nummer ? ` · Nr. ${beste.nummer}` : ""} – Verlängerung beim AMS rechtzeitig beantragen.`, faelligAm: beste.gultigBis, tageRest: tage(beste.gultigBis, heute), abgelaufen: beste.gultigBis < heute, blockiert: beste.gultigBis < heute, personId: p.id, kostenstelleId: p.kostenstelleId });
    }
    if (!p.ausweisDokumentId && !p.dokumente.some((d) => istAusweis(d.kategorie)) && !p.qualifikationen.some((q) => /ausweis|reisepass|personalausweis|aufenthaltstitel/i.test(q.typ)))
      out.push({ art: "AUSWEIS", titel: `${name}: Ausweiskopie fehlt`, detail: "Identitätsnachweis ist im Onboarding Pflicht (Reisepass, Personalausweis oder Aufenthaltstitel).", faelligAm: null, tageRest: null, abgelaufen: true, blockiert: false, personId: p.id, kostenstelleId: p.kostenstelleId });
    if (p.ausweisGultigBis && p.ausweisGultigBis <= grenze)
      out.push({ art: "AUSWEIS", titel: `${name}: Ausweis läuft ab`, detail: `${p.ausweisArt ?? "Ausweis"}${p.ausweisNummer ? ` Nr. ${p.ausweisNummer}` : ""} gültig bis ${p.ausweisGultigBis.toLocaleDateString("de-AT")}.`, faelligAm: p.ausweisGultigBis, tageRest: tage(p.ausweisGultigBis, heute), abgelaufen: p.ausweisGultigBis < heute, blockiert: false, personId: p.id, kostenstelleId: p.kostenstelleId });
    for (const q of p.qualifikationen) {
      if (IST_BEWILLIGUNG.test(q.typ)) continue;
      if (q.gultigBis && q.gultigBis <= grenze)
        out.push({ art: "QUALIFIKATION", titel: `${name}: ${q.typ} läuft ab`, detail: `Gültig bis ${q.gultigBis.toLocaleDateString("de-AT")}${q.bezeichnung ? ` · ${q.bezeichnung}` : ""}.`, faelligAm: q.gultigBis, tageRest: tage(q.gultigBis, heute), abgelaufen: q.gultigBis < heute, blockiert: false, personId: p.id, kostenstelleId: p.kostenstelleId });
    }
  }
  return out.sort((a, b) => (a.faelligAm?.getTime() ?? 0) - (b.faelligAm?.getTime() ?? 0));
}

/** Kundenseite: Rahmenvertrag, KV-Abschluss, AGB-Akzeptanz, jährliche UID-Prüfung Stufe 2. */
export async function verfallKunden(kostenstelleId?: string | null): Promise<VerfallEintrag[]> {
  const heute = new Date();
  const grenze = new Date(heute.getTime() + VORWARNUNG_TAGE * 86400000);
  const kunden = await db.kunde.findMany({
    where: { status: "AKTIV", ...(kostenstelleId ? { kostenstelleId } : {}) },
    include: { vertraege: { where: { typ: "RAHMENVERTRAG" } }, _count: { select: { einsaetze: true } } },
  });
  const out: VerfallEintrag[] = [];
  for (const k of kunden) {
    const basis = { kundeId: k.id, kostenstelleId: k.kostenstelleId };
    const unterschrieben = k.vertraege.some((v) => v.status === "UNTERSCHRIEBEN");
    if (k.rahmenvertragPflicht && !unterschrieben && !k.rahmenvertragBeginn)
      out.push({ art: "RAHMENVERTRAG", titel: `${k.firmenname}: kein Rahmenvertrag`, detail: "Vor dem ersten Einsatz Rahmenvertrag samt AGB abschließen – sonst ist die Überlassung nicht abgesichert.", faelligAm: null, tageRest: null, abgelaufen: true, blockiert: true, ...basis });
    if (k.rahmenvertragEnde && k.rahmenvertragEnde <= grenze)
      out.push({ art: "RAHMENVERTRAG", titel: `${k.firmenname}: Rahmenvertrag läuft aus`, detail: `Ende ${k.rahmenvertragEnde.toLocaleDateString("de-AT")}${k.kuendigungsfrist ? ` · Kündigungsfrist ${k.kuendigungsfrist}` : ""} – Verlängerung anstoßen.`, faelligAm: k.rahmenvertragEnde, tageRest: tage(k.rahmenvertragEnde, heute), abgelaufen: k.rahmenvertragEnde < heute, blockiert: false, ...basis });
    if (k.rahmenvertragPflicht && !k.agbAkzeptiertAm)
      out.push({ art: "AGB", titel: `${k.firmenname}: AGB-Akzeptanz fehlt`, detail: "Im Kundenstamm ist nicht dokumentiert, dass die AGB angenommen wurden (Version, Datum, Unterzeichner).", faelligAm: null, tageRest: null, abgelaufen: true, blockiert: false, ...basis });
    if (k.kvGueltigBis && k.kvGueltigBis <= new Date(heute.getTime() + 62 * 86400000))
      out.push({ art: "KV", titel: `${k.firmenname}: ${k.kollektivvertrag ?? "Kollektivvertrag"} läuft aus`, detail: `Gültig bis ${k.kvGueltigBis.toLocaleDateString("de-AT")} – neue Lohntafel prüfen, Referenzlohn und Verrechnungssätze anpassen.`, faelligAm: k.kvGueltigBis, tageRest: tage(k.kvGueltigBis, heute), abgelaufen: k.kvGueltigBis < heute, blockiert: false, ...basis });
    // UID-Prüfung Stufe 2: jährlich, bei Neukunden vor der ersten Rechnung
    const faellig = k.uidGeprueftAm ? new Date(k.uidGeprueftAm.getTime() + k.uidPruefIntervallTage * 86400000) : null;
    if (!k.uidGeprueftAm)
      out.push({ art: "UID", titel: `${k.firmenname}: UID nie geprüft`, detail: `UID ${k.uid ?? "fehlt"} – vor der ersten Rechnung im FinanzOnline-UID-Bestätigungsverfahren Stufe 2 prüfen (Haftung für den Vorsteuerabzug).`, faelligAm: null, tageRest: null, abgelaufen: true, blockiert: false, ...basis });
    else if (k.uidGueltig === false)
      out.push({ art: "UID", titel: `${k.firmenname}: UID ungültig`, detail: `Die letzte Prüfung am ${k.uidGeprueftAm.toLocaleDateString("de-AT")} war negativ – Kunden kontaktieren, keine Rechnung mit UID-Ausweis.`, faelligAm: k.uidGeprueftAm, tageRest: null, abgelaufen: true, blockiert: true, ...basis });
    else if (faellig && faellig <= grenze)
      out.push({ art: "UID", titel: `${k.firmenname}: UID-Prüfung fällig`, detail: `Zuletzt am ${k.uidGeprueftAm.toLocaleDateString("de-AT")}${k.uidGeprueftStufe ? ` (Stufe ${k.uidGeprueftStufe})` : ""} geprüft – jährliche Wiederholung in Stufe 2.`, faelligAm: faellig, tageRest: tage(faellig, heute), abgelaufen: faellig < heute, blockiert: false, ...basis });
  }
  return out.sort((a, b) => (a.faelligAm?.getTime() ?? 0) - (b.faelligAm?.getTime() ?? 0));
}

export async function verfallAlles(kostenstelleId?: string | null): Promise<VerfallEintrag[]> {
  const [m, k] = await Promise.all([verfallMitarbeiter(kostenstelleId), verfallKunden(kostenstelleId)]);
  return [...m, ...k].sort((a, b) => Number(b.blockiert) - Number(a.blockiert) || (a.faelligAm?.getTime() ?? 0) - (b.faelligAm?.getTime() ?? 0));
}
