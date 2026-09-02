import { db } from "./db";
import { cent } from "./geld";
import { rueckstellungenJahr, type Monatswerte, type AbgabenSaetze } from "@/engine/kalkulation";
import { aktuelleSaetze } from "./einstellungen";
import { provisionPct, ladeControllingkosten, umlage, type EinsatzArtKey, type Controllingkosten } from "./provision";
import { kostenJahr } from "./kosten";

export interface MitarbeiterAuswertung {
  personId: string;
  kundeId: string;
  name: string;
  kunde: string;
  kostenstelleId: string;
  verrechnungJahr: number;
  selbstkostenJahr: number; // Bruttolohn
  abgabenRueckstellungenJahr: number;
  db1Jahr: number;
  db1Marge: number;
  art: EinsatzArtKey;
  provisionPct: number; // Provisionsschlüssel der Kostenstelle für diese Einsatzart
  kostenJahr: number; // Kostenumlage (Kosten je Mitarbeiter × aktive Monate), 0 ohne Controlling-Kosten
  rueckstellung: { zufuehrung: number; aufloesung: number; stand: number; monate: number[] }; // UZ/WR-Rückstellungskonto (außerhalb DB)
  db2Jahr: number; // DB1 − Kostenumlage
  provisionJahr: number; // Anteil der Kostenstelle am DB2 (0, solange keine Controlling-Kosten hinterlegt sind)
  monate: { monat: number; verrechnung: number; grundlohn: number; abgaben: number; db1: number; kosten: number; db2: number; provision: number }[];
}

export interface Controlling {
  jahr: number;
  saetze: AbgabenSaetze;
  mitarbeiter: MitarbeiterAuswertung[];
  kunden: { kundeId: string; kunde: string; verrechnungJahr: number; selbstkostenJahr: number; abgabenRueckstellungenJahr: number; db1Jahr: number; db1Marge: number; db2Jahr: number; provisionJahr: number; anzahlMitarbeiter: number }[];
  gesamt: { umsatz: number; selbstkosten: number; abgaben: number; db1Brutto: number; praemien: number; db1: number; kostenUmlage: number; db2: number; provision: number; provisionUeberlassung: number; provisionVermittlung: number; marge: number; personalkostenquote: number; abgabenquote: number; anzahlMitarbeiter: number; imMinus: number };
  /** Empfehlungsprämien, die die Zentrale getragen hat – sie mindern den DB1 (Entscheidung 30.08.2026) */
  praemien: { jahr: number; summe: number; anzahl: number; monate: number[] };
  monatsreihe: { monat: number; label: string; umsatz: number; selbstkosten: number; abgaben: number; db1: number; praemien: number; db2: number; provision: number }[];
  /** Controlling-Kosten der Zentrale für das Jahr – null = noch nicht hinterlegt → keine Provision */
  kosten: Controllingkosten | null;
}

const MON = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Entspricht den Blättern "Kunden-Auswertung" und "Übersicht" – berechnet je Kostenstelle (oder alle). */
export async function controlling(jahr: number, kostenstelleId?: string): Promise<Controlling> {
  const { saetze } = await aktuelleSaetze(null, new Date(jahr, 11, 31));
  const kosten = await ladeControllingkosten(jahr, kostenstelleId);
  // Kosten je Kostenstelle (Standard "" gilt, wenn die Kostenstelle nichts Eigenes hat) – bei Gesamtsicht je Zeile nachladen
  const kostenCache = new Map<string, Controllingkosten | null>();
  const kostenFuer = async (ks: string) => { if (!kostenCache.has(ks)) kostenCache.set(ks, await ladeControllingkosten(jahr, ks)); return kostenCache.get(ks)!; };
  const rows = await db.monatsabrechnung.findMany({
    where: { jahr, ...(kostenstelleId ? { kostenstelleId } : {}) },
    include: { person: { select: { vorname: true, nachname: true, angestellt: true } }, kunde: { select: { firmenname: true } }, einsatz: { select: { art: true, id: true } }, kostenstelle: { select: { provisionUeberlassung: true, provisionVermittlung: true, isZentrale: true } } },
  });
  // Art je Zeile: das neue Feld an der Abrechnungszeile hat Vorrang (freie Rechnungen haben keinen
  // Einsatz), sonst die Art des Einsatzes. Überlassung und Direktvermittlung desselben Paars laufen
  // als getrennte Gruppen – sonst kippt ein einziger Vermittlungs-Einsatz alle Überlassungsmonate
  // auf 50 % Provision (bzw. umgekehrt ein Vermittlungshonorar auf 20 %).
  const artVon = (r: (typeof rows)[number]): EinsatzArtKey =>
    r.art === "DIREKTVERMITTLUNG" || (r.art == null && r.einsatz?.art === "DIREKTVERMITTLUNG") ? "DIREKTVERMITTLUNG" : "UEBERLASSUNG";
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.personId}|${r.kundeId}|${artVon(r)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  // Erster Durchgang: je Mitarbeiter-Kunde-Paar den DB1 rechnen. Die Kostenumlage kommt erst danach,
  // weil sie wissen muss, wie viele Mitarbeiter in welchem Monat überhaupt aktiv waren.
  type Vorlauf = { g: typeof rows; j: ReturnType<typeof rueckstellungenJahr>; art: EinsatzArtKey; pctProv: number; ks: string };
  const vorlauf: Vorlauf[] = [];
  const aktiveJeKsUndMonat = new Map<string, number[]>();
  for (const [, g] of groups) {
    const verrechnung: Monatswerte = Array(12).fill(null);
    const grundlohn: Monatswerte = Array(12).fill(null);
    const ist: Monatswerte = Array(12).fill(null); const sz: Monatswerte = Array(12).fill(null);
    for (const r of g) {
      if (r.sonderzahlungIst != null) sz[r.monat - 1] = r.sonderzahlungIst;
      if (r.verrechnung != null) verrechnung[r.monat - 1] = r.verrechnung;
      if (r.bruttolohn != null) grundlohn[r.monat - 1] = r.bruttolohn;
      if (r.selbstkostenIst != null) ist[r.monat - 1] = r.selbstkostenIst;
    }
    const j = rueckstellungenJahr(verrechnung, grundlohn, saetze, { selbstkostenIst: ist, sonderzahlungIst: sz });
    const f = g[0];
    const art: EinsatzArtKey = artVon(g[0]);
    const pctProv = f.kostenstelle.isZentrale ? 0 : provisionPct(f.kostenstelle, art); // Zentrale bekommt keine Provision – sie sieht DB1/DB2
    const zaehler = aktiveJeKsUndMonat.get(f.kostenstelleId) ?? Array(12).fill(0);
    for (let i = 0; i < 12; i++) if (j.monate[i].verrechnung !== 0 || j.monate[i].grundlohn !== 0) zaehler[i]++;
    aktiveJeKsUndMonat.set(f.kostenstelleId, zaehler);
    vorlauf.push({ g, j, art, pctProv, ks: f.kostenstelleId });
  }

  // Kostenumlage: Wenn für das Jahr echte Kostenpositionen erfasst sind, werden **diese** gegen den
  // DB1 gerechnet – aufgeteilt auf die Mitarbeiter, die im jeweiligen Monat tatsächlich im Einsatz
  // waren. Damit ergibt die Summe der DB2 genau den DB1 minus die real angefallenen Kosten, ohne
  // dass jemand einen Umlagebetrag schätzen und pflegen muss. Der von Hand gepflegte Satz je
  // Mitarbeiter bleibt als Rückfallebene, solange keine Kosten erfasst sind.
  const kostenMonateCache = new Map<string, number[] | null>();
  const kostenMonateFuer = async (ks: string): Promise<number[] | null> => {
    if (!kostenMonateCache.has(ks)) {
      const eigen = await kostenJahr(jahr, ks);
      const genutzt = eigen.summeJahr > 0 ? eigen : ks ? await kostenJahr(jahr, "") : eigen;
      kostenMonateCache.set(ks, genutzt.summeJahr > 0 ? genutzt.monate.map((m) => m.summe) : null);
    }
    return kostenMonateCache.get(ks)!;
  };

  const mitarbeiter: MitarbeiterAuswertung[] = [];
  for (const { g, j, art, pctProv, ks } of vorlauf) {
    const f = g[0];
    const kostenProMaManuell = umlage(await kostenFuer(ks), art);
    const kostenMonate = await kostenMonateFuer(ks);
    const aktive = aktiveJeKsUndMonat.get(ks) ?? Array(12).fill(0);
    const monate = j.monate.map((m, i) => {
      const aktiv = m.verrechnung !== 0 || m.grundlohn !== 0;
      // Ein Monat ohne erfasste Kostenposition fällt auf den Handsatz zurück – "0 Kosten" hieße sonst
      // volle Provision vom ungeschmälerten DB1, nur weil ein Monat in der Kostenerfassung fehlt.
      const ausPositionen = kostenMonate && aktive[i] > 0 && kostenMonate[i] > 0 ? kostenMonate[i] / aktive[i] : null;
      const satz = ausPositionen ?? kostenProMaManuell;
      const k = aktiv && satz != null ? satz : 0;
      const d2 = m.db1 - k;
      return { monat: m.monat, verrechnung: m.verrechnung, grundlohn: m.grundlohn, abgaben: m.dgAbgaben + m.sonderzahlungsanteil, db1: m.db1, kosten: k, db2: d2, provision: satz == null ? 0 : cent((d2 * pctProv) / 100) };
    });
    // Anderer Name als die importierte Funktion `kostenJahr` – sonst verdeckt die eine die andere.
    const kostenumlageJahr = monate.reduce((a, m) => a + m.kosten, 0);
    const db2Jahr = j.db1Jahr - kostenumlageJahr;
    mitarbeiter.push({
      personId: f.personId,
      kundeId: f.kundeId,
      name: `${f.person.vorname} ${f.person.nachname}`.trim(),
      kunde: f.kunde.firmenname,
      kostenstelleId: f.kostenstelleId,
      verrechnungJahr: j.verrechnungJahr,
      selbstkostenJahr: j.grundlohnJahr,
      abgabenRueckstellungenJahr: j.abgabenUndRueckstellungenJahr,
      db1Jahr: j.db1Jahr,
      db1Marge: j.db1Marge,
      art,
      provisionPct: pctProv,
      kostenJahr: kostenumlageJahr,
      rueckstellung: { zufuehrung: j.rueckstellungZufuehrungJahr, aufloesung: j.rueckstellungAufloesungJahr, stand: j.rueckstellungStand, monate: j.monate.map((m) => m.rueckstellungStand) },
      db2Jahr,
      // pctProv statt provision(): pctProv ist für die Zentrale bewusst 0 – die Zentrale bekommt keine
      // Provision. provision() hätte den Schlüssel der Kostenstelle blind angewandt und der Zentrale
      // 20 % ihres eigenen DB2 als "Provision" gutgeschrieben (der Grund für die falschen € 307).
      provisionJahr: kostenumlageJahr === 0 && kostenProMaManuell == null ? 0 : cent((db2Jahr * pctProv) / 100),
      monate,
    });
  }
  mitarbeiter.sort((a, b) => b.db1Jahr - a.db1Jahr);

  const kMap = new Map<string, Controlling["kunden"][number]>();
  for (const m of mitarbeiter) {
    const k = kMap.get(m.kundeId) ?? { kundeId: m.kundeId, kunde: m.kunde, verrechnungJahr: 0, selbstkostenJahr: 0, abgabenRueckstellungenJahr: 0, db1Jahr: 0, db1Marge: 0, db2Jahr: 0, provisionJahr: 0, anzahlMitarbeiter: 0 };
    k.verrechnungJahr += m.verrechnungJahr;
    k.provisionJahr += m.provisionJahr;
    k.db2Jahr += m.db2Jahr;
    k.selbstkostenJahr += m.selbstkostenJahr;
    k.abgabenRueckstellungenJahr += m.abgabenRueckstellungenJahr;
    k.db1Jahr += m.db1Jahr;
    k.anzahlMitarbeiter++;
    kMap.set(m.kundeId, k);
  }
  const kunden = [...kMap.values()].map((k) => ({ ...k, db1Marge: k.verrechnungJahr ? k.db1Jahr / k.verrechnungJahr : 0 })).sort((a, b) => b.db1Jahr - a.db1Jahr);

  // Empfehlungsprämien der Zentrale: sie mindern den DB1 im Monat der Auszahlung
  const praemienRows = await db.empfehlung.findMany({
    where: { status: "AUSBEZAHLT", belastetJahr: jahr, ...(kostenstelleId ? { werber: { kostenstelleId } } : {}) },
    select: { belastetMonat: true, praemieBetrag: true },
  });
  const praemienMonate = Array(12).fill(0) as number[];
  for (const r of praemienRows) if (r.belastetMonat) praemienMonate[r.belastetMonat - 1] += r.praemieBetrag ?? 0;
  const praemienSumme = praemienMonate.reduce((a, b) => a + b, 0);

  const umsatz = mitarbeiter.reduce((s, m) => s + m.verrechnungJahr, 0);
  const selbstkosten = mitarbeiter.reduce((s, m) => s + m.selbstkostenJahr, 0);
  const abgaben = mitarbeiter.reduce((s, m) => s + m.abgabenRueckstellungenJahr, 0);
  const db1Brutto = mitarbeiter.reduce((s, m) => s + m.db1Jahr, 0);
  const db1 = db1Brutto - praemienSumme;
  const kostenUmlage = mitarbeiter.reduce((s, m) => s + m.kostenJahr, 0);
  const provisionUeberlassung = mitarbeiter.filter((m) => m.art === "UEBERLASSUNG").reduce((s, m) => s + m.provisionJahr, 0);
  const provisionVermittlung = mitarbeiter.filter((m) => m.art === "DIREKTVERMITTLUNG").reduce((s, m) => s + m.provisionJahr, 0);
  const monatsreihe = MON.map((label, i) => ({
    monat: i + 1,
    label,
    umsatz: mitarbeiter.reduce((s, m) => s + m.monate[i].verrechnung, 0),
    selbstkosten: mitarbeiter.reduce((s, m) => s + m.monate[i].grundlohn, 0),
    abgaben: mitarbeiter.reduce((s, m) => s + m.monate[i].abgaben, 0),
    db1: mitarbeiter.reduce((s, m) => s + m.monate[i].db1, 0) - praemienMonate[i],
    praemien: praemienMonate[i],
    db2: mitarbeiter.reduce((s, m) => s + m.monate[i].db2, 0) - praemienMonate[i],
    provision: mitarbeiter.reduce((s, m) => s + m.monate[i].provision, 0),
  }));
  return {
    jahr,
    saetze,
    mitarbeiter,
    kunden,
    gesamt: {
      umsatz, selbstkosten, abgaben, db1Brutto, praemien: praemienSumme, db1, kostenUmlage, db2: db1 - kostenUmlage,
      provision: provisionUeberlassung + provisionVermittlung, provisionUeberlassung, provisionVermittlung,
      marge: umsatz ? db1 / umsatz : 0,
      personalkostenquote: umsatz ? selbstkosten / umsatz : 0,
      abgabenquote: umsatz ? abgaben / umsatz : 0,
      anzahlMitarbeiter: mitarbeiter.length,
      imMinus: mitarbeiter.filter((m) => m.db1Jahr < 0).length,
    },
    monatsreihe,
    praemien: { jahr, summe: praemienSumme, anzahl: praemienRows.length, monate: praemienMonate },
    kosten,
  };
}
