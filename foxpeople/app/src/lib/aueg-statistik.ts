import { db } from "./db";

/**
 * Überlassungsstatistik gem. § 13 Abs. 2 AÜG – Stichtagserhebung (Stichtag 31. Juli, Meldung an die Gewerbebehörde/Landesgeschäftsstelle).
 * Erhoben werden: überlassene Arbeitskräfte am Stichtag (nach Geschlecht, Arbeiter/Angestellte, Staatsangehörigkeit Ö/EU-EWR/Drittstaat),
 * Beschäftigerbetriebe, Bundesland des Beschäftigers, Dauer der laufenden Überlassungen, Beschäftigte im Dienstverhältnis gesamt.
 */
export interface AuegStatistik {
  stichtag: Date;
  beschaeftigteGesamt: number;
  ueberlassen: number;
  nachGeschlecht: Record<string, number>;
  nachArt: { arbeiter: number; angestellte: number };
  nachNationalitaet: { oesterreich: number; euEwr: number; drittstaat: number; unbekannt: number };
  nachBundesland: Record<string, number>;
  nachDauer: { bis3Monate: number; bis12Monate: number; ueber12Monate: number };
  beschaeftigerbetriebe: number;
  grenzueberschreitend: number;
  zeilen: { name: string; geschlecht: string; art: string; nationalitaet: string; kunde: string; bundesland: string; seit: Date; dauerMonate: number; kostenstelle: string }[];
  hinweise: string[];
}

const EU_EWR = ["deutschland", "italien", "slowakei", "slowenien", "ungarn", "tschechien", "polen", "rumänien", "bulgarien", "kroatien", "frankreich", "spanien", "portugal", "niederlande", "belgien", "luxemburg", "dänemark", "schweden", "finnland", "irland", "griechenland", "zypern", "malta", "estland", "lettland", "litauen", "norwegen", "island", "liechtenstein", "schweiz"];
const nat = (s: string | null) => { const t = (s ?? "").trim().toLowerCase(); if (!t) return "unbekannt"; if (["österreich", "oesterreich", "at", "a", "austria"].includes(t)) return "oesterreich"; return EU_EWR.some((e) => t.includes(e)) ? "euEwr" : "drittstaat"; };

/** Bundesland aus PLZ (Näherung) – exakt, wenn beim Kunden hinterlegt */
export function bundeslandAusPlz(plz: string | null | undefined) {
  const p = (plz ?? "").trim();
  if (!/^\d{4}$/.test(p)) return "unbekannt";
  const n = Number(p);
  if (n >= 1000 && n < 2000) return "Wien";
  if (n >= 2000 && n < 4000) return "Niederösterreich";
  if (n >= 4000 && n < 5000) return "Oberösterreich";
  if (n >= 5000 && n < 6000) return "Salzburg";
  if (n >= 6000 && n < 6700) return "Tirol";
  if (n >= 6700 && n < 7000) return "Vorarlberg";
  if (n >= 7000 && n < 8000) return "Burgenland";
  if (n >= 8000 && n < 9000) return "Steiermark";
  if (n >= 9000 && n < 10000) return "Kärnten";
  return "unbekannt";
}

export async function auegStatistik(stichtag: Date, kostenstelleId?: string): Promise<AuegStatistik> {
  const kw = kostenstelleId ? { kostenstelleId } : {};
  // Beschäftigte im Dienstverhältnis am Stichtag: Eintritt ≤ Stichtag und (kein Austritt oder Austritt ≥ Stichtag). Personen ohne Eintrittsdatum (Altbestand aus dem Excel) zählen nur, wenn sie am Stichtag im Einsatz sind.
  const mitEintritt = await db.person.findMany({ where: { ...kw, status: { in: ["VERMITTELT", "GESPERRT"] }, eintrittsdatum: { lte: stichtag }, OR: [{ austrittsdatum: null }, { austrittsdatum: { gte: stichtag } }] }, select: { id: true } });
  const einsaetze = await db.einsatz.findMany({
    where: { ...kw, art: "UEBERLASSUNG", status: { in: ["AKTIV", "GEPLANT", "BEENDET"] }, von: { lte: stichtag }, OR: [{ bis: null }, { bis: { gte: stichtag } }] },
    include: { person: true, kunde: true, kostenstelle: { select: { name: true } } },
  });
  // je Person nur ein Einsatz am Stichtag
  const jePerson = new Map<string, (typeof einsaetze)[number]>();
  for (const e of einsaetze) if (!jePerson.has(e.personId)) jePerson.set(e.personId, e);
  const beschaeftigteIds = new Set([...mitEintritt.map((p) => p.id), ...jePerson.keys()]);
  const st: AuegStatistik = {
    stichtag, beschaeftigteGesamt: beschaeftigteIds.size, ueberlassen: jePerson.size,
    nachGeschlecht: { M: 0, W: 0, D: 0, unbekannt: 0 }, nachArt: { arbeiter: 0, angestellte: 0 },
    nachNationalitaet: { oesterreich: 0, euEwr: 0, drittstaat: 0, unbekannt: 0 }, nachBundesland: {}, nachDauer: { bis3Monate: 0, bis12Monate: 0, ueber12Monate: 0 },
    beschaeftigerbetriebe: new Set(einsaetze.map((e) => e.kundeId)).size, grenzueberschreitend: 0, zeilen: [], hinweise: [],
  };
  let ohneGeschlecht = 0, plzNaeherung = 0;
  for (const e of jePerson.values()) {
    const g = e.person.geschlecht ?? "unbekannt"; st.nachGeschlecht[g] = (st.nachGeschlecht[g] ?? 0) + 1; if (g === "unbekannt") ohneGeschlecht++;
    if (e.person.angestellt) st.nachArt.angestellte++; else st.nachArt.arbeiter++;
    const n = nat(e.person.staatsangehoerigkeit) as keyof AuegStatistik["nachNationalitaet"]; st.nachNationalitaet[n]++;
    const bl = e.kunde.land && e.kunde.land !== "Österreich" ? `Ausland (${e.kunde.land})` : e.kunde.bundesland ?? (plzNaeherung++, bundeslandAusPlz(e.kunde.plz));
    st.nachBundesland[bl] = (st.nachBundesland[bl] ?? 0) + 1;
    const dauer = (stichtag.getTime() - e.von.getTime()) / (30.44 * 86400000);
    if (dauer <= 3) st.nachDauer.bis3Monate++; else if (dauer <= 12) st.nachDauer.bis12Monate++; else st.nachDauer.ueber12Monate++;
    if (e.grenzueberschreitend) st.grenzueberschreitend++;
    st.zeilen.push({ name: `${e.person.nachname} ${e.person.vorname}`, geschlecht: g, art: e.person.angestellt ? "Angestellte/r" : "Arbeiter/in", nationalitaet: e.person.staatsangehoerigkeit ?? "–", kunde: e.kunde.firmenname, bundesland: bl, seit: e.von, dauerMonate: Math.round(dauer * 10) / 10, kostenstelle: e.kostenstelle.name });
  }
  if (ohneGeschlecht) st.hinweise.push(`${ohneGeschlecht} überlassene Person(en) ohne Geschlecht im Stamm – bitte im Mitarbeiterprofil ergänzen (Pflichtangabe der Statistik).`);
  if (plzNaeherung) st.hinweise.push(`Bei ${plzNaeherung} Einsatz/Einsätzen wurde das Bundesland des Beschäftigers aus der PLZ geschätzt – im Kundenstamm hinterlegen, dann ist es exakt.`);
  if (st.nachNationalitaet.unbekannt) st.hinweise.push(`${st.nachNationalitaet.unbekannt} Person(en) ohne Staatsangehörigkeit im Stamm.`);
  return st;
}

export function auegStatistikCsv(st: AuegStatistik) {
  const z = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: string[] = [];
  rows.push(["Überlassungsstatistik § 13 AÜG", `Stichtag ${st.stichtag.toLocaleDateString("de-AT")}`].map(z).join(";"));
  rows.push("");
  rows.push(["Kennzahl", "Wert"].map(z).join(";"));
  rows.push(["Beschäftigte im Dienstverhältnis gesamt", st.beschaeftigteGesamt].map(z).join(";"));
  rows.push(["Überlassene Arbeitskräfte am Stichtag", st.ueberlassen].map(z).join(";"));
  rows.push(["davon männlich", st.nachGeschlecht.M ?? 0].map(z).join(";"));
  rows.push(["davon weiblich", st.nachGeschlecht.W ?? 0].map(z).join(";"));
  rows.push(["davon divers", st.nachGeschlecht.D ?? 0].map(z).join(";"));
  rows.push(["davon Arbeiter/innen", st.nachArt.arbeiter].map(z).join(";"));
  rows.push(["davon Angestellte", st.nachArt.angestellte].map(z).join(";"));
  rows.push(["davon Österreich", st.nachNationalitaet.oesterreich].map(z).join(";"));
  rows.push(["davon EU/EWR/Schweiz", st.nachNationalitaet.euEwr].map(z).join(";"));
  rows.push(["davon Drittstaaten", st.nachNationalitaet.drittstaat].map(z).join(";"));
  rows.push(["Beschäftigerbetriebe", st.beschaeftigerbetriebe].map(z).join(";"));
  rows.push(["grenzüberschreitende Überlassungen", st.grenzueberschreitend].map(z).join(";"));
  rows.push(["Dauer bis 3 Monate", st.nachDauer.bis3Monate].map(z).join(";"));
  rows.push(["Dauer 3–12 Monate", st.nachDauer.bis12Monate].map(z).join(";"));
  rows.push(["Dauer über 12 Monate", st.nachDauer.ueber12Monate].map(z).join(";"));
  for (const [bl, n] of Object.entries(st.nachBundesland)) rows.push([`Beschäftiger in ${bl}`, n].map(z).join(";"));
  rows.push("");
  rows.push(["Name", "Geschlecht", "Arbeiter/Angestellte", "Staatsangehörigkeit", "Beschäftiger", "Bundesland", "überlassen seit", "Dauer (Monate)", "Kostenstelle"].map(z).join(";"));
  for (const r of st.zeilen) rows.push([r.name, r.geschlecht, r.art, r.nationalitaet, r.kunde, r.bundesland, r.seit.toLocaleDateString("de-AT"), r.dauerMonate, r.kostenstelle].map(z).join(";"));
  return "﻿" + rows.join("\r\n");
}
