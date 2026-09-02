import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { eur, datum, MONATE_LANG } from "./format";
import type { Firma } from "./einstellungen";

const S = StyleSheet.create({
  page: { padding: 48, paddingBottom: 70, fontSize: 10, fontFamily: "Helvetica", color: "#10222a", lineHeight: 1.45 },
  head: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#10222a" },
  small: { fontSize: 8, color: "#6b7477" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5, color: "#10222a" },
  p: { marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd9d0", paddingVertical: 5 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#10222a", paddingVertical: 5, fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#10222a", textTransform: "uppercase" },
  right: { textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  box: { backgroundColor: "#efede7", borderRadius: 6, padding: 10, marginTop: 8 },
  foot: { position: "absolute", bottom: 28, left: 48, right: 48, borderTopWidth: 0.5, borderTopColor: "#ddd9d0", paddingTop: 6, fontSize: 7.5, color: "#6b7477", flexDirection: "row", justifyContent: "space-between" },
  addr: { fontSize: 7.5, color: "#6b7477", marginBottom: 2 },
});

/**
 * Briefkopf nach Vorlage (Matthias, 30.08.2026): links Balken + zweizeilige Wortmarke FOX & / PEOPLE mit Untertitel,
 * rechts Rechtsträger, Adresse, FN/UID, Telefon · E-Mail – in den Markenfarben (Anthrazit, Rost).
 */
export function Briefkopf({ firma, ks }: { firma: Firma; ks?: { name: string; strasse?: string | null; plz?: string | null; ort?: string | null; email?: string | null; telefon?: string | null } | null }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 30 }}>
      <View style={{ flexDirection: "row", alignItems: "stretch", gap: 10 }}>
        <View style={{ width: 4, backgroundColor: "#b4522c" }} />
        <View>
          <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 3, color: "#10222a", lineHeight: 1.05 }}>FOX <Text style={{ color: "#b4522c" }}>&</Text></Text>
          <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 3, color: "#10222a", lineHeight: 1.05 }}>PEOPLE</Text>
          <Text style={{ fontSize: 5.8, letterSpacing: 1.4, color: "#8a8f92", marginTop: 3 }}>PERSONALÜBERLASSUNG · BERATUNG</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", fontSize: 8, color: "#6b7477", lineHeight: 1.4 }}>
        <Text>{firma.rechtstraeger}</Text>
        <Text>{ks?.strasse ?? firma.strasse}, {ks?.plz ?? firma.plz} {ks?.ort ?? firma.ort}</Text>
        <Text>{firma.firmenbuch} · UID {firma.uid}</Text>
        <Text>Tel <Text style={{ color: "#b4522c", fontFamily: "Helvetica-Bold" }}>{ks?.telefon ?? firma.telefon}</Text> · <Text style={{ color: "#b4522c", fontFamily: "Helvetica-Bold" }}>{ks?.email ?? firma.email}</Text></Text>
      </View>
    </View>
  );
}
const Kopf = Briefkopf;

function Fuss({ firma }: { firma: Firma }) {
  return (
    <View style={S.foot} fixed>
      <Text>{firma.rechtstraeger} · {firma.firmenbuch} · UID {firma.uid}</Text>
      <Text>{firma.bank ? `${firma.bank} · ` : ""}IBAN {firma.iban}{firma.bic ? ` · BIC ${firma.bic}` : ""}</Text>
      <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`} />
    </View>
  );
}
function Empfaenger({ k }: { k: { firmenname: string; strasse?: string | null; plz?: string | null; ort?: string | null; land?: string | null; uid?: string | null }; }) {
  return <View style={{ marginBottom: 22 }}><Text style={S.addr}>{`An`}</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{k.firmenname}</Text>{k.strasse && <Text>{k.strasse}</Text>}<Text>{[k.plz, k.ort].filter(Boolean).join(" ")}</Text>{k.land && k.land !== "Österreich" && <Text>{k.land}</Text>}{k.uid && <Text style={S.small}>UID {k.uid}</Text>}</View>;
}

// ---------------------------------------------------------------- Angebot
export interface AngebotPdfDaten {
  firma: Firma; ks: { name: string; strasse?: string | null; plz?: string | null; ort?: string | null; email?: string | null };
  nummer: string; datum: Date; gultigBis: Date | null; betreff: string; einleitung?: string | null; schlusstext?: string | null;
  kunde: { firmenname: string; strasse?: string | null; plz?: string | null; ort?: string | null; land?: string | null; uid?: string | null };
  ansprechpartner?: string | null;
  positionen: {
    rolle: string; kalkulationsart: string; preis: number | null; einheit: string;
    /** „KV Metallindustrie · Gruppe C“ – steht als eigene Spalte im Angebot */
    einstufung?: string | null;
    /** Zuschlagszeilen, die unter der Position ausgewiesen werden */
    zuschlaege?: { bezeichnung: string; satz: number | null; einheit: string }[];
  }[];
  /** true = der Beschäftiger schickt uns die Stundenzettel; false = wir schicken den Nachweis zur Freigabe */
  stundennachweisVomKunden?: boolean;
  erstelltVon?: string | null;
}
export function AngebotPdf(d: AngebotPdfDaten) {
  // Bewusst ohne Mengen, Monatsstunden und Volumen: Das Angebot nennt die Sätze, abgerechnet wird
  // nach den tatsächlich geleisteten Stunden. Eine hochgerechnete Monatssumme im Angebot liest sich
  // wie eine Zusage über die Menge – und ist der erste Punkt, über den später gestritten wird.
  const zahlungsziel = d.firma.zahlungszielTage > 0 ? `${d.firma.zahlungszielTage} Tage netto` : "sofort nach Rechnungserhalt ohne Abzug";
  return (
    <Document title={`Angebot ${d.nummer}`} author={d.firma.name}>
      <Page size="A4" style={S.page}>
        <Kopf firma={d.firma} ks={d.ks} />
        <Empfaenger k={d.kunde} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
          <View><Text style={S.h1}>Angebot {d.nummer}</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{d.betreff}</Text></View>
          <View style={{ alignItems: "flex-end" }}><Text>Datum: {datum(d.datum)}</Text>{d.gultigBis && <Text>Gültig bis: {datum(d.gultigBis)}</Text>}{d.ansprechpartner && <Text style={S.small}>z. H. {d.ansprechpartner}</Text>}</View>
        </View>
        <Text style={S.p}>{d.einleitung ?? `Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot für die Überlassung bzw. Vermittlung von Arbeitskräften:`}</Text>
        <View style={S.th}><Text style={{ width: "40%" }}>Position</Text><Text style={{ width: "32%" }}>Einstufung</Text><Text style={{ width: "28%", ...S.right }}>Verrechnungssatz</Text></View>
        {d.positionen.map((p, i) => (
          <View key={i}>
            <View style={S.row}>
              <Text style={{ width: "40%", fontFamily: "Helvetica-Bold" }}>{p.rolle}</Text>
              <Text style={{ width: "32%" }}>{p.einstufung ?? (p.kalkulationsart === "UEBERLASSUNG" ? "Überlassung" : p.kalkulationsart === "PAYROLL" ? "Payroll" : "Vermittlung")}</Text>
              <Text style={{ width: "28%", fontFamily: "Helvetica-Bold", ...S.right }}>{eur(p.preis)} {p.einheit}</Text>
            </View>
            {(p.zuschlaege ?? []).map((z, j) => (
              <View key={j} style={{ ...S.row, borderBottomWidth: 0, paddingVertical: 1 }}>
                <Text style={{ width: "72%", ...S.small }}>    {z.bezeichnung}</Text>
                <Text style={{ width: "28%", ...S.small, ...S.right }}>{eur(z.satz)} {z.einheit}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={S.h2}>Konditionen</Text>
        <Text style={S.p}>Alle Sätze verstehen sich pro geleisteter Stunde exkl. USt. Zuschläge für Nacht-, Sonn- und Feiertagsarbeit werden nach Kollektivvertrag bzw. Rahmenvereinbarung verrechnet. Abrechnung monatlich nach den tatsächlich geleisteten Stunden, Zahlungsziel {zahlungsziel}. Es gelten unsere Allgemeinen Geschäftsbedingungen sowie die Bestimmungen des Arbeitskräfteüberlassungsgesetzes (AÜG).</Text>
        <Text style={S.p}>{d.stundennachweisVomKunden
          ? "Stundenaufzeichnung: Die vom Beschäftiger geführten Stundenzettel werden uns nach Monatsende übermittelt und sind Grundlage der Abrechnung."
          : "Stundenaufzeichnung: Wir übermitteln den Stundennachweis nach Monatsende elektronisch zur Freigabe. Ohne Widerspruch binnen drei Werktagen gilt er als bestätigt."}</Text>
        <Text style={S.p}>{d.schlusstext ?? "Wir freuen uns auf die Zusammenarbeit und stehen für Rückfragen jederzeit gerne zur Verfügung."}</Text>
        <Text style={{ marginTop: 16 }}>Mit freundlichen Grüßen</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", marginTop: 4 }}>{d.erstelltVon ?? d.firma.name}</Text>
        <Text style={S.small}>{d.firma.name} · {d.ks.name}</Text>
        <Fuss firma={d.firma} />
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------- Rechnung
export interface RechnungPdfDaten {
  firma: Firma; ks: AngebotPdfDaten["ks"]; nummer: string; rechnungsdatum: Date; faelligAm: Date; leistungJahr: number; leistungMonat: number;
  kunde: AngebotPdfDaten["kunde"]; positionen: { beschreibung: string; menge: number; einheit: string; einzelpreis: number; betrag: number }[];
  netto: number; ustProzent: number; ust?: number; brutto: number; mahnstufe?: number; notiz?: string | null; storno?: boolean;
}
export function RechnungPdf(d: RechnungPdfDaten) {
  return (
    <Document title={`Rechnung ${d.nummer}`} author={d.firma.name}>
      <Page size="A4" style={S.page}>
        <Kopf firma={d.firma} ks={d.ks} />
        <Empfaenger k={d.kunde} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
          <View><Text style={S.h1}>{d.storno ? "Stornorechnung" : "Rechnung"} {d.nummer}</Text><Text>Leistungszeitraum: {MONATE_LANG[d.leistungMonat - 1]} {d.leistungJahr}</Text></View>
          <View style={{ alignItems: "flex-end" }}><Text>Rechnungsdatum: {datum(d.rechnungsdatum)}</Text><Text>Fällig am: {datum(d.faelligAm)}</Text></View>
        </View>
        <View style={S.th}><Text style={{ width: "50%" }}>Leistung</Text><Text style={{ width: "12%", ...S.right }}>Menge</Text><Text style={{ width: "10%" }}>  Einheit</Text><Text style={{ width: "14%", ...S.right }}>Einzelpreis</Text><Text style={{ width: "14%", ...S.right }}>Betrag</Text></View>
        {d.positionen.map((p, i) => <View key={i} style={S.row}><Text style={{ width: "50%" }}>{p.beschreibung}</Text><Text style={{ width: "12%", ...S.right }}>{p.menge.toLocaleString("de-AT", { maximumFractionDigits: 2 })}</Text><Text style={{ width: "10%" }}>  {p.einheit}</Text><Text style={{ width: "14%", ...S.right }}>{eur(p.einzelpreis)}</Text><Text style={{ width: "14%", ...S.right }}>{eur(p.betrag)}</Text></View>)}
        <View style={{ alignItems: "flex-end", marginTop: 10 }}>
          <View style={{ width: 220 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}><Text>Netto</Text><Text>{eur(d.netto)}</Text></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}><Text>{d.ustProzent} % USt</Text><Text>{eur(d.brutto - d.netto)}</Text></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1, borderTopColor: "#10222a", marginTop: 2 }}><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>Gesamt</Text><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{eur(d.brutto)}</Text></View>
          </View>
        </View>
        <View style={S.box}><Text>Bitte überweisen Sie den Betrag bis {datum(d.faelligAm)} unter Angabe der Rechnungsnummer {d.nummer} auf IBAN {d.firma.iban}{d.firma.bic ? ` (BIC ${d.firma.bic})` : ""}.</Text>{d.notiz && <Text style={{ marginTop: 4 }}>{d.notiz}</Text>}</View>
        {d.mahnstufe ? <Text style={{ marginTop: 10, color: "#c0392b", fontFamily: "Helvetica-Bold" }}>Zahlungserinnerung Stufe {d.mahnstufe}: Diese Rechnung ist überfällig. Bitte begleichen Sie den offenen Betrag umgehend.</Text> : null}
        <Text style={{ ...S.small, marginTop: 14 }}>Leistung gemäß Arbeitskräfteüberlassungsgesetz (AÜG). Der Beschäftiger haftet gemäß § 14 AÜG als Bürge für Entgeltansprüche der überlassenen Arbeitskräfte.</Text>
        <Fuss firma={d.firma} />
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------- Vertrag / Fließtext (Markdown-light)
export function TextPdf({ firma, titel, inhalt, ks }: { firma: Firma; titel: string; inhalt: string; ks?: AngebotPdfDaten["ks"] | null }) {
  const lines = inhalt.split("\n");
  return (
    <Document title={titel} author={firma.name}>
      <Page size="A4" style={S.page}>
        <Kopf firma={firma} ks={ks} />
        {lines.map((l, i) => {
          if (l.startsWith("# ")) return <Text key={i} style={S.h1}>{l.slice(2)}</Text>;
          if (l.startsWith("## ")) return <Text key={i} style={S.h2}>{l.slice(3)}</Text>;
          if (l.startsWith("|")) { const cells = l.split("|").filter((c, j, a) => j > 0 && j < a.length - 1); if (cells.every((c) => /^\s*-+\s*$/.test(c))) return null; return <View key={i} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd9d0", paddingVertical: 3 }}>{cells.map((c, j) => <Text key={j} style={{ flex: 1 }}>{c.trim().replace(/\*\*/g, "")}</Text>)}</View>; }
          if (!l.trim()) return <View key={i} style={{ height: 5 }} />;
          const parts = l.split(/(\*\*[^*]+\*\*)/g);
          return <Text key={i} style={{ marginBottom: 2 }}>{parts.map((p, j) => p.startsWith("**") ? <Text key={j} style={{ fontFamily: "Helvetica-Bold" }}>{p.slice(2, -2)}</Text> : p)}</Text>;
        })}
        <Fuss firma={firma} />
      </Page>
    </Document>
  );
}

export async function pdfBuffer(doc: React.ReactElement): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await renderToBuffer(doc as any));
}
