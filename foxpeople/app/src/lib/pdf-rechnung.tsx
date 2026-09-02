import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { datum } from "./format";
import type { Firma } from "./einstellungen";
import { Briefkopf } from "./pdf";

/**
 * Rechnung – Format nach der Musterrechnung AR_2026007 (Kopf rechts, Kundenblock links, Kundennummer/UID-Block,
 * „Rechnung Nr.“, Leistungszeitraum, Positionstabelle, Netto/MwSt/Brutto, Dank + Zahlungsziel, Bank + UID/FN im Fuß).
 * Briefkopf/Inhalte nach der Vorlage Rechnung_Vorlage.docx: alle Pflichtangaben § 11 UStG inkl. UID des Leistungsempfängers,
 * Leistungszeitraum von–bis, Hinweis auf bestätigte Stundennachweise als Beilage.
 */
export interface RechnungPdfDaten {
  firma: Firma;
  ks?: { name: string; strasse?: string | null; plz?: string | null; ort?: string | null; email?: string | null; telefon?: string | null } | null;
  nummer: string; rechnungsdatum: Date; faelligAm: Date; leistungJahr: number; leistungMonat: number;
  kunde: { firmenname: string; strasse?: string | null; plz?: string | null; ort?: string | null; land?: string | null; uid?: string | null; kundennummer?: string | null };
  positionen: { beschreibung: string; menge: number; einheit: string; einzelpreis: number; betrag: number; personId?: string | null; person?: string | null; rolle?: string | null; kostenstelle?: string | null; angebot?: string | null }[];
  netto: number; ustProzent: number; ust?: number; brutto: number; mahnstufe?: number; notiz?: string | null; storno?: boolean;
  beilagen?: string[]; // z. B. bestätigte Stundennachweise
  erstelltVon?: string | null;
}

const INK = "#10222a", MUTED = "#6b7477", RUST = "#b4522c", LINE = "#d9d5cc";
const S = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 96, paddingHorizontal: 52, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 34 },
  brand: { fontSize: 17, fontFamily: "Helvetica-Bold", letterSpacing: 0.2 },
  brandSub: { fontSize: 7.5, color: MUTED, letterSpacing: 1.6, marginTop: 1 },
  absender: { alignItems: "flex-end" },
  absenderName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8.5, color: MUTED },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 26 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", width: 230, marginBottom: 2 },
  metaL: { color: MUTED },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  th: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 4, marginTop: 14, marginBottom: 6, fontSize: 8.5, color: MUTED },
  tr: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.4, borderBottomColor: LINE },
  right: { textAlign: "right" },
  sumBox: { alignItems: "flex-end", marginTop: 8, borderTopWidth: 1.2, borderTopColor: INK, paddingTop: 10 },
  sumRow: { flexDirection: "row", width: 280, paddingVertical: 4 },
  foot: { position: "absolute", bottom: 26, left: 52, right: 52, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6, fontSize: 7.5, color: MUTED },
});

export function RechnungPdf(d: RechnungPdfDaten) {
  const f = d.firma, k = d.kunde;
  const von = new Date(d.leistungJahr, d.leistungMonat - 1, 1), bis = new Date(d.leistungJahr, d.leistungMonat, 0);
  const sofort = d.faelligAm <= d.rechnungsdatum;
  const zahlungsziel = sofort ? "sofort fällig" : `${datum(d.faelligAm)} (${Math.round((d.faelligAm.getTime() - d.rechnungsdatum.getTime()) / 86400000)} Tage netto)`;
  const titel = d.storno ? "Stornorechnung / Gutschrift" : "Rechnung";
  const fmt = (n: number) => n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Positionen je Mitarbeiter gruppieren (Name links, Leistungen untereinander, Gesamtsumme je Mitarbeiter)
  const gruppen: { key: string; name: string; rolle: string | null; kostenstelle: string | null; angebot: string | null; zeilen: RechnungPdfDaten["positionen"]; summe: number }[] = [];
  for (const p of d.positionen) {
    const key = p.personId ?? `_${p.beschreibung}`;
    let g = gruppen.find((x) => x.key === key);
    if (!g) { g = { key, name: p.person ?? p.beschreibung, rolle: p.rolle ?? null, kostenstelle: p.kostenstelle ?? null, angebot: p.angebot ?? null, zeilen: [], summe: 0 }; gruppen.push(g); }
    g.zeilen.push(p); g.summe += p.betrag;
  }
  const rang = (b: string) => (/^Normalstunden/.test(b) ? 0 : /Überstunden 50/.test(b) ? 1 : /Überstunden 100/.test(b) ? 2 : 3);
  for (const g of gruppen) g.zeilen.sort((x, y) => rang(x.beschreibung) - rang(y.beschreibung));
  return (
    <Document title={`${titel} ${d.nummer}`} author={f.name}>
      <Page size="A4" style={S.page}>
        <Briefkopf firma={f} ks={d.ks} />

        {/* Empfänger + Kopfdaten */}
        <View style={S.meta}>
          <View>
            <Text style={{ fontSize: 11 }}>{k.firmenname}</Text>
            {k.strasse && <Text style={{ fontSize: 11 }}>{k.strasse}</Text>}
            <Text style={{ fontSize: 11 }}>{[k.plz, k.ort].filter(Boolean).join(" ")}</Text>
            {k.land && k.land !== "Österreich" && <Text style={{ fontSize: 11 }}>{k.land}</Text>}
          </View>
          <View>
            <View style={S.metaRow}><Text style={S.metaL}>Kundennummer</Text><Text>{k.kundennummer ?? "–"}</Text></View>
            <View style={S.metaRow}><Text style={S.metaL}>UID Leistungsempfänger</Text><Text style={!k.uid ? { color: "#c0392b" } : undefined}>{k.uid ?? "fehlt"}</Text></View>
            <View style={S.metaRow}><Text style={S.metaL}>Rechnungsdatum</Text><Text>{datum(d.rechnungsdatum)}</Text></View>
            <View style={S.metaRow}><Text style={S.metaL}>{f.ort}, am</Text><Text>{datum(d.rechnungsdatum)}</Text></View>
          </View>
        </View>

        <Text style={S.h1}>{titel} Nr.: {d.nummer}</Text>
        <Text>Leistungszeitraum {datum(von)} – {datum(bis)}</Text>
        <Text style={{ marginTop: 6, fontSize: 9 }}>Verrechnet wird die Überlassung von Arbeitskräften im oben genannten Zeitraum gemäß Überlassungsvertrag bzw. angenommenem Angebot. Grundlage sind die vom Beschäftiger bestätigten Stundennachweise.</Text>

        <View style={S.th}><Text style={{ width: "30%" }}>Mitarbeiter</Text><Text style={{ width: "30%" }}>Leistung</Text><Text style={[{ width: "14%" }, S.right]}>Anzahl</Text><Text style={[{ width: "13%" }, S.right]}>Satz EUR</Text><Text style={[{ width: "13%" }, S.right]}>Gesamt EUR</Text></View>
        {gruppen.map((g, gi) => (
          <View key={gi} style={{ flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: LINE, paddingVertical: 4 }} wrap={false}>
            <View style={{ width: "30%" }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{g.name}</Text>
              {g.rolle && <Text style={{ fontSize: 8, color: MUTED }}>{g.rolle}</Text>}
              {g.kostenstelle && <Text style={{ fontSize: 8, color: MUTED }}>Kostenstelle {g.kostenstelle}</Text>}
              {g.angebot && <Text style={{ fontSize: 8, color: MUTED }}>Satz lt. Angebot {g.angebot}</Text>}
            </View>
            <View style={{ width: "70%" }}>
              {g.zeilen.map((p, i) => (
                <View key={i} style={{ flexDirection: "row", paddingVertical: 1 }}>
                  <Text style={{ width: "47%", fontSize: 9 }}>{p.beschreibung}</Text>
                  <Text style={[{ width: "16%" }, S.right]}>{fmt(p.menge)} {p.einheit === "Std." ? "Stunden" : p.einheit}</Text>
                  <Text style={[{ width: "18.5%" }, S.right]}>{fmt(p.einzelpreis)}</Text>
                  <Text style={[{ width: "18.5%" }, S.right]}>{fmt(p.betrag)}</Text>
                </View>
              ))}
              {g.zeilen.length > 1 && <View style={{ flexDirection: "row", paddingTop: 2 }}><Text style={{ width: "81.5%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>= Gesamtsumme {g.name}</Text><Text style={[{ width: "18.5%", fontFamily: "Helvetica-Bold" }, S.right]}>{fmt(g.summe)}</Text></View>}
            </View>
          </View>
        ))}

        <View style={S.sumBox} wrap={false}>
          <View style={S.sumRow}><Text style={{ width: 150 }}>Nettobetrag</Text><Text style={{ width: 30 }}>€</Text><Text style={[{ flex: 1 }, S.right]}>{fmt(d.netto)}</Text></View>
          <View style={S.sumRow}><Text style={{ width: 150 }}>{d.ustProzent} % MwSt.</Text><Text style={{ width: 30 }}>€</Text><Text style={[{ flex: 1 }, S.right]}>{fmt(d.ust ?? d.brutto - d.netto)}</Text></View>
          <View style={[S.sumRow, { marginTop: 4 }]}><Text style={{ width: 150, fontFamily: "Helvetica-Bold", fontSize: 11 }}>Bruttobetrag</Text><Text style={{ width: 30, fontFamily: "Helvetica-Bold", fontSize: 11 }}>€</Text><Text style={[{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 11 }, S.right]}>{fmt(d.brutto)}</Text></View>
        </View>

        <View style={{ marginTop: 26, alignItems: "center" }} wrap={false}>
          <Text>{d.storno ? "Diese Gutschrift gleicht die genannte Rechnung vollständig aus." : "Wir bedanken uns für Ihren Auftrag und bitten um Überweisung des offenen Rechnungsbetrages."}</Text>
          {!d.storno && <Text style={{ marginTop: 3 }}>Zahlungsziel: {zahlungsziel} · Verwendungszweck: {d.nummer}</Text>}
          {d.mahnstufe ? <Text style={{ marginTop: 8, color: "#c0392b", fontFamily: "Helvetica-Bold" }}>Zahlungserinnerung Stufe {d.mahnstufe}: Diese Rechnung ist überfällig. Bitte begleichen Sie den offenen Betrag umgehend.</Text> : null}
          {d.notiz && <Text style={{ marginTop: 6 }}>{d.notiz}</Text>}
        </View>

        <View style={{ marginTop: 22, fontSize: 8.5, color: MUTED }} wrap={false}>
          <Text>Beilagen: {d.beilagen?.length ? d.beilagen.join(", ") : "bestätigte Stundennachweise"}. Rückfragen: {d.ks?.email ?? f.email}, {d.ks?.telefon ?? f.telefon}.</Text>
          <Text style={{ marginTop: 2 }}>Leistung gemäß Arbeitskräfteüberlassungsgesetz (AÜG). Der Beschäftiger haftet gemäß § 14 AÜG als Bürge für die Entgeltansprüche der überlassenen Arbeitskräfte.</Text>
        </View>

        <View style={S.foot} fixed>
          <Text>Bankverbindung: {f.bank ? `${f.bank} – ` : ""}Kontoinhaber {f.rechtstraeger} · IBAN {f.iban}{f.bic ? ` | BIC ${f.bic}` : ""}</Text>
          <Text>UID-Nr. {f.uid} · {f.firmenbuch} · {f.name} ist eine Marke der {f.rechtstraeger}</Text>
        </View>
        <Text style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", fontSize: 7.5, color: MUTED }} fixed render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </Page>
    </Document>
  );
}
