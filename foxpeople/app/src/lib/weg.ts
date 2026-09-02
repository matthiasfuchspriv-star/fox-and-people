import { db } from "./db";
import { EMPFEHLUNG_DEFAULT, empfehlungStand, type EmpfehlungConfig } from "./empfehlung";
import { einstellung } from "./einstellungen";

/**
 * „Dein Weg bei uns“ – die eigene Geschichte des Mitarbeiters: wie lange dabei, wie viele Einsätze,
 * wie viele Stunden, welche Rückmeldungen von den Beschäftigern, welche Nachweise, welche Prämien.
 *
 * Der Zweck ist Bindung, nicht Statistik: Menschen bleiben dort, wo sie ihren eigenen Fortschritt sehen
 * und wo Anerkennung sichtbar wird, die sonst niemand ausspricht.
 */
export interface WegDaten {
  eintritt: Date | null;
  monateDabei: number;
  einsaetze: { kunde: string; rolle: string; von: Date; bis: Date | null; aktiv: boolean }[];
  betriebe: number;
  stundenGesamt: number;
  bewertungen: { kunde: string; sterne: number; datum: Date; kommentar: string | null; merkmale: string[]; wiedereinsatz: boolean }[];
  schnitt: number | null;
  nachweise: { typ: string; bezeichnung: string | null; gultigBis: Date | null }[];
  praemien: { erfolgreich: number; gesamt: number };
  /** Nächster sinnvoller Schritt – Qualifikation, die eine höhere Beschäftigungsgruppe eröffnet */
  naechsterSchritt: { titel: string; text: string } | null;
}

/**
 * Weiterbildungen, die Fox & People bezahlt: der Sozial- und Weiterbildungsfonds der Arbeitskräfte-
 * überlassung (SWF) fördert genau diese Kursarten. Steht ein Kurs auf der SWF-Liste, übernehmen wir ihn –
 * das ist die Regel, die Matthias am 30.08.2026 festgelegt hat.
 */
export const SWF_KURSE: { titel: string; text: string; rolleEnthaelt?: string[] }[] = [
  { titel: "Staplerschein", text: "Mit dem Staplerschein kommst du in höher eingestufte Einsätze – der Kurs steht auf der SWF-Liste, wir zahlen ihn.", rolleEnthaelt: ["lager", "produktion", "helfer", "kommission"] },
  { titel: "Kranschein / Hubarbeitsbühne", text: "Kran- und Hubarbeitsbühnenscheine sind gefragt und über den SWF gefördert – wir übernehmen die Kosten.", rolleEnthaelt: ["metall", "montage", "schlosser", "bau"] },
  { titel: "Schweißprüfung EN ISO 9606", text: "Eine gültige Schweißprüfung ist bei Metallbetrieben der Unterschied zwischen Helfer und Facharbeiter – der SWF fördert sie, wir zahlen sie.", rolleEnthaelt: ["schweiß", "schweiss", "metall", "schlosser"] },
  { titel: "Deutschkurs", text: "Berufsbezogene Deutschkurse sind über den SWF gefördert – sag uns Bescheid, wir organisieren das.", },
  { titel: "Führerschein C / Stapler-Aufbau", text: "Für Transport- und Lagerbetriebe der nächste Schritt – über den SWF förderbar.", rolleEnthaelt: ["fahrer", "transport", "lager"] },
];

export async function wegDaten(personId: string): Promise<WegDaten | null> {
  const p = await db.person.findUnique({
    where: { id: personId },
    include: {
      qualifikationen: true,
      empfehlungen: true,
      einsaetze: { include: { kunde: { select: { firmenname: true } } }, orderBy: { von: "desc" } },
      kundenBewertungen: true,
      bewertungen: { include: { kunde: { select: { firmenname: true } } }, orderBy: { datum: "desc" } },
      monatsabrechnungen: { select: { stunden: true, ueberstunden50: true, ueberstunden100: true } },
    },
  });
  if (!p) return null;
  const heute = new Date();
  const eintritt = p.eintrittsdatum ?? (p.einsaetze.length ? p.einsaetze[p.einsaetze.length - 1].von : null);
  const monateDabei = eintritt ? Math.max(0, Math.round((heute.getTime() - eintritt.getTime()) / (30.44 * 86400000))) : 0;
  const stundenGesamt = Math.round(p.monatsabrechnungen.reduce((a, m) => a + (m.stunden ?? 0) + (m.ueberstunden50 ?? 0) + (m.ueberstunden100 ?? 0), 0));
  const bewertungen = p.bewertungen.map((b) => ({
    kunde: b.kunde?.firmenname ?? "Fox & People",
    sterne: b.sterne, datum: b.datum, kommentar: b.kommentar,
    merkmale: (b.merkmale as string[]) ?? [], wiedereinsatz: b.wiedereinsatzEmpfohlen,
  }));
  const schnitt = bewertungen.length ? Math.round((bewertungen.reduce((a, b) => a + b.sterne, 0) / bewertungen.length) * 10) / 10 : null;
  const cfg = { ...EMPFEHLUNG_DEFAULT, ...(await einstellung<Partial<EmpfehlungConfig>>("empfehlung", {})) };
  const stand = empfehlungStand(p.empfehlungen, cfg);

  // Nächster Schritt: erster SWF-Kurs, der zur Rolle passt und noch nicht als Nachweis hinterlegt ist
  const rolle = (p.standardrolle ?? "").toLowerCase();
  const hat = (titel: string) => p.qualifikationen.some((q) => q.typ.toLowerCase().includes(titel.split(" ")[0].toLowerCase()));
  const passend = SWF_KURSE.filter((k) => !hat(k.titel)).sort((a, b) => {
    const pa = a.rolleEnthaelt?.some((x) => rolle.includes(x)) ? 0 : 1;
    const pb = b.rolleEnthaelt?.some((x) => rolle.includes(x)) ? 0 : 1;
    return pa - pb;
  })[0] ?? null;

  return {
    eintritt, monateDabei,
    einsaetze: p.einsaetze.map((e) => ({ kunde: e.kunde.firmenname, rolle: e.rolleImEinsatz, von: e.von, bis: e.bis, aktiv: e.status === "AKTIV" })),
    betriebe: new Set(p.einsaetze.map((e) => e.kundeId)).size,
    stundenGesamt,
    bewertungen, schnitt,
    nachweise: p.qualifikationen.map((q) => ({ typ: q.typ, bezeichnung: q.bezeichnung, gultigBis: q.gultigBis })),
    praemien: { erfolgreich: stand.erfolgreich, gesamt: stand.gesamt },
    naechsterSchritt: passend ? { titel: passend.titel, text: passend.text } : null,
  };
}
