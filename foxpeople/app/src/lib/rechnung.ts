import { db } from "./db";
import { tenantWhere, type Session } from "./auth";
import { naechsteNummer, nummerFreigeben } from "./nummern";
import { firma as ladeFirma } from "./einstellungen";
import { audit } from "./audit";
import { verrechnungAufschluesseln } from "./verrechnung";
import { cent, summen } from "./geld";

/** Verdichtet alle offenen Monatsabrechnungen eines Monats je Kunde zu einer Rechnung. */
export async function rechnungenErzeugen(s: Session, jahr: number, monat: number, nurKundeId?: string) {
  const f = await ladeFirma();
  const rows = await db.monatsabrechnung.findMany({ where: { ...tenantWhere(s), jahr, monat, status: "OFFEN", rechnungId: null, verrechnung: { not: null }, ...(nurKundeId ? { kundeId: nurKundeId } : {}) }, include: { person: true, kunde: true, einsatz: true } });
  const byKunde = new Map<string, typeof rows>();
  for (const r of rows) { if (!byKunde.has(r.kundeId)) byKunde.set(r.kundeId, []); byKunde.get(r.kundeId)!.push(r); }
  const erzeugt: string[] = [];
  for (const [kundeId, list] of byKunde) {
    const k = list[0].kunde;
    if (list.reduce((a, r) => a + (r.verrechnung ?? 0), 0) <= 0) continue;
    const nummer = await naechsteNummer(k.kostenstelleId, "RE", jahr);
    const heute = new Date();
    const faellig = new Date(heute.getTime() + (k.zahlungszielTage || 0) * 86400000);

    // Erst die Positionen bilden, dann daraus die Summen. Nie umgekehrt: sonst summieren sich die
    // Einzelposten auf dem PDF nicht auf den ausgewiesenen Nettobetrag, und das fällt jedem
    // Buchhalter auf (§ 11 UStG verlangt eine in sich stimmige Rechnung).
    const positionen = (await Promise.all(list.map(async (m) => {
      const verr = m.verrechnung ?? 0;
      // Normalstunden, Überstunden 50/100 % und Zulagen als eigene Positionen – sofern die Summe passt
      const auf = m.einsatzId ? await verrechnungAufschluesseln(m.einsatzId, m) : null;
      if (auf && auf.zeilen.length && Math.abs(auf.summe - verr) < 0.05) {
        return auf.zeilen.map((z) => ({ personId: m.personId, einsatzId: m.einsatzId, beschreibung: z.beschreibung, menge: z.menge, einheit: z.einheit, einzelpreis: cent(z.einzelpreis), betrag: cent(z.menge * cent(z.einzelpreis)) }));
      }
      // Rückfallebene: eine Pauschalzeile. Menge × Einzelpreis muss auch hier den Betrag ergeben.
      const menge = m.stunden ?? 1;
      const einzelpreis = cent(verr / (menge || 1));
      const zeile = {
        personId: m.personId, einsatzId: m.einsatzId,
        beschreibung: m.einsatz?.art === "DIREKTVERMITTLUNG" ? "Vermittlungshonorar" : m.stunden ? "Stunden (Pauschalsatz)" : `Überlassung ${String(monat).padStart(2, "0")}/${jahr}`,
        menge, einheit: m.stunden ? "Std." : "pauschal", einzelpreis, betrag: cent(menge * einzelpreis),
      };
      // Menge × gerundeter Einzelpreis kann vom Abrechnungsbetrag um bis zu ±(Menge × 0,005 €)
      // abweichen – bei 173 Stunden fast einen Euro. Die Differenz wird als eigene Ausgleichszeile
      // ausgewiesen, damit die Rechnung exakt den abgerechneten Betrag fakturiert und trotzdem
      // in sich stimmig bleibt (§ 11 UStG: Menge × Preis = Betrag je Zeile).
      const diff = cent(verr - zeile.betrag);
      if (Math.abs(diff) >= 0.01) {
        return [zeile, { personId: m.personId, einsatzId: m.einsatzId, beschreibung: "Rundungsausgleich", menge: 1, einheit: "pauschal", einzelpreis: diff, betrag: diff }];
      }
      return [zeile];
    }))).flat();

    const sum = summen(positionen, f.ustProzent);
    if (sum.netto <= 0) continue;
    // Rechnung und das Abhaken der Monatsabrechnungen gehoeren in einen Schritt. Sonst kann die
    // Rechnung entstehen und das Abhaken danach scheitern (Netz weg, Neustart) -- die Abrechnungen
    // blieben auf OFFEN und der naechste Lauf wuerde denselben Monat ein zweites Mal fakturieren.
    let r;
    try {
    r = await db.$transaction(async (tx) => {
      const angelegt = await tx.rechnung.create({
        data: {
          kostenstelleId: k.kostenstelleId, kundeId, nummer, leistungJahr: jahr, leistungMonat: monat, faelligAm: faellig, status: "ENTWURF",
          netto: sum.netto, ustProzent: f.ustProzent, ust: sum.ust, brutto: sum.brutto,
          positionen: { create: positionen },
        },
      });
      // Nur die Zeilen abhaken, die beim Einlesen noch offen und ohne Rechnung waren: haengt ein
      // zweiter Lauf gleichzeitig daran, geht die Zeile genau einmal durch.
      const abgehakt = await tx.monatsabrechnung.updateMany({
        where: { id: { in: list.map((x) => x.id) }, status: "OFFEN", rechnungId: null },
        data: { rechnungId: angelegt.id, status: "ABGERECHNET" },
      });
      if (abgehakt.count !== list.length) throw new Error(`Monatsabrechnung wurde zwischenzeitlich veraendert (${abgehakt.count} von ${list.length}) - Rechnung ${nummer} nicht erzeugt.`);
      return angelegt;
    });
    } catch (e) {
      // Die Nummer war schon gezogen, die Rechnung ist es nicht geworden: Nummer zurück in den Kreis,
      // sonst fehlt sie später in der lückenlosen Reihe und die Prüfung fragt danach.
      await nummerFreigeben(k.kostenstelleId, "RE", jahr, nummer).catch(() => {});
      throw e;
    }
    await audit(s, "CREATE", "Rechnung", r.id, `${nummer} für ${k.firmenname} (${list.length} Positionen)`, undefined, k.kostenstelleId);
    await db.aktivitaet.create({ data: { typ: "RECHNUNG", text: `Rechnung ${nummer} erstellt (${String(monat).padStart(2, "0")}/${jahr})`, nutzerName: s.name, kundeId } });
    erzeugt.push(r.id);
  }
  return erzeugt;
}

export const MAHNTEXTE = [
  { titel: "Zahlungserinnerung", text: (n: string, betrag: string, frist: string, iban: string) => `Sehr geehrte Damen und Herren,\n\nbei der Durchsicht unserer offenen Posten ist uns aufgefallen, dass die Rechnung ${n} über ${betrag} noch nicht beglichen wurde. Vermutlich ist sie im Tagesgeschäft untergegangen – das passiert.\n\nSollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos. Andernfalls ersuchen wir um Überweisung auf ${iban} bis spätestens ${frist}.\n\nFalls es zu der Rechnung Rückfragen gibt, rufen Sie mich bitte einfach an – das klärt sich meist in zwei Minuten.` },
  { titel: "1. Mahnung", text: (n: string, betrag: string, frist: string, iban: string) => `Sehr geehrte Damen und Herren,\n\ntrotz unserer Zahlungserinnerung ist die Rechnung ${n} über ${betrag} weiterhin offen. Wir ersuchen Sie, den Betrag bis spätestens ${frist} auf ${iban} zu überweisen.\n\nWir weisen darauf hin, dass uns gemäß § 456 UGB Verzugszinsen in Höhe von 9,2 Prozentpunkten über dem Basiszinssatz sowie gemäß § 458 UGB eine Betreibungskostenpauschale von EUR 40,00 zustehen.` },
  { titel: "Letzte Mahnung", text: (n: string, betrag: string, frist: string, iban: string) => `Sehr geehrte Damen und Herren,\n\ndie Rechnung ${n} über ${betrag} ist trotz Zahlungserinnerung und Mahnung nach wie vor unbeglichen. Wir setzen Ihnen hiermit eine letzte Frist bis ${frist} zur Überweisung auf ${iban} – zuzüglich Verzugszinsen und Betreibungskostenpauschale.\n\nSollte bis dahin kein Zahlungseingang erfolgen, übergeben wir die Forderung ohne weitere Ankündigung an ein Inkassobüro bzw. leiten das gerichtliche Mahnverfahren ein.` },
];
