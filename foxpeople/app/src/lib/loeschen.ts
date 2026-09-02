import { db } from "./db";
import { loescheDatei } from "./storage";
import { summen } from "./geld";

/**
 * Endgültiges Löschen – nur Systemadmin.
 *
 * Zwei Stufen, bewusst getrennt:
 *
 * 1. **Normal** (Voreinstellung): Fakturierte Daten sind tabu. Wer einen Mitarbeiter löschen will, der
 *    auf einer Rechnung steht, muss zuerst die Rechnung stornieren oder löschen. So kann niemand aus
 *    Versehen eine Buchhaltung zerlegen.
 * 2. **Erzwingen**: Rechnungen und Abrechnungen werden mitgelöscht. Das ist für Testdaten und für
 *    echte Fehleingaben gedacht und im Protokoll klar als solches vermerkt.
 *
 * Achtung zur zweiten Stufe: Ausgangsrechnungen sind Bücher und Aufzeichnungen im Sinn des § 132 BAO
 * und sieben Jahre aufzubewahren. Für Probedaten vor dem Echtbetrieb ist das Löschen unproblematisch;
 * eine bereits an einen Kunden versendete Rechnung gehört storniert, nicht gelöscht.
 */
export class LoeschFehler extends Error {}

export interface LoeschOptionen {
  /** Fakturierte Daten (Rechnungen, abgerechnete Monate) mitlöschen statt abzulehnen. */
  erzwingen?: boolean;
}

/**
 * Rechnung samt Positionen löschen. Abrechnungen werden wieder auf „offen“ gestellt, damit der Monat
 * nicht als verrechnet gilt, obwohl es keine Rechnung mehr dazu gibt.
 */
export async function rechnungLoeschen(id: string) {
  const r = await db.rechnung.findUnique({ where: { id }, include: { dokumente: { select: { id: true, speicherpfad: true } } } });
  if (!r) return;
  await db.$transaction([
    db.monatsabrechnung.updateMany({ where: { rechnungId: id }, data: { rechnungId: null, status: "OFFEN" } }),
    db.rechnung.updateMany({ where: { storniertDurchId: id }, data: { storniertDurchId: null } }),
    db.dokument.updateMany({ where: { rechnungId: id }, data: { rechnungId: null } }),
    db.rechnung.delete({ where: { id } }), // Positionen per Cascade
  ]);
  if (r.pdfDokumentId) await dokumentLoeschen(r.pdfDokumentId).catch(() => undefined);
}

/**
 * Nach dem Entfernen einzelner Positionen die Rechnung wieder stimmig machen.
 * Bleibt keine Position übrig, ist die Rechnung gegenstandslos und wird ganz gelöscht.
 */
async function rechnungNachziehen(rechnungIds: string[]) {
  for (const rid of [...new Set(rechnungIds)]) {
    const r = await db.rechnung.findUnique({ where: { id: rid }, include: { positionen: { select: { betrag: true } } } });
    if (!r) continue;
    if (!r.positionen.length) { await rechnungLoeschen(rid); continue; }
    const { netto, ust, brutto } = summen(r.positionen, r.ustProzent);
    await db.rechnung.update({ where: { id: rid }, data: { netto, ust, brutto } });
  }
}

export async function einsatzLoeschen(id: string, o: LoeschOptionen = {}) {
  const e = await db.einsatz.findUnique({ where: { id }, include: { _count: { select: { rechnungspositionen: true, monatsabrechnungen: true } } } });
  if (!e) return;
  const fakturiert = await db.monatsabrechnung.count({ where: { einsatzId: id, status: "ABGERECHNET" } });
  if (fakturiert || e._count.rechnungspositionen) {
    if (!o.erzwingen) throw new LoeschFehler("Einsatz ist bereits abgerechnet/fakturiert – zuerst Rechnung stornieren bzw. löschen.");
    const pos = await db.rechnungsposition.findMany({ where: { einsatzId: id }, select: { rechnungId: true } });
    await db.rechnungsposition.deleteMany({ where: { einsatzId: id } });
    await rechnungNachziehen(pos.map((p) => p.rechnungId));
  }
  await db.$transaction([
    db.monatsabrechnung.deleteMany({ where: { einsatzId: id } }),
    db.vertrag.updateMany({ where: { einsatzId: id }, data: { einsatzId: null } }),
    // Das Wochenraster wurde bisher nur vom Einsatz entkoppelt und blieb stehen. Ergebnis: In der
    // Einsatzplanung standen Sollstunden für Monate, in denen es nachweislich keinen Einsatz gab –
    // eine Zahl ohne Grundlage, die niemand erklären kann. Es gehört mit dem Einsatz weg.
    db.wochenstatus.deleteMany({ where: { einsatzId: id } }),
    db.stundennachweis.updateMany({ where: { einsatzId: id }, data: { einsatzId: null } }),
    db.bewertung.updateMany({ where: { einsatzId: id }, data: { einsatzId: null } }),
    db.kundenBewertung.updateMany({ where: { einsatzId: id }, data: { einsatzId: null } }),
    db.einsatz.delete({ where: { id } }),
  ]);
}

export async function personLoeschen(id: string, o: LoeschOptionen = {}) {
  const p = await db.person.findUnique({ where: { id }, include: { einsaetze: { select: { id: true } }, dokumente: { select: { speicherpfad: true } } } });
  if (!p) return;
  const fakturiert = await db.monatsabrechnung.count({ where: { personId: id, status: "ABGERECHNET" } });
  const positionen = await db.rechnungsposition.count({ where: { personId: id } });
  if (fakturiert || positionen) {
    if (!o.erzwingen) throw new LoeschFehler("Mitarbeiter ist auf Rechnungen enthalten – zuerst Rechnungen stornieren/löschen oder den Mitarbeiter auf „Ausgeschieden“ setzen bzw. anonymisieren.");
    const pos = await db.rechnungsposition.findMany({ where: { personId: id }, select: { rechnungId: true } });
    await db.rechnungsposition.deleteMany({ where: { personId: id } });
    await rechnungNachziehen(pos.map((x) => x.rechnungId));
  }
  for (const e of p.einsaetze) await einsatzLoeschen(e.id, o);
  await db.$transaction([
    db.zeitbuchung.deleteMany({ where: { personId: id } }),
    db.monatsabrechnung.deleteMany({ where: { personId: id } }),
    db.vertrag.updateMany({ where: { personId: id }, data: { personId: null } }),
    db.empfehlung.updateMany({ where: { empfohlenePersonId: id }, data: { empfohlenePersonId: null } }),
    db.person.delete({ where: { id } }), // Qualifikationen, Abwesenheiten, Dokumente, Nachrichten, Nachweise, Bewertungen usw. per Cascade
  ]);
  for (const d of p.dokumente) await loescheDatei(d.speicherpfad).catch(() => undefined);
}

export async function kundeLoeschen(id: string, o: LoeschOptionen = {}) {
  const k = await db.kunde.findUnique({ where: { id }, include: { einsaetze: { select: { id: true } }, _count: { select: { rechnungen: true } }, dokumente: { select: { speicherpfad: true } } } });
  if (!k) return;
  if (k._count.rechnungen) {
    if (!o.erzwingen) throw new LoeschFehler("Kunde hat Rechnungen – zuerst Rechnungen stornieren/löschen oder den Kunden auf „Inaktiv“ setzen.");
    const rs = await db.rechnung.findMany({ where: { kundeId: id }, select: { id: true } });
    for (const r of rs) await rechnungLoeschen(r.id);
  }
  for (const e of k.einsaetze) await einsatzLoeschen(e.id, o);
  await db.$transaction([
    db.monatsabrechnung.deleteMany({ where: { kundeId: id } }),
    db.vertrag.updateMany({ where: { kundeId: id }, data: { kundeId: null } }),
    db.bewertung.updateMany({ where: { kundeId: id }, data: { kundeId: null } }),
    db.angebot.deleteMany({ where: { kundeId: id } }),
    db.person.updateMany({ where: { hinterlegterKundeId: id }, data: { hinterlegterKundeId: null } }),
    db.kunde.delete({ where: { id } }), // Ansprechpartner, Konditionen, Dokumente, Aktivitäten per Cascade
  ]);
  for (const d of k.dokumente) await loescheDatei(d.speicherpfad).catch(() => undefined);
}

export async function dokumentLoeschen(id: string) {
  const d = await db.dokument.findUnique({ where: { id } });
  if (!d) return;
  await db.$transaction([
    db.qualifikation.updateMany({ where: { dokumentId: id }, data: { dokumentId: null } }),
    db.person.updateMany({ where: { fotoDokumentId: id }, data: { fotoDokumentId: null } }),
    db.stundennachweis.updateMany({ where: { fotoDokumentId: id }, data: { fotoDokumentId: null } }),
    db.abwesenheit.updateMany({ where: { dokumentId: id }, data: { dokumentId: null } }),
    db.vertrag.updateMany({ where: { pdfEntwurfDokumentId: id }, data: { pdfEntwurfDokumentId: null } }),
    db.vertrag.updateMany({ where: { pdfUnterschriebenDokumentId: id }, data: { pdfUnterschriebenDokumentId: null } }),
    db.rechnung.updateMany({ where: { pdfDokumentId: id }, data: { pdfDokumentId: null } }),
    db.dokument.delete({ where: { id } }),
  ]);
  await loescheDatei(d.speicherpfad).catch(() => undefined);
}

export async function vertragLoeschen(id: string) {
  const v = await db.vertrag.findUnique({ where: { id } });
  if (!v) return;
  await db.dokument.updateMany({ where: { vertragId: id }, data: { vertragId: null } });
  await db.vertrag.delete({ where: { id } });
}

// ---------------------------------------------------------------- Bestand bereichsweise leeren

/**
 * Ganze Bereiche auf einmal leeren – für das Aufräumen der Probedaten vor dem Echtbetrieb.
 *
 * Bewusst nicht als „Datenbank zurücksetzen“ gebaut: Firma, Kostenstellen, Nutzer, KV-Tabellen,
 * Zulagen und Vorlagen bleiben immer stehen. Gelöscht wird nur der laufende Bestand, und zwar in
 * der Reihenfolge, in der die Abhängigkeiten es zulassen.
 */
export const BEREICHE = [
  { key: "rechnungen", label: "Rechnungen", hinweis: "Abrechnungen werden wieder auf „offen“ gestellt." },
  { key: "einsaetze", label: "Einsätze & Abrechnungen", hinweis: "Rechnungspositionen dazu werden mitgelöscht." },
  { key: "vertraege", label: "Verträge", hinweis: "Abgelegte PDFs bleiben unter Dokumente." },
  { key: "angebote", label: "Angebote", hinweis: "" },
  { key: "stundennachweise", label: "Stundennachweise", hinweis: "Auch die Wochenmeldungen aus der App." },
  { key: "kunden", label: "Kunden", hinweis: "Mit Ansprechpartnern, Konditionen, Angeboten, Einsätzen und Rechnungen." },
  { key: "bewerber", label: "Bewerber (Status „sucht“)", hinweis: "Mit Qualifikationen und Dokumenten." },
  { key: "mitarbeiter", label: "Mitarbeiter (alle übrigen Personen)", hinweis: "Mit Einsätzen, Nachweisen, Dokumenten und App-Zugang." },
] as const;

export type Bereich = (typeof BEREICHE)[number]["key"];

const personWo = (b: "bewerber" | "mitarbeiter", kostenstelleId?: string) => ({
  ...(kostenstelleId ? { kostenstelleId } : {}),
  status: b === "bewerber" ? ("SUCHT" as const) : { not: "SUCHT" as const },
});

/** Nachweise und Wochenmeldungen hängen an der Person, nicht an der Kostenstelle. */
const nachweisWo = (kostenstelleId?: string) => (kostenstelleId ? { person: { kostenstelleId } } : {});

/** Wie viele Datensätze ein Bereich derzeit enthält – für die Anzeige vor dem Löschen. */
export async function bestandZaehlen(kostenstelleId?: string): Promise<Record<Bereich, number>> {
  const wo = kostenstelleId ? { kostenstelleId } : {};
  const [rechnungen, einsaetze, vertraege, angebote, stundennachweise, kunden, bewerber, mitarbeiter] = await Promise.all([
    db.rechnung.count({ where: wo }),
    db.einsatz.count({ where: wo }),
    db.vertrag.count({ where: wo }),
    db.angebot.count({ where: wo }),
    db.stundennachweis.count({ where: nachweisWo(kostenstelleId) }),
    db.kunde.count({ where: wo }),
    db.person.count({ where: personWo("bewerber", kostenstelleId) }),
    db.person.count({ where: personWo("mitarbeiter", kostenstelleId) }),
  ]);
  return { rechnungen, einsaetze, vertraege, angebote, stundennachweise, kunden, bewerber, mitarbeiter };
}

/**
 * Einen Bereich leeren. Immer mit `erzwingen`, sonst wäre die Funktion sinnlos – wer hier landet,
 * hat den Bereich bewusst ausgewählt und die Sicherheitsabfrage getippt.
 */
export async function bereichLeeren(bereich: Bereich, kostenstelleId?: string): Promise<number> {
  const wo = kostenstelleId ? { kostenstelleId } : {};
  switch (bereich) {
    case "rechnungen": {
      const rs = await db.rechnung.findMany({ where: wo, select: { id: true } });
      for (const r of rs) await rechnungLoeschen(r.id);
      return rs.length;
    }
    case "einsaetze": {
      const es = await db.einsatz.findMany({ where: wo, select: { id: true } });
      for (const e of es) await einsatzLoeschen(e.id, { erzwingen: true });
      // Abrechnungen ohne Einsatz (z. B. händisch angelegte Monate) bleiben sonst stehen
      await db.monatsabrechnung.deleteMany({ where: wo });
      return es.length;
    }
    case "vertraege": {
      const vs = await db.vertrag.findMany({ where: wo, select: { id: true } });
      for (const v of vs) await vertragLoeschen(v.id);
      return vs.length;
    }
    case "angebote":
      return (await db.angebot.deleteMany({ where: wo })).count;
    case "stundennachweise": {
      const n = (await db.stundennachweis.deleteMany({ where: nachweisWo(kostenstelleId) })).count;
      await db.wochenstatus.deleteMany({ where: nachweisWo(kostenstelleId) });
      return n;
    }
    case "kunden": {
      const ks = await db.kunde.findMany({ where: wo, select: { id: true } });
      for (const k of ks) await kundeLoeschen(k.id, { erzwingen: true });
      return ks.length;
    }
    case "bewerber":
    case "mitarbeiter": {
      const ps = await db.person.findMany({ where: personWo(bereich, kostenstelleId), select: { id: true } });
      for (const p of ps) await personLoeschen(p.id, { erzwingen: true });
      return ps.length;
    }
  }
}
