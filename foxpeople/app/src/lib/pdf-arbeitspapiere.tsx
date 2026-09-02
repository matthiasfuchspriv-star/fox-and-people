import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { datum, num } from "./format";
import type { Firma } from "./einstellungen";
import { zulageText, type EinsatzZulage } from "./zulagen";

/**
 * Arbeitspapiere im Layout der Word-Vorlagen von Matthias (Stand 01.09.2026):
 * „Arbeitsvertrag_Vorlage.docx“, „Ueberlassungsmitteilung_Vorlage.docx“, „Zusatzvereinbarung_Vorlage.docx“.
 *
 * Die Texte stehen hier WÖRTLICH wie in den Vorlagen – geändert wird nur, was Platzhalter ist.
 * Bekannte Daten werden eingesetzt; was die Software nicht weiß, bleibt ein sichtbares
 * Ausfüllfeld (Linie zum handschriftlichen Ergänzen), niemals ein stiller Leerstring.
 *
 * Ränder und Schrift orientieren sich an den Vorlagen (A4, ~2 cm Rand, 10-Punkt-Grundschrift),
 * Kopf- und Fußzeile entsprechen dem Briefkopf: links die Wortmarke mit Rost-Balken, rechts der
 * Rechtsträger-Block mit Telefon/E-Mail in Rost, darunter eine Trennlinie; unten
 * „Blackburn Beteiligungs GmbH (Fox & People) · <Dokument> · Seite X von Y“.
 */

const ROST = "#b4522c";
const TINTE = "#1a1a1a";
const GRAU = "#6b7477";

const S = StyleSheet.create({
  // lineHeight bewusst NICHT auf der Seite: Eine geerbte Zeilenhöhe lässt react-pdf die dynamische
  // Fußzeile (Seitenzähler über die render-Eigenschaft) falsch vermessen – sie verschwindet dann
  // komplett. Deshalb steht die Zeilenhöhe an den Absätzen, nicht an der Seite.
  // WICHTIG: fontSize muss im selben Stil stehen wie lineHeight – react-pdf rechnet den Faktor
  // sonst gegen die Standardgröße 18 statt der geerbten 9,6 (Zeilen doppelt so hoch wie gewollt).
  page: { paddingTop: 46, paddingBottom: 58, paddingHorizontal: 55, fontSize: 9.6, fontFamily: "Helvetica", color: TINTE },
  p: { marginBottom: 3.5, fontSize: 9.6, textAlign: "justify", lineHeight: 1.24 },
  abschnitt: { flexDirection: "row", alignItems: "center", marginTop: 7, marginBottom: 3 },
  abschnittBalken: { width: 3, height: 11, backgroundColor: ROST, marginRight: 6 },
  abschnittText: { fontSize: 10.2, fontFamily: "Helvetica-Bold" },
  fett: { fontFamily: "Helvetica-Bold" },
});

/** Wert einsetzen oder sichtbares Ausfüllfeld (zum handschriftlichen Ergänzen) drucken. */
export function Feld({ v, breite = 16, fett = true }: { v: string | null | undefined; breite?: number; fett?: boolean }) {
  if (v && v.trim()) return <Text style={fett ? S.fett : undefined}>{v}</Text>;
  return <Text>{"_".repeat(Math.max(6, breite))}</Text>;
}
const feldText = (v: string | null | undefined, breite = 16) => (v && v.trim() ? v : "_".repeat(Math.max(6, breite)));

/** Briefkopf wie in den Word-Vorlagen: Wortmarke links, Firmenblock rechts, Trennlinie darunter. */
export function VorlagenKopf({ f }: { f: Firma }) {
  return (
    <View fixed>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flexDirection: "row", alignItems: "stretch", gap: 8 }}>
          <View style={{ width: 4, backgroundColor: TINTE }} />
          <View>
            <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", letterSpacing: 2.4, color: TINTE, lineHeight: 1.04 }}>FOX <Text style={{ color: ROST }}>&</Text></Text>
            <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", letterSpacing: 2.4, color: TINTE, lineHeight: 1.04 }}>PEOPLE</Text>
            <Text style={{ fontSize: 5.4, letterSpacing: 1.6, color: GRAU, marginTop: 2 }}>PERSONALÜBERLASSUNG · BERATUNG</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 7.6, color: GRAU }}>{f.rechtstraeger}</Text>
          <Text style={{ fontSize: 7.6, color: GRAU }}>{f.strasse}, {f.plz} {f.ort}</Text>
          <Text style={{ fontSize: 7.6, color: GRAU }}>{f.firmenbuch}</Text>
          <Text style={{ fontSize: 7.6, color: GRAU }}>Tel <Text style={{ color: ROST, fontFamily: "Helvetica-Bold" }}>{f.telefon}</Text> · <Text style={{ color: ROST, fontFamily: "Helvetica-Bold" }}>{f.email}</Text></Text>
        </View>
      </View>
      <View style={{ borderBottomWidth: 1, borderBottomColor: ROST, marginTop: 8, marginBottom: 14 }} />
    </View>
  );
}

export function VorlagenFuss({ f, dokument }: { f: Firma; dokument: string }) {
  // Ein einzelnes fixiertes Text-Element (Trennlinie über borderTop) – ein Fragment mit mehreren
  // fixierten Kindern wertet diese react-pdf-Version beim Seitenumbruch nicht zuverlässig aus.
  return (
    <Text fixed style={{ position: "absolute", bottom: 24, left: 55, right: 55, fontSize: 7.6, color: GRAU, textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#cccccc", paddingTop: 5 }} render={({ pageNumber, totalPages }) => `${f.rechtstraeger} (${f.name}) · ${dokument} · Seite ${pageNumber} von ${totalPages}`} />
  );
}

function Abschnitt({ t }: { t: string }) {
  return (
    <View style={S.abschnitt} wrap={false} minPresenceAhead={40}>
      <View style={S.abschnittBalken} />
      <Text style={S.abschnittText}>{t}</Text>
    </View>
  );
}

const anredeVon = (geschlecht?: string | null) => (geschlecht === "W" ? "Frau" : geschlecht === "M" ? "Herr" : null);

// ================================================================ Arbeitsvertrag

export interface ArbeitsvertragDaten {
  firma: Firma;
  nummer: string;
  person: { vorname: string; nachname: string; geschlecht?: string | null; geburtsdatum: Date | null; strasse: string | null; plz: string | null; ort: string | null; urlaubsanspruchTage?: number | null };
  /** Beginn des Dienstverhältnisses (Eintritt bzw. Einsatzbeginn) */
  eintritt: Date | null;
  /** Verwendung, z. B. „Staplerfahrer (BG B)“ */
  verwendung: string | null;
  /** Einsatzbereich, z. B. „Niederösterreich“ */
  einsatzbereich: string | null;
  /** KV-Mindeststundenlohn (Kollektivvertrag Arbeitskräfteüberlassung) der Einstufung */
  kvMindestlohn: number | null;
  wochenstunden: number | null;
  erstelltAm?: Date;
}

export function ArbeitsvertragPdf(d: ArbeitsvertragDaten) {
  const f = d.firma, p = d.person;
  const anrede = anredeVon(p.geschlecht);
  const adresse = [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const stand = d.erstelltAm ?? new Date();
  return (
    <Document title={`Arbeitsvertrag ${d.nummer}`} author={f.name}>
      <Page size="A4" style={S.page}>
        <VorlagenKopf f={f} />
        <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 2, marginBottom: 4 }}>ARBEITSVERTRAG</Text>
        <View style={{ borderBottomWidth: 0.8, borderBottomColor: ROST, marginBottom: 9 }} />

        <View style={{ flexDirection: "row", marginBottom: 2 }}>
          <Text style={[S.fett, { width: "34%" }]}>Dienstgeber (DG):</Text>
          <View style={{ width: "66%" }}>
            <Text>{f.rechtstraeger} (handelnd unter der Marke „{f.name}“)</Text>
            <Text>AUT-{f.plz} {f.ort}, {f.strasse} · {f.firmenbuch}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", marginBottom: 9, marginTop: 3 }}>
          <Text style={[S.fett, { width: "34%" }]}>Dienstnehmer/in (DN):</Text>
          <View style={{ width: "66%" }}>
            <Text style={S.fett}>{anrede ? `${anrede} ` : ""}{p.vorname} {p.nachname}</Text>
            <Text>Geburtsdatum: {p.geburtsdatum ? datum(p.geburtsdatum) : "____________"}</Text>
            <Text>{feldText(adresse, 40)}</Text>
          </View>
        </View>

        <Abschnitt t="I. Beginn und Dauer des Dienstverhältnisses" />
        <Text style={S.p}>1. Das Dienstverhältnis beginnt am <Text style={S.fett}>{d.eintritt ? datum(d.eintritt) : "____________"}</Text> und wird auf unbestimmte Zeit abgeschlossen.</Text>
        <Text style={S.p}>2. Das erste Monat gilt als Probezeit, in der das Dienstverhältnis jederzeit von beiden Vertragsseiten ohne Angabe von Gründen gelöst werden kann.</Text>

        <Abschnitt t="II. Kündigungsfrist und Kündigungstermine" />
        <Text style={S.p}>1. Nach Ablauf des Probemonats kann das Dienstverhältnis nach den gesetzlichen und kollektivvertraglichen Bestimmungen der Arbeitskräfteüberlassung gekündigt werden.</Text>
        <Text style={S.p}>2. Bei Kündigung durch den Arbeitnehmer betragen die kollektivvertraglichen Kündigungsfristen derzeit nach ununterbrochener Betriebszugehörigkeit bis 24 Monate 2 Wochen, danach 4 Wochen. Kollektivvertraglicher Kündigungstermin ist derzeit das Ende der betrieblichen Arbeitswoche.</Text>
        <Text style={S.p}>3. Bei Kündigung durch den Arbeitgeber betragen die kollektivvertraglichen Kündigungsfristen derzeit nach ununterbrochener Betriebszugehörigkeit bis 12 Monate 2 Wochen (ab 1.1.2023: 3 Wochen), bis 18 Monate 4 Wochen, bis 2 Jahre 6 Wochen, bis 5 Jahre 2 Monate, bis 15 Jahre 3 Monate, bis 25 Jahre 4 Monate und danach 5 Monate. In den ersten 18 Monaten der Betriebszugehörigkeit gilt als Kündigungstermin das Ende der Arbeitswoche, danach der 15. oder Letzte eines jeden Monats. Soweit gesetzliche oder kollektivvertragliche Bestimmungen für den Arbeitgeber eine kürzere Kündigungsfrist oder häufigere Kündigungstermine vorsehen, gelten diese.</Text>

        <Abschnitt t="III. Vorgesehene Verwendung / Einsatzbereich" />
        <Text style={S.p}>1. Die Verwendung des/der Arbeitnehmer/in ist die Überlassung an Dritte als <Feld v={d.verwendung} breite={26} />. Die Auswahl und der Wechsel des Beschäftigers obliegt ausschließlich dem DG.</Text>
        <Text style={S.p}>2. Der mögliche Einsatzbereich erstreckt sich auf <Feld v={d.einsatzbereich} breite={22} />. Eine Entsendung ins Ausland ist zulässig, wenn der/die Arbeitnehmer/in im Einzelfall seine/ihre Zustimmung erteilt.</Text>
        <Text style={S.p}>3. Der/Die Arbeitnehmer/in wird allen Anweisungen und Handlungsvorschriften in den jeweiligen Beschäftigerbetrieben Folge leisten, sofern dadurch nicht gegen gesetzliche Bestimmungen verstoßen wird. Der/Die Arbeitnehmer/in wird weiters die Arbeitnehmerschutzvorschriften beachten und zur Verfügung gestellte Arbeitskleidung sowie Schutzausrüstung schonend behandeln und nach dem Arbeitseinsatz der empfangsberechtigten Person nachweislich wieder zurückgeben.</Text>
        <Text style={S.p}>4. Während der überlassungsfreien Zeit ist der/die Arbeitnehmer/in verpflichtet, sich während der beim Arbeitgeber üblichen, 38,5 Stunden nicht überschreitenden Normalarbeitszeit, erreichbar zu halten und täglich um 08:00 Uhr im Büro des Arbeitgebers persönlich zu erscheinen.</Text>
        <Text style={S.p}>5. Der/Die Arbeitnehmer/in hat am Einsatzort pünktlich zu erscheinen und seine/ihre Arbeit an diesem zu erbringen. Erscheint der/die Arbeitnehmer/in bei Beginn oder während der Überlassung nicht oder nicht pünktlich am Arbeitsplatz bzw. Einsatzort, hat der/die Arbeitnehmer/in den Arbeitgeber für sämtliche dadurch entstehende Schäden und Nachteile schadlos zu erhalten. Bei Krankheit oder sonstiger Verhinderung hat der/die Arbeitnehmer/in den Arbeitgeber unverzüglich darüber zu verständigen. Wenn der/die Arbeitnehmer/in durch Krankheit an der Erbringung seiner/ihrer Arbeitsleistung verhindert ist, hat der/die Arbeitnehmer/in dem Arbeitgeber ab dem 1. Tag der Verhinderung eine Bestätigung eines österreichischen Arztes oder der Gesundheitskasse vorzulegen. Die Verletzung dieser Verpflichtung kann einen Entlassungsgrund mit Verlust auf Entgeltfortzahlung darstellen. Der/die Arbeitnehmer/in nimmt zur Kenntnis, dass der Beschäftiger dem Arbeitgeber nicht immer eine Verhinderung mitteilt und der/die Arbeitnehmer/in daher nicht davon ausgehen darf, dass der Arbeitgeber bereits über die Verhinderung informiert ist.</Text>

        <Abschnitt t="IV. Einstufung" />
        <Text style={S.p}>Die Einstufung des/der Arbeitnehmer/in erfolgt laut Kollektivvertrag für das Gewerbe der Arbeitskräfteüberlassung – Arbeiter einvernehmlich. Er/Sie erklärt, dass sämtliche für die Einstufung erforderliche Unterlagen (LAP, Zeugnisse, Zertifikate) vollständig und richtig dem Arbeitgeber vorgelegt wurden.</Text>

        <Abschnitt t="V. Entlohnung" />
        <Text style={S.p}>1. Der Mindeststundenlohn beträgt laut Kollektivvertrag für das Gewerbe der Arbeitskräfteüberlassung EUR <Feld v={d.kvMindestlohn != null ? num(d.kvMindestlohn) : null} breite={8} /> brutto pro Stunde.</Text>
        <Text style={S.p}>2. Während der Überlassung besteht - falls höher - Anspruch auf den kollektivvertraglichen Mindestlohn laut Kollektivvertrag des Beschäftiger-Betriebes, in bestimmten Branchen mit Zuschlägen.</Text>
        <Text style={S.p}>3. Die Sonderzahlungen, insbesondere Urlaubszuschuss und Weihnachtsremuneration, gebührt laut den Bestimmungen des Kollektivvertrags für das Gewerbe der Arbeitskräfteüberlassung.</Text>
        <Text style={S.p}>4. Alle Entgeltzahlungen erfolgen monatlich im Nachhinein bis spätestens zum 15. eines Folgemonats auf das Konto des/der Arbeitnehmer/in.</Text>
        <Text style={S.p}>5. Macht der Arbeitgeber über die gesetzlich, kollektivvertraglich oder vertraglich geregelten Entgeltansprüche hinausgehende Zuwendungen an den/die Arbeitnehmer/in, anerkennt diese/r den freiwilligen, unverbindlichen und jederzeit widerrufbaren Charakter solcher Zuwendungen und erklärt, ausdrücklich darauf zu verzichten, aus einer Wiederholung derartiger Zuwendungen einen Rechtsanspruch auf die Auszahlung eines solchen Betrages oder überhaupt einer Zuwendung in Folgeperioden abzuleiten.</Text>

        <Abschnitt t="VI. Erholungsurlaub" />
        <Text style={S.p}>Der Urlaubsanspruch richtet sich nach den Bestimmungen des Urlaubsgesetzes und nach dem anzuwendenden Kollektivvertrag. Der Urlaubsanspruch des/der Arbeitnehmer/in beträgt <Feld v={p.urlaubsanspruchTage != null ? String(p.urlaubsanspruchTage) : null} breite={6} /> Arbeitstage pro Jahr. Der Urlaubsverbrauch ist mit dem Arbeitgeber schriftlich zu vereinbaren und wird stundenweise abgerechnet.</Text>

        <Abschnitt t="VII. Arbeitszeit und Überstunden" />
        <Text style={S.p}>1. Die Normalarbeitszeit des/der Arbeitnehmer/in ist <Feld v={d.wochenstunden != null ? num(d.wochenstunden) : null} breite={8} /> h/Woche.</Text>
        <Text style={S.p}>2. Die Einteilung der Arbeitszeit obliegt dem Arbeitgeber bzw. dem Beschäftiger. Eine Änderung der Arbeitszeit bleibt vorbehalten.</Text>
        <Text style={S.p}>3. Der/Die Arbeitnehmer verpflichtet sich, im gesetzlichen bzw. kollektivvertraglichen Rahmen, angeordnete Mehr- und Überstunden zu leisten.</Text>
        <Text style={S.p}>4. Die Arbeitskraft ist verpflichtet, über ihre tatsächlich erbrachten Arbeitsstunden vollständige Aufzeichnungen mit allen Mehrarbeits-, Fehl- und Zeitausgleichstunden zu führen und diese zum Ende der Arbeitswoche bzw. zum Einsatzende vom Beschäftiger bestätigen zu lassen und wöchentlich dem Arbeitgeber zu übermitteln.</Text>
        <Text style={S.p}>5. Mehr- und Überstunden sind nur auf ausdrückliche Anordnung des Dienstgebers bzw. des Beschäftigers zu leisten.</Text>

        <Abschnitt t="VIII. Sonstige Pflichten des/der Arbeitnehmer/in" />
        <Text style={S.p}>1. Der/Die Arbeitnehmer/in ist verpflichtet, eine Änderung der Wohnanschrift bzw. eine Änderung seines Lebensmittelpunktes unverzüglich dem Arbeitgeber schriftlich zu melden.</Text>
        <Text style={S.p}>2. Der/Die Arbeitnehmer/in ist verpflichtet, jede Arbeitsverhinderung unter Angabe des Grundes dem Arbeitgeber unverzüglich bekanntzugeben. Eine Bekanntgabe an den Beschäftiger ist NICHT ausreichend. Weiters ist der/die Arbeitnehmer/in verpflichtet, unaufgefordert geeignete Nachweise (etwa eine den gesetzlichen Anforderungen entsprechende Krankenstandsbestätigung) in Schriftform oder per E-Mail an den Arbeitgeber zu übermitteln.</Text>
        <Text style={S.p}>3. Der/die Arbeitnehmer/in ist verpflichtet, Geschäftsgeheimnisse und sonstige vertrauliche Informationen des Arbeitgebers und des Beschäftigers zu wahren und gegenüber jedermann geheim zu halten. Diese Verpflichtung gilt zeitlich unbegrenzt, auch nach Ende des Arbeitsverhältnisses. Für den Fall des Verstoßes gegen die Geheimhaltungsverpflichtung verpflichtet sich der/die Arbeitnehmer/in, eine Konventionalstrafe in Höhe des dreifachen Bruttomonatsentgelts zu bezahlen. Berechnungsgrundlage ist das zuletzt bezogene Brutto-Monatsentgelt inklusive anteiliger Sonderzahlungen und variabler Entgeltsbestandteile. Die Geltendmachung darüberhinausgehender Ansprüche bleibt vorbehalten.</Text>

        <Abschnitt t="IX. Konventionalstrafen" />
        <Text style={S.p}>Bei termin- oder fristwidriger Lösung des Arbeitsverhältnisses durch den/die Arbeitnehmer/in, bei gerechtfertigter und verschuldeter Entlassung oder unberechtigtem vorzeitigem Austritt, schuldet den/die Arbeitnehmer/in eine sofort fällige und aufrechenbare Vertragsstrafe von zwei Brutto-Monatsentgelten. Berechnungsgrundlage ist das zuletzt bezogene Brutto-Monatsentgelt inklusive anteiliger Sonderzahlungen und variabler Entgeltsbestandteile. Die Geltendmachung darüberhinausgehender Ansprüche bleibt vorbehalten.</Text>

        <Abschnitt t="X. Sonstige Bestimmungen" />
        <Text style={S.p}>1. Der/Die Arbeitnehmer/in bestätigt, dass die Bestimmungen dieses Arbeitsvertrages mit ihm/ihr vor Unterfertigung erörtert wurden.</Text>
        <Text style={S.p}>2. Der/Die Arbeitnehmer/in bestätigt mit seiner/ihrer Unterschrift, dass ihm/ihr eine Ausfertigung dieses Vertrages ausgehändigt wurde.</Text>
        <Text style={S.p}>3. Der Arbeitgeber leistet Beiträge nach dem BMVG in die Mitarbeitervorsorgekasse. Name und Anschrift der Mitarbeitervorsorgekasse: <Feld v={f.mvk} breite={38} /></Text>

        <Abschnitt t="XI. Digitale Mitarbeiterkommunikation" />
        <Text style={S.p}>Der/die Arbeitnehmer/in ist damit einverstanden, dass er/sie Erklärungen des Arbeitgebers verbindlich über die vom Arbeitgeber zur Verfügung gestellte Plattform „<Feld v={f.app} breite={18} />“ erhält und verpflichtet sich zur entsprechenden Einrichtung und Nutzung auf seinem/ihrem Smartphone. Der Arbeitgeber weist ausdrücklich darauf hin, dass empfohlen wird, die „Push-Mitteilungen“ zu aktivieren, um aktuelle Erklärungen und Benachrichtigungen stets sofort zu erhalten.</Text>

        <View wrap={false} style={{ marginTop: 16 }}>
          <Text style={{ marginBottom: 22 }}><Text style={S.fett}>{f.ort}</Text>, am <Text style={S.fett}>{datum(stand)}</Text></Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ width: "46%", borderTopWidth: 0.7, borderTopColor: "#888", paddingTop: 3 }}><Text style={{ fontSize: 8.4, color: GRAU }}>Dienstgeber (DG)</Text></View>
            <View style={{ width: "46%", borderTopWidth: 0.7, borderTopColor: "#888", paddingTop: 3 }}><Text style={{ fontSize: 8.4, color: GRAU }}>Dienstnehmer/in (DN)</Text></View>
          </View>
        </View>

        <VorlagenFuss f={f} dokument="Arbeitsvertrag" />
      </Page>
    </Document>
  );
}

// ================================================================ Überlassungsmitteilung

export interface UeberlassungsmitteilungDaten {
  firma: Firma;
  nummer: string;
  angestellt: boolean;
  person: { vorname: string; nachname: string; geschlecht?: string | null; geburtsdatum: Date | null; strasse: string | null; plz: string | null; ort: string | null; beschaeftigungsgruppe: string | null };
  kunde: { firmenname: string; strasse: string | null; plz: string | null; ort: string | null; kollektivvertrag: string | null };
  einsatz: { von: Date; bis: Date | null; rolle: string; wochenstunden: number; stundenlohn: number | null; referenzzuschlag?: number | null; zulagen: EinsatzZulage[]; einsatzort: string | null; nachtschwerarbeit?: boolean | null; schwerarbeit?: boolean | null; dreischicht?: boolean };
  erstelltAm?: Date;
}

function ZeileLR({ l, r, breit }: { l: string; r: React.ReactNode; breit?: boolean }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2.5 }} wrap={false}>
      <Text style={{ width: breit ? "62%" : "40%" }}>{l}</Text>
      <View style={{ width: breit ? "38%" : "60%" }}>{typeof r === "string" ? <Text style={S.fett}>{r}</Text> : r}</View>
    </View>
  );
}

export function UeberlassungsmitteilungPdf(d: UeberlassungsmitteilungDaten) {
  const f = d.firma, p = d.person, k = d.kunde, e = d.einsatz;
  const anrede = anredeVon(p.geschlecht);
  const adresse = [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const kundeAdresse = [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const dauer = e.bis ? `befristet bis ${datum(e.bis)}` : "1 Monat Probezeit / danach unbefristet";
  const stand = d.erstelltAm ?? new Date();
  // 3-Schicht: ob Nachtschwerarbeitsgesetz/Schwerarbeitsverordnung greifen, hängt vom konkreten
  // Einsatz ab – das entscheidet keine Software. Ohne ausdrückliche Angabe bleibt es bei 3-Schicht
  // ein Ausfüllfeld statt eines automatischen „nein“.
  const janein = (wert: boolean | null | undefined) => (wert === true ? "ja" : wert === false ? "nein" : e.dreischicht ? null : "nein");
  // Entgelt (§ 12 Z 8 AÜG): Grundlohn, Referenzzuschlag in Euro, Zulagen – wie in der Vorlage
  // („Position | Satz | FW“), mit Leerzeilen zum handschriftlichen Ergänzen.
  const entgelt: { pos: string; satz: string; fett?: boolean }[] = [
    { pos: `${e.rolle}${p.beschaeftigungsgruppe ? ` (BG ${p.beschaeftigungsgruppe})` : ""}`, satz: e.stundenlohn != null ? num(e.stundenlohn) : "________" },
  ];
  if (e.referenzzuschlag) entgelt.push({ pos: `Referenzzuschlag § 10 AÜG (${k.kollektivvertrag ?? "Beschäftiger-KV"})`, satz: num(e.referenzzuschlag) });
  if (e.referenzzuschlag && e.stundenlohn != null) entgelt.push({ pos: "Stundenlohn gesamt", satz: num(e.stundenlohn + e.referenzzuschlag), fett: true });
  for (const z of e.zulagen) entgelt.push(z.art === "PROZENT_STUNDENLOHN"
    ? { pos: `${z.name} (${zulageText(z)})`, satz: e.stundenlohn != null ? num(((e.stundenlohn + (e.referenzzuschlag ?? 0)) * z.wert) / 100) : "" }
    : { pos: `${z.name}${z.art === "EURO_TAG" ? " (je Tag)" : ""}`, satz: num(z.wert) });
  while (entgelt.length < 5) entgelt.push({ pos: "", satz: "" });

  return (
    <Document title={`Überlassungsmitteilung ${d.nummer}`} author={f.name}>
      <Page size="A4" style={S.page}>
        <VorlagenKopf f={f} />
        <Text style={{ fontSize: 12.5, fontFamily: "Helvetica-Bold", marginBottom: 1 }}>{d.angestellt ? "Angestellte/r" : "Arbeiter"}</Text>
        <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 9 }}>Überlassungsmitteilung</Text>

        <View style={{ flexDirection: "row", marginBottom: 3 }}>
          <Text style={{ width: "34%" }}>Dienstgeber (DG):</Text>
          <View style={{ width: "66%" }}>
            <Text>{f.rechtstraeger} ({f.name})</Text>
            <Text>{f.strasse}, {f.plz} {f.ort}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", marginBottom: 9, marginTop: 3 }}>
          <Text style={{ width: "34%" }}>Dienstnehmer/in (DN):</Text>
          <View style={{ width: "66%" }}>
            <Text style={S.fett}>{anrede ? `${anrede} ` : ""}{p.vorname} {p.nachname}</Text>
            <Text>Geburtsdatum: <Text style={S.fett}>{p.geburtsdatum ? datum(p.geburtsdatum) : "____________"}</Text></Text>
            <Text style={S.fett}>{feldText(adresse, 36)}</Text>
          </View>
        </View>

        <Text style={S.p}>Gemäß §12 AÜG werden Sie über die für die Überlassung wesentlichen Umstände informiert:</Text>

        <ZeileLR l="1. Arbeitsbeginn:" r={datum(e.von)} />
        <ZeileLR l="2. Beschäftiger:" r={<View><Text style={S.fett}>{k.firmenname}</Text><Text style={S.fett}>{feldText(kundeAdresse, 34)}</Text></View>} />
        <ZeileLR l="3. Einsatzort:" r={feldText(e.einsatzort ?? k.ort, 24)} />
        <ZeileLR l="4. Kollektivvertrag Beschäftiger:" r={feldText(k.kollektivvertrag, 30)} />
        <ZeileLR l="5. Art der verrichtenden Arbeit:" r={`${e.rolle}${p.beschaeftigungsgruppe ? ` (BG ${p.beschaeftigungsgruppe})` : ""}`} />
        <ZeileLR l="6. Beschäftigungsdauer:" r={dauer} />
        <ZeileLR l="Gültig ab:" r={datum(e.von)} />
        <ZeileLR l="7. Wöchentliche Normalarbeitszeit:" r={<Text><Text style={S.fett}>{num(e.wochenstunden)}</Text> Stunden</Text>} />

        <Text style={[S.p, { marginTop: 4 }]}>8. Entgelt (brutto):</Text>
        <View style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: TINTE, paddingBottom: 2, marginBottom: 2 }}>
            <Text style={[S.fett, { width: "62%" }]}>Position</Text>
            <Text style={[S.fett, { width: "28%", textAlign: "right" }]}>Satz</Text>
            <Text style={[S.fett, { width: "10%", textAlign: "right" }]}>FW</Text>
          </View>
          {entgelt.map((z, i) => (
            <View key={i} style={{ flexDirection: "row", paddingVertical: 1.5, borderBottomWidth: 0.4, borderBottomColor: "#dddddd" }}>
              <Text style={{ width: "62%", fontFamily: z.fett ? "Helvetica-Bold" : "Helvetica" }}>{z.pos || " "}</Text>
              <Text style={{ width: "28%", textAlign: "right", fontFamily: z.fett ? "Helvetica-Bold" : "Helvetica" }}>{z.satz || " "}</Text>
              <Text style={{ width: "10%", textAlign: "right" }}>EUR</Text>
            </View>
          ))}
        </View>

        <ZeileLR breit l="9. Das Nachtschwerarbeitergesetz kommt zur Anwendung:" r={feldText(janein(e.nachtschwerarbeit), 10)} />
        <ZeileLR breit l="10. Die Schwerarbeiterverordnung kommt zur Anwendung:" r={feldText(janein(e.schwerarbeit), 10)} />

        <Text style={[S.p, { marginTop: 4 }]}>11. Die ausgegebenen Stundennachweise sind vollständig ausgefüllt und vom Beschäftiger bestätigt, wöchentlich, persönlich oder elektronisch beim Überlasser abzugeben.</Text>
        <Text style={S.p}>12. Der/Die Arbeitnehmer/in bestätigt, gemäß § 9 Abs. 4 ASchG vom Überlasser über die Gefahren, denen er/sie auf dem Arbeitsplatz ausgesetzt sein kann, über die für den Arbeitsplatz oder die Tätigkeit erforderliche Eignung oder die erforderlichen Fachkenntnisse, sowie über die Notwendigkeit von Eignungs- und Folgeuntersuchungen informiert worden zu sein.</Text>
        <Text style={S.p}>13. Der/Die Arbeitnehmer/in nimmt zur Kenntnis, dass der Beschäftiger den Arbeitgeber nicht über sämtliche notwendigen Informationen, wie insbesondere über eine Dienstverhinderung, in Kenntnis setzt und deshalb eine Meldung im Falle einer Verhinderung jedenfalls an den Arbeitgeber zu erfolgen hat.</Text>
        <Text style={[S.p, S.fett]}>14. Diese Überlassungsmitteilung ist integrierter Bestandteil des Arbeitsvertrages.</Text>

        <View wrap={false} style={{ marginTop: 15 }}>
          <Text style={{ marginBottom: 10 }}><Text style={S.fett}>{f.ort}</Text>, am <Text style={S.fett}>{datum(stand)}</Text></Text>
          <Text style={[S.fett, { marginBottom: 22 }]}>{f.rechtstraeger}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ width: "46%", borderTopWidth: 0.7, borderTopColor: "#888", paddingTop: 3 }}><Text style={{ fontSize: 8.4, color: GRAU }}>Dienstgeber (DG)</Text></View>
            <View style={{ width: "46%", borderTopWidth: 0.7, borderTopColor: "#888", paddingTop: 3 }}><Text style={{ fontSize: 8.4, color: GRAU }}>Dienstnehmer/in (DN)</Text></View>
          </View>
        </View>

        <VorlagenFuss f={f} dokument="Überlassungsmitteilung" />
      </Page>
    </Document>
  );
}

// ================================================================ Zusatzvereinbarung

export interface ZusatzvereinbarungDaten {
  firma: Firma;
  nummer: string;
  person: { vorname: string; nachname: string; geschlecht?: string | null };
  erstelltAm?: Date;
}

export function ZusatzvereinbarungPdf(d: ZusatzvereinbarungDaten) {
  const f = d.firma, p = d.person;
  const anrede = anredeVon(p.geschlecht);
  const stand = d.erstelltAm ?? new Date();
  return (
    <Document title={`Zusatzvereinbarung ${d.nummer}`} author={f.name}>
      <Page size="A4" style={S.page}>
        <VorlagenKopf f={f} />
        <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 1 }}>Zusatzvereinbarung</Text>
        <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 8 }}>Wichtige Information zu Urlaub, Zeitausgleich und Krankenstand</Text>

        <Text style={[S.p, { color: GRAU }]}>Mitarbeiter/in: <Text style={[S.fett, { color: TINTE }]}>{anrede ? `${anrede} ` : ""}{p.vorname} {p.nachname}</Text></Text>

        <Text style={[S.p, S.fett, { marginTop: 6 }]}>Das ist zu tun, wenn Sie Urlaub oder Zeitausgleich benötigen:</Text>
        <Text style={S.p}>Der Zeitpunkt des Urlaubsantrittes oder Zeitausgleichs kann nicht einseitig bestimmt werden, sondern ist zwischen {f.rechtstraeger} ({f.name}) und Ihnen als Arbeitnehmer/in unter Rücksichtnahme auf die Erfordernisse des Beschäftigers (die Firma, wo Sie arbeiten) zu vereinbaren.</Text>
        <Text style={S.p}>Urlaubs- bzw. Zeitausgleichsanträge haben vor Urlaubsantritt genehmigt bei {f.name} aufzuliegen. Nicht bekannt gegebene oder nicht genehmigte Urlaube bzw. Zeitausgleich werden Ihnen als unbezahlter Urlaub verrechnet!</Text>
        <Text style={[S.p, { fontSize: 8.4 }]}><Text style={S.fett}>Erläuterung zu unbezahltem Urlaub:</Text> Während dieser Zeit ruhen die Rechte und Pflichten aus dem Dienstverhältnis; es besteht insbesondere keine Arbeitspflicht des Dienstnehmers bzw. keine Pflicht zur Leistung laufender Bezüge und der aliquoten Sonderzahlungen seitens des Überlassers. Die Zeit des unbezahlten Urlaubes bleibt hinsichtlich aller Rechtsansprüche des Dienstnehmers, die sich nach der Dienstzeit richten, unberücksichtigt.</Text>

        <Text style={[S.p, S.fett, { marginTop: 6 }]}>Das ist zu tun, wenn ein Krankenstand vorliegt:</Text>
        <Text style={S.p}>Wenn Sie krank sind, sind Sie verpflichtet, uns als Ihren Arbeitgeber unverzüglich die Arbeitsverhinderung (= den Krankenstand) mitzuteilen – durch einen Anruf bei {f.name} (Tel. <Text style={[S.fett, { color: ROST }]}>{f.telefon}</Text>), am besten vor oder zu Arbeitsbeginn, sowie bei Ihrem Beschäftiger (die Firma, wo Sie arbeiten).</Text>
        <Text style={S.p}>Zusätzlich muss die Krankmeldung bei {f.name} unmittelbar und unaufgefordert vorbeigebracht werden.</Text>
        <Text style={S.p}>Bei unentschuldigtem Fernbleiben, sprich, wenn Sie Ihren Melde- und Nachweispflichten nicht nachkommen, verlieren Sie für die Dauer der Säumnis Ihren Anspruch auf Entgelt – der Lohn bzw. das Entgelt wird nicht bezahlt, solange Sie sich nicht krankgemeldet und/oder uns die nötigen Krankmeldungen gebracht haben.</Text>

        <Text style={[S.p, S.fett, { marginTop: 6 }]}>Mit Ihrer Unterschrift bestätigen Sie, dass Sie die oben angeführten Punkte gelesen und zur Kenntnis genommen haben.</Text>

        <View wrap={false} style={{ marginTop: 28, flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ width: "46%", borderTopWidth: 0.7, borderTopColor: "#888", paddingTop: 3 }}>
            <Text style={{ fontSize: 8.8 }}><Text style={S.fett}>{f.ort}</Text>, am <Text style={S.fett}>{datum(stand)}</Text></Text>
          </View>
          <View style={{ width: "46%", borderTopWidth: 0.7, borderTopColor: "#888", paddingTop: 3 }}>
            <Text style={{ fontSize: 8.4, color: GRAU }}>Unterschrift Dienstnehmer/in (DN)</Text>
          </View>
        </View>

        <VorlagenFuss f={f} dokument="Zusatzvereinbarung – Urlaub, Zeitausgleich, Krankenstand" />
      </Page>
    </Document>
  );
}
