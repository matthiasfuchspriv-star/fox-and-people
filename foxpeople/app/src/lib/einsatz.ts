import { db } from "./db";
import { brauchtArbeitsbewilligung, IST_BEWILLIGUNG } from "./staaten";
import { istAusweis, istBewilligung } from "./dokumente";
import { massgeblicherMindestlohn } from "./mindestlohn";
import { referenzKvFuer } from "./referenzlohn";

/**
 * Wie ein Einsatz geendet hat. Bewusst eine feste Liste statt Freitext: Nur so lässt sich später
 * auswerten, wie viele Einsätze am Beschäftiger, am Mitarbeiter oder schlicht am Auftragsende
 * gescheitert sind – und nur so kann die Wiedereinsatzquote etwas aussagen.
 */
export const AUFLOESUNGSARTEN = [
  "– offen –",
  "Einsatzende laut Plan",
  "Verlängerung nicht zustande gekommen",
  "Kunde hat abberufen",
  "Übernahme durch den Beschäftiger",
  "Mitarbeiter hat gekündigt",
  "Kündigung durch uns",
  "Einvernehmliche Auflösung",
  "Entlassung",
  "Vorzeitiger Austritt",
  "Krankheit / Arbeitsunfähigkeit",
  "Nicht erschienen",
] as const;

export interface Konflikt {
  typ: "DOPPELBUCHUNG" | "GESPERRT" | "NICHT_VERFUEGBAR" | "QUALIFIKATION" | "RAHMENVERTRAG" | "KV_MINDESTLOHN" | "REFERENZZUSCHLAG" | "AUSWEIS";
  text: string; hart: boolean;
}

/** Vorwarnzeit für ablaufende Bewilligungen, Ausweise und Nachweise: 8 Wochen. */
export const VORWARNUNG_TAGE = 56;
const MAXDATUM = new Date(8640000000000000);

/** Konfliktprüfung vor dem Anlegen/Ändern eines Einsatzes */
export async function pruefeEinsatz(opts: { personId: string; kundeId: string; von: Date; bis: Date | null; rolle: string; stundenlohn?: number | null; referenzlohn?: number | null; referenzGeprueft?: boolean; beschaeftigerBg?: string | null; ausgenommenEinsatzId?: string }): Promise<Konflikt[]> {
  const k: Konflikt[] = [];
  const [p, kunde, andere, sperren] = await Promise.all([
    db.person.findUnique({ where: { id: opts.personId }, include: { qualifikationen: true, dokumente: { select: { kategorie: true, gultigBis: true } }, kv: { include: { lohntabelle: true } } } }),
    db.kunde.findUnique({ where: { id: opts.kundeId }, include: { vertraege: { where: { typ: "RAHMENVERTRAG" } } } }),
    db.einsatz.findMany({ where: { personId: opts.personId, status: { in: ["GEPLANT", "AKTIV"] }, ...(opts.ausgenommenEinsatzId ? { id: { not: opts.ausgenommenEinsatzId } } : {}) }, include: { kunde: true } }),
    db.sperre.findMany({ where: { personId: opts.personId, OR: [{ kundeId: null }, { kundeId: opts.kundeId }] }, include: { grund: true, kunde: true } }),
  ]);
  if (!p) return [{ typ: "GESPERRT", text: "Person nicht gefunden", hart: true }];
  if (p.status === "GESPERRT") k.push({ typ: "GESPERRT", text: `Person ist gesperrt (seit ${p.gesperrtSeit?.toLocaleDateString("de-AT")}).`, hart: true });
  if (p.status === "AUSGESCHIEDEN") k.push({ typ: "GESPERRT", text: "Person ist ausgeschieden.", hart: true });
  const ende = opts.bis ?? MAXDATUM;
  // Sperrlisten-Katalog: generelle Sperre oder Sperre nur bei diesem Beschäftiger
  for (const s of sperren) {
    if (s.bis && s.bis < opts.von) continue; // Sperre schon vorbei
    if (s.ab && s.ab > ende) continue; // Sperre beginnt erst nach dem Einsatzende – blockiert diesen Einsatz nicht
    const wo = s.kundeId ? `bei ${s.kunde?.firmenname ?? "diesem Kunden"}` : "generell";
    k.push({ typ: "GESPERRT", text: `Mitarbeiter ist ${wo} gesperrt: ${s.grund?.bezeichnung ?? s.notiz ?? "Sperre"}${s.bis ? ` (bis ${s.bis.toLocaleDateString("de-AT")})` : ""}.`, hart: s.grund?.sperrtEinsatz !== false });
  }
  // Drittstaatsangehörige: ohne gültige Arbeitsbewilligung / Aufenthaltstitel kein Einsatz (AuslBG).
  // Der Nachweis zählt aus beiden Quellen – als Dokument (neu, der richtige Ort) oder als
  // Qualifikation (alt, aus den bestehenden Akten).
  if (brauchtArbeitsbewilligung(p.staatsangehoerigkeit)) {
    const ausDokumenten = p.dokumente.filter((d) => istBewilligung(d.kategorie)).map((d) => ({ typ: d.kategorie, gultigBis: d.gultigBis }));
    const bew = [...p.qualifikationen.filter((q) => IST_BEWILLIGUNG.test(q.typ)), ...ausDokumenten];
    const gueltig = bew.find((q) => !q.gultigBis || q.gultigBis >= opts.von);
    if (!gueltig) k.push({ typ: "QUALIFIKATION", text: `${p.staatsangehoerigkeit}: Arbeitsbewilligung / Aufenthaltstitel mit Arbeitsmarktzugang fehlt oder ist abgelaufen – bitte als Nachweis mit Ablaufdatum hinterlegen.`, hart: true });
    else if (gueltig.gultigBis) {
      const warnBis = new Date(opts.von.getTime() + VORWARNUNG_TAGE * 86400000);
      if (gueltig.gultigBis < ende || gueltig.gultigBis <= warnBis)
        k.push({ typ: "QUALIFIKATION", text: `Arbeitsbewilligung (${gueltig.typ}) läuft am ${gueltig.gultigBis.toLocaleDateString("de-AT")} ab – rechtzeitig verlängern, sonst endet der Einsatz mit diesem Tag.`, hart: false });
    }
  }
  k.push(...ausweisPruefen(p, opts.von));

  for (const e of andere) {
    const eEnde = e.bis ?? MAXDATUM;
    if (e.von <= ende && eEnde >= opts.von) k.push({ typ: "DOPPELBUCHUNG", text: `Überschneidung mit Einsatz bei ${e.kunde.firmenname} (${e.von.toLocaleDateString("de-AT")} – ${e.bis ? e.bis.toLocaleDateString("de-AT") : "offen"}).`, hart: false });
  }
  if (p.verfuegbarAb && p.verfuegbarAb > opts.von && !p.verfuegbarSofort) k.push({ typ: "NICHT_VERFUEGBAR", text: `Person ist erst ab ${p.verfuegbarAb.toLocaleDateString("de-AT")} verfügbar.`, hart: false });
  for (const q of p.qualifikationen) {
    if (q.gultigBis && q.gultigBis < ende && q.gultigBis < (opts.bis ?? new Date(opts.von.getTime() + 90 * 86400000))) k.push({ typ: "QUALIFIKATION", text: `${q.typ} läuft am ${q.gultigBis.toLocaleDateString("de-AT")} ab – ${q.gultigBis < opts.von ? "bereits abgelaufen" : "innerhalb des Einsatzes"}.`, hart: q.gultigBis < opts.von });
  }
  const rolle = opts.rolle.toLowerCase();
  if (/stapler/.test(rolle) && !p.qualifikationen.some((q) => /stapler/i.test(q.typ))) k.push({ typ: "QUALIFIKATION", text: "Rolle erfordert Staplerschein – kein Nachweis hinterlegt.", hart: false });
  if (/kran/.test(rolle) && !p.qualifikationen.some((q) => /kran/i.test(q.typ))) k.push({ typ: "QUALIFIKATION", text: "Rolle erfordert Kranschein – kein Nachweis hinterlegt.", hart: false });
  if (/schweiß|schweiss/.test(rolle) && !p.qualifikationen.some((q) => /schweiß|schweiss/i.test(q.typ))) k.push({ typ: "QUALIFIKATION", text: "Rolle erfordert Schweißprüfung – kein Nachweis hinterlegt.", hart: false });
  // Einsätze dürfen über das Rahmenvertragsende hinausgehen und unbefristet (ohne Ende) sein – das Rahmenvertragsende
  // wird nur über die Wiedervorlage RAHMENVERTRAG_ABLAUF überwacht, nicht als Einsatz-Konflikt.
  if (kunde?.status === "INAKTIV") k.push({ typ: "RAHMENVERTRAG", text: "Kunde ist inaktiv.", hart: false });
  // Ohne unterschriebenen Rahmenvertrag samt AGB-Akzeptanz kein erster Einsatz (AGB Punkt 1/2)
  if (kunde?.rahmenvertragPflicht) {
    const unterschrieben = kunde.vertraege.some((v) => v.status === "UNTERSCHRIEBEN");
    if (!unterschrieben && !kunde.rahmenvertragBeginn)
      k.push({ typ: "RAHMENVERTRAG", text: "Kein unterschriebener Rahmenvertrag hinterlegt – vor dem ersten Einsatz Rahmenvertrag und AGB abschließen.", hart: true });
    else if (!kunde.agbAkzeptiertAm)
      k.push({ typ: "RAHMENVERTRAG", text: "AGB-Akzeptanz des Beschäftigers ist nicht dokumentiert – im Kundenstamm nachtragen.", hart: false });
  }
  const lohn = opts.stundenlohn ?? p.stundenlohn;
  // Besserer KV gilt (§ 10 AÜG / LSD-BG): max(KV AKÜ der Beschäftigungsgruppe, Referenzlohn Beschäftiger-KV, Hausregel) – harter Konflikt
  const ml = await massgeblicherMindestlohn({
    kvId: p.kvId, beschaeftigungsgruppe: p.beschaeftigungsgruppe,
    beschaeftigerKv: referenzKvFuer(kunde, p.angestellt), beschaeftigerBg: opts.beschaeftigerBg ?? null,
    eintritt: p.eintrittsdatum, am: opts.von,
  });
  if (lohn != null && lohn < ml.mindest - 0.005) k.push({ typ: "KV_MINDESTLOHN", text: `Stundenlohn ${lohn.toFixed(2)} € liegt unter dem maßgeblichen Mindestlohn ${ml.mindest.toFixed(2)} € (${ml.quellen.join(" · ")}) – Lohn- und Sozialdumping-Schutz, Einsatz nicht möglich.`, hart: true });
  if (lohn == null) k.push({ typ: "KV_MINDESTLOHN", text: `Kein Stundenlohn hinterlegt – Mindestlohn für diesen Einsatz: ${ml.mindest.toFixed(2)} € (${ml.quellen.join(" · ")}).`, hart: false });
  if (ml.referenzzuschlag > 0) k.push({ typ: "REFERENZZUSCHLAG", text: `Referenzzuschlag ${ml.referenzzuschlag.toFixed(2)} €/Std: Der Beschäftiger-KV liegt über dem KV AKÜ – Differenz gesondert auf der Lohnabrechnung ausweisen.`, hart: false });
  else if (ml.referenzPruefen) {
    // Kein Referenzlohn ermittelbar → der maßgebliche Mindestlohn stützt sich nur noch auf den KV AKÜ
    // und die Hausregel. Das ist der gefährlichste Zustand im ganzen Programm: Der Einsatz ginge mit
    // 13,90 € hinaus, obwohl der Beschäftiger-KV vielleicht 20 € vorschreibt – und das ist
    // Lohndumping mit Strafdrohung nach dem LSD-BG, nicht bloß ein Schönheitsfehler.
    //
    // Deshalb blockiert das Anlegen, sobald am Einsatz kein Referenzlohn von Hand eingetragen ist.
    // Zwei Wege weiter: die Lohntafel beim Kunden verknüpfen (Kundenstamm → Referenzlohn-Tafel), oder
    // den beim Beschäftiger erfragten Referenzlohn im Feld „Referenzlohn lt. Beschäftiger“ eintragen.
    // Nur für die metalltechnische Industrie sind die Lohntafeln exakt gepflegt. Alles hart zu
    // blockieren, was dort nicht steht, würde den Betrieb anhalten – und wer nicht arbeiten kann,
    // sucht sich einen Weg vorbei an der Prüfung. Deshalb verlangt die Software statt einer Sperre
    // eine **dokumentierte Entscheidung**: entweder der beim Beschäftiger erfragte Referenzlohn wird
    // eingetragen, oder es wird ausdrücklich bestätigt, dass nachgefragt wurde und kein Zuschlag
    // anfällt. Bei einer Prüfung nach dem LSD-BG zählt der nachvollziehbare Vorgang; ein stiller
    // Rückfall auf die Hausregel wäre dagegen nicht erklärbar.
    const vonHand = opts.referenzlohn != null && opts.referenzlohn > 0;
    const bestaetigt = vonHand || opts.referenzGeprueft === true;
    k.push({
      typ: "REFERENZZUSCHLAG",
      text: vonHand
        ? `Referenzlohn ${opts.referenzlohn!.toFixed(2)} €/Std von Hand eingetragen – wird am Einsatz mitgeschrieben. Die Lohntafel im Kundenstamm zu verknüpfen erspart das künftig.`
        : opts.referenzGeprueft
          ? `Referenzlohn beim Beschäftiger erfragt und bestätigt – wird mit Name und Zeitpunkt am Einsatz festgehalten.`
          : ml.gruppeFehlt
          ? `Für ${kunde?.kollektivvertrag ?? "den Beschäftiger-KV"} ist die Lohntafel hinterlegt, aber es ist keine Beschäftigungsgruppe des Beschäftigers gewählt – ohne sie lässt sich die richtige Zeile nicht finden. Gruppe oben im Feld „Beschäftigungsgruppe beim Beschäftiger" wählen; dann rechnet der Referenzzuschlag von selbst.`
          : `Referenzlohn des Beschäftigers ist nicht hinterlegt (${kunde?.kollektivvertrag ?? "am Kunden ist kein KV erfasst"}). Ohne ihn prüft die Software nur gegen den KV AKÜ und die Hausregel – ein Einsatz auf dieser Grundlage kann Lohndumping sein. Trag den erfragten Referenzlohn ein, bestätige die Nachfrage – oder halte einmalig fest, dass es für diesen Kollektivvertrag keinen Referenzzuschlag gibt.`,
      hart: !bestaetigt,
    });
  }
  return k;
}


/** Was von einer Person für die Ausweisprüfung gebraucht wird – bewusst schmal, damit prüfbar. */
export type AusweisDaten = {
  ausweisArt?: string | null;
  ausweisNummer?: string | null;
  ausweisGultigBis?: Date | null;
  ausweisDokumentId?: string | null;
  geburtsdatum?: Date | null;
  dokumente: { kategorie: string; gultigBis: Date | null }[];
  qualifikationen: { typ: string; gultigBis: Date | null }[];
};

export function ausweisPruefen(p: AusweisDaten, von: Date): Konflikt[] {
  const k: Konflikt[] = [];
  // Ausweiskopie ist Pflicht (Identitätsnachweis, § 12 AÜG-Dokumentation).
  //
  // Ein Ausweis kann an drei Stellen liegen: in den Stammdaten (Ausweisart/-nummer/gültig bis), als
  // hochgeladenes Dokument oder – aus den alten Akten – als Qualifikation. Früher prüfte das
  // Vorhandensein alle drei, das Ablaufdatum aber nur das Stammdatenfeld. Wer den gültigen Pass als
  // Dokument hinterlegte, während im Stammdatenfeld noch ein altes (oder versehentlich das
  // Geburts-)Datum stand, bekam beides zugleich zu lesen: "keine Ausweiskopie hinterlegt" und
  // "Ausweis abgelaufen". Jetzt zählen alle drei Quellen zusammen, und es gilt das späteste Datum.
  const ausweise: { quelle: string; bis: Date | null }[] = [
    // Die Quelle wird in der Meldung als „Ausweis (…)" gezeigt – hier steht deshalb nur, worum es
    // sich handelt und wo es steht, sonst liest man „Ausweis (Ausweis (Stammdaten))".
    ...(p.ausweisArt || p.ausweisNummer || p.ausweisGultigBis || p.ausweisDokumentId
      ? [{ quelle: p.ausweisArt ? `${p.ausweisArt}, Stammdaten` : "Stammdaten", bis: p.ausweisGultigBis ?? null }]
      : []),
    ...p.dokumente.filter((d) => istAusweis(d.kategorie)).map((d) => ({ quelle: d.kategorie, bis: d.gultigBis })),
    ...p.qualifikationen.filter((q) => /ausweis|reisepass|personalausweis|aufenthaltstitel/i.test(q.typ)).map((q) => ({ quelle: q.typ, bis: q.gultigBis })),
  ];
  if (!ausweise.length) {
    k.push({ typ: "AUSWEIS", text: "Keine Ausweiskopie hinterlegt – Identitätsnachweis ist vor dem ersten Einsatz Pflicht.", hart: false });
  } else if (ausweise.some((a) => !a.bis)) {
    // Mindestens einer ohne Ablaufdatum: kein Grund zu blockieren, aber nachtragen lassen
    k.push({ typ: "AUSWEIS", text: `Ausweis hinterlegt, aber ohne Ablaufdatum (${ausweise.filter((a) => !a.bis).map((a) => a.quelle).join(", ")}) – bitte nachtragen, sonst läuft er unbemerkt ab.`, hart: false });
  } else {
    const neuester = ausweise.reduce((a, b) => (a.bis! > b.bis! ? a : b));
    const bis = neuester.bis!;
    // Ein Ablaufdatum, das vor der Geburt oder mehr als 15 Jahre zurück liegt, ist kein abgelaufener
    // Ausweis, sondern ein Tippfehler – meistens das Geburtsdatum im Feld "gültig bis". Daran darf
    // die Einsatzplanung nicht scheitern; sie sagt, was zu korrigieren ist, und lässt weiterarbeiten.
    const unplausibel = (p.geburtsdatum && bis <= p.geburtsdatum) || bis < new Date(von.getTime() - 15 * 365 * 86400000);
    if (unplausibel)
      k.push({ typ: "AUSWEIS", text: `Ausweis (${neuester.quelle}): Das Ablaufdatum ${bis.toLocaleDateString("de-AT")} kann nicht stimmen – vermutlich steht dort das Geburts- oder Ausstellungsdatum. Bitte in den Stammdaten unter „Ausweis gültig bis" korrigieren.`, hart: false });
    else if (bis <= new Date(von.getTime() + VORWARNUNG_TAGE * 86400000))
      k.push({ typ: "AUSWEIS", text: `Ausweis (${neuester.quelle}) läuft am ${bis.toLocaleDateString("de-AT")} ab${ausweise.length > 1 ? " – das ist das späteste der hinterlegten Ablaufdaten" : ""}.`, hart: bis < von });
  }
  return k;
}
