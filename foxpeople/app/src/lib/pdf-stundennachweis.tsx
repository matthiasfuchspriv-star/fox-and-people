import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { Briefkopf } from "./pdf";
import { datum, MONATE_LANG } from "./format";
import type { Firma } from "./einstellungen";
import { berechneWoche, wochentage, type Tageseintrag } from "./zeitaufzeichnung";
import { montagDerKw } from "./wochen";

/**
 * Stundennachweis Woche und Monatsbericht im Layout der Word-Vorlagen von Fox & People.
 *
 * Wochenblatt: Kopf mit Vorname · Zuname · beschäftigt bei · KW · Jahr, darunter die Tagestabelle
 * Tag · Datum · Ort · Beginn · Ende · Pause · Gesamtstd. · Normalstd. · Ü-Std. 50 % · Ü-Std. 100 % · Fehlzeit · Anmerkung
 * und die Summenzeile; unten drei Unterschriftsfelder (Mitarbeiter/in, Beschäftiger, Fox & People).
 *
 * Monatsbericht: Monat/Jahr · Beschäftiger · Mitarbeiter/in, danach je Woche ein Block Mo–So mit
 * Tag · Datum · von · bis · Pause · Gesamtstd. · Anmerkung und der Bestätigung des Beschäftigers.
 */
const LINIE = "#9a9a94";
const S = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontSize: 8, fontFamily: "Helvetica", color: "#12181c" },
  titel: { fontSize: 17, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, marginBottom: 10 },
  kopfTbl: { flexDirection: "row", marginBottom: 10 },
  kopfZelle: { borderWidth: 0.75, borderColor: LINIE, paddingVertical: 3, paddingHorizontal: 4 },
  kopfLabel: { backgroundColor: "#efede6", fontFamily: "Helvetica-Bold", fontSize: 7.5, textAlign: "center" },
  th: { flexDirection: "row", backgroundColor: "#efede6" },
  tr: { flexDirection: "row" },
  td: { borderWidth: 0.75, borderColor: LINIE, paddingVertical: 3.5, paddingHorizontal: 3, marginTop: -0.75, marginLeft: -0.75 },
  c: { textAlign: "center" },
  r: { textAlign: "right" },
  b: { fontFamily: "Helvetica-Bold" },
  sign: { flexDirection: "row", marginTop: 22, gap: 14 },
  signBox: { flex: 1, borderTopWidth: 0.75, borderTopColor: "#12181c", paddingTop: 4, fontSize: 7.5 },
  foot: { position: "absolute", bottom: 22, left: 34, right: 34, fontSize: 6.8, color: "#6b7477", textAlign: "center" },
  hinweis: { fontSize: 6.8, color: "#6b7477", marginTop: 8, lineHeight: 1.35 },
});

/** Spaltenbreiten des Wochenblattes in Prozent – Summe 100. */
const W = { tag: 5, datum: 9, ort: 13, beginn: 7, ende: 7, pause: 6, gesamt: 8, normal: 8, ue50: 8, ue100: 8, fehl: 7, anm: 14 };
const z = (n?: number | null) => (n ? n.toLocaleString("de-AT", { maximumFractionDigits: 2 }) : "");

export interface WochennachweisDaten {
  vorname: string; nachname: string; beschaeftiger: string; jahr: number; kw: number;
  eintraege: Tageseintrag[];
  tagesnormal?: number; wochennormal?: number;
  bestaetigtVon?: string | null; bestaetigtAm?: Date | null;
}

function Kopffeld({ label, wert, breite, letzte }: { label: string; wert: string; breite: string; letzte?: boolean }) {
  return (
    <View style={{ width: breite, marginLeft: letzte === undefined ? 0 : 0 }}>
      <View style={[S.kopfZelle, S.kopfLabel]}><Text>{label}</Text></View>
      <View style={[S.kopfZelle, { marginTop: -0.75, minHeight: 18, justifyContent: "center" }]}><Text style={S.c}>{wert}</Text></View>
    </View>
  );
}

export function WochennachweisPdf({ firma, d }: { firma: Firma; d: WochennachweisDaten }) {
  return (
    <Document title={`Stundennachweis KW ${d.kw}/${d.jahr} ${d.nachname}`} author={firma.name}>
      <WochenblattSeite firma={firma} d={d} />
    </Document>
  );
}

/** Mehrere Wochenblätter in einem Dokument – Beilage zur Rechnung. */
export function WochenblaetterPdf({ firma, titel, blaetter }: { firma: Firma; titel: string; blaetter: WochennachweisDaten[] }) {
  return (
    <Document title={titel} author={firma.name}>
      {blaetter.map((d, i) => <WochenblattSeite key={i} firma={firma} d={d} />)}
    </Document>
  );
}

/** Ein Wochenblatt als eigene Seite im Layout der Word-Vorlage. */
export function WochenblattSeite({ firma, d }: { firma: Firma; d: WochennachweisDaten }) {
  const tage = wochentage(d.jahr, d.kw);
  const w = berechneWoche(d.eintraege, { daten: tage.map((t) => t.datum), tagesnormal: d.tagesnormal ?? 8, wochennormal: d.wochennormal ?? 38.5 });
  const mo = montagDerKw(d.jahr, d.kw); const so = new Date(mo.getTime() + 6 * 86400000);
  const spalten: [string, number, keyof typeof W][] = [
    ["Tag", W.tag, "tag"], ["Datum", W.datum, "datum"], ["Ort", W.ort, "ort"], ["Beginn", W.beginn, "beginn"], ["Ende", W.ende, "ende"],
    ["Pause", W.pause, "pause"], ["Gesamtstd.", W.gesamt, "gesamt"], ["Normalstd.", W.normal, "normal"],
    ["Ü-Std. 50 %", W.ue50, "ue50"], ["Ü-Std. 100 %", W.ue100, "ue100"], ["Fehlzeit", W.fehl, "fehl"], ["Anmerkung", W.anm, "anm"],
  ];
  return (
      <Page size="A4" orientation="landscape" style={S.page}>
        <Briefkopf firma={firma} />
        <Text style={S.titel}>STUNDENNACHWEIS</Text>
        <View style={S.kopfTbl}>
          <Kopffeld label="Vorname" wert={d.vorname} breite="24%" />
          <Kopffeld label="Zuname" wert={d.nachname} breite="24%" />
          <Kopffeld label="beschäftigt bei" wert={d.beschaeftiger} breite="34%" />
          <Kopffeld label="KW" wert={String(d.kw)} breite="9%" />
          <Kopffeld label="Jahr" wert={String(d.jahr)} breite="9%" />
        </View>
        <Text style={{ fontSize: 7.5, color: "#6b7477", marginBottom: 5 }}>Zeitraum {datum(mo)} – {datum(so)} · Arbeitszeitaufzeichnung gemäß § 26 AZG</Text>
        <View>
          <View style={S.th}>{spalten.map(([l, br]) => <View key={l} style={[S.td, { width: `${br}%` }]}><Text style={[S.c, S.b, { fontSize: 7 }]}>{l}</Text></View>)}</View>
          {tage.map((t, i) => {
            const e = d.eintraege[i] ?? {};
            const b = w.tage[i];
            return (
              <View key={i} style={S.tr} wrap={false}>
                <View style={[S.td, { width: `${W.tag}%` }]}><Text style={[S.c, S.b]}>{t.kurz}</Text></View>
                <View style={[S.td, { width: `${W.datum}%` }]}><Text style={S.c}>{datum(t.datum)}</Text></View>
                <View style={[S.td, { width: `${W.ort}%` }]}><Text>{e.ort ?? ""}</Text></View>
                <View style={[S.td, { width: `${W.beginn}%` }]}><Text style={S.c}>{e.beginn ?? ""}</Text></View>
                <View style={[S.td, { width: `${W.ende}%` }]}><Text style={S.c}>{e.ende ?? ""}</Text></View>
                <View style={[S.td, { width: `${W.pause}%` }]}><Text style={S.c}>{e.pauseMin ? `${e.pauseMin} min` : ""}</Text></View>
                <View style={[S.td, { width: `${W.gesamt}%` }]}><Text style={[S.r, S.b]}>{z(b.gesamt)}</Text></View>
                <View style={[S.td, { width: `${W.normal}%` }]}><Text style={S.r}>{z(b.normal)}</Text></View>
                <View style={[S.td, { width: `${W.ue50}%` }]}><Text style={S.r}>{z(b.ue50)}</Text></View>
                <View style={[S.td, { width: `${W.ue100}%` }]}><Text style={S.r}>{z(b.ue100)}</Text></View>
                <View style={[S.td, { width: `${W.fehl}%` }]}><Text style={S.c}>{e.fehlzeit ?? ""}</Text></View>
                <View style={[S.td, { width: `${W.anm}%` }]}><Text style={{ fontSize: 7 }}>{e.anmerkung ?? ""}{t.feiertag ? (e.anmerkung ? " · Feiertag" : "Feiertag") : ""}</Text></View>
              </View>
            );
          })}
          <View style={S.tr}>
            <View style={[S.td, { width: `${W.tag + W.datum + W.ort + W.beginn + W.ende}%` }]}><Text /></View>
            <View style={[S.td, { width: `${W.pause}%`, backgroundColor: "#efede6" }]}><Text style={[S.c, S.b]}>Summe</Text></View>
            <View style={[S.td, { width: `${W.gesamt}%`, backgroundColor: "#efede6" }]}><Text style={[S.r, S.b]}>{z(w.summe)}</Text></View>
            <View style={[S.td, { width: `${W.normal}%`, backgroundColor: "#efede6" }]}><Text style={[S.r, S.b]}>{z(w.normal)}</Text></View>
            <View style={[S.td, { width: `${W.ue50}%`, backgroundColor: "#efede6" }]}><Text style={[S.r, S.b]}>{z(w.ue50)}</Text></View>
            <View style={[S.td, { width: `${W.ue100}%`, backgroundColor: "#efede6" }]}><Text style={[S.r, S.b]}>{z(w.ue100)}</Text></View>
            <View style={[S.td, { width: `${W.fehl + W.anm}%` }]}><Text /></View>
          </View>
        </View>
        {w.warnungen.length > 0 && <Text style={S.hinweis}>Hinweis Arbeitszeit: {w.warnungen.join(" ")}</Text>}
        <View style={S.sign}>
          <View style={S.signBox}><Text>Datum, Unterschrift Mitarbeiter/in</Text></View>
          <View style={S.signBox}><Text>Datum, Unterschrift Beschäftiger{d.bestaetigtVon ? ` · elektronisch bestätigt von ${d.bestaetigtVon}${d.bestaetigtAm ? ` am ${datum(d.bestaetigtAm)}` : ""}` : ""}</Text></View>
          <View style={S.signBox}><Text>Datum, Unterschrift Fox &amp; People</Text></View>
        </View>
        <Text style={S.foot} fixed render={({ pageNumber, totalPages }) => `${firma.rechtstraeger} (${firma.name}) · Stundennachweis KW ${d.kw}/${d.jahr} · Seite ${pageNumber} von ${totalPages}`} />
      </Page>
  );
}

export interface MonatsberichtDaten {
  vorname: string; nachname: string; beschaeftiger: string; jahr: number; monat: number;
  wochen: { jahr: number; kw: number; eintraege: Tageseintrag[]; bestaetigtVon?: string | null; bestaetigtAm?: Date | null }[];
  tagesnormal?: number; wochennormal?: number;
}

const MW = { woche: 9, tag: 6, datum: 11, von: 9, bis: 9, pause: 8, gesamt: 10, anm: 22, best: 16 };

export function MonatsberichtPdf({ firma, d }: { firma: Firma; d: MonatsberichtDaten }) {
  let gesamt = 0, normal = 0, ue50 = 0, ue100 = 0;
  const bloecke = d.wochen.map((wo, idx) => {
    const tage = wochentage(wo.jahr, wo.kw);
    const b = berechneWoche(wo.eintraege, { daten: tage.map((t) => t.datum), tagesnormal: d.tagesnormal ?? 8, wochennormal: d.wochennormal ?? 38.5 });
    gesamt += b.summe; normal += b.normal; ue50 += b.ue50; ue100 += b.ue100;
    return { nr: idx + 1, wo, tage, b };
  });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return (
    <Document title={`Monatsbericht ${MONATE_LANG[d.monat - 1]} ${d.jahr} ${d.nachname}`} author={firma.name}>
      <Page size="A4" style={S.page}>
        <Briefkopf firma={firma} />
        <Text style={S.titel}>MONATSBERICHT</Text>
        <View style={{ marginBottom: 10 }}>
          {[["Monat / Jahr", `${MONATE_LANG[d.monat - 1]} ${d.jahr}`], ["Beschäftiger", d.beschaeftiger], ["Mitarbeiter/in", `${d.vorname} ${d.nachname}`]].map(([l, v]) => (
            <View key={l} style={S.tr}>
              <View style={[S.td, S.kopfLabel, { width: "26%", textAlign: "left" }]}><Text>{l}</Text></View>
              <View style={[S.td, { width: "74%" }]}><Text>{v}</Text></View>
            </View>
          ))}
        </View>
        {bloecke.map(({ nr, wo, tage, b }) => (
          <View key={`${wo.jahr}-${wo.kw}`} style={{ marginBottom: 8 }} wrap={false}>
            <View style={S.th}>
              {[["Woche", MW.woche], ["Tag", MW.tag], ["Datum", MW.datum], ["von", MW.von], ["bis", MW.bis], ["Pause", MW.pause], ["Gesamtstd.", MW.gesamt], ["Anmerkung", MW.anm], ["Bestätigung Beschäftiger", MW.best]].map(([l, br]) => (
                <View key={String(l)} style={[S.td, { width: `${br as number}%` }]}><Text style={[S.c, S.b, { fontSize: 6.8 }]}>{l}</Text></View>
              ))}
            </View>
            {tage.map((t, i) => {
              const e = wo.eintraege[i] ?? {};
              return (
                <View key={i} style={S.tr}>
                  <View style={[S.td, { width: `${MW.woche}%` }]}><Text style={S.c}>{i === 0 ? `Woche ${nr}` : ""}</Text></View>
                  <View style={[S.td, { width: `${MW.tag}%` }]}><Text style={[S.c, S.b]}>{t.kurz}</Text></View>
                  <View style={[S.td, { width: `${MW.datum}%` }]}><Text style={S.c}>{datum(t.datum)}</Text></View>
                  <View style={[S.td, { width: `${MW.von}%` }]}><Text style={S.c}>{e.beginn ?? ""}</Text></View>
                  <View style={[S.td, { width: `${MW.bis}%` }]}><Text style={S.c}>{e.ende ?? ""}</Text></View>
                  <View style={[S.td, { width: `${MW.pause}%` }]}><Text style={S.c}>{e.pauseMin ? `${e.pauseMin} min` : ""}</Text></View>
                  <View style={[S.td, { width: `${MW.gesamt}%` }]}><Text style={[S.r, S.b]}>{z(b.tage[i].gesamt)}</Text></View>
                  <View style={[S.td, { width: `${MW.anm}%` }]}><Text style={{ fontSize: 7 }}>{e.fehlzeit ? `${e.fehlzeit} ` : ""}{e.anmerkung ?? ""}</Text></View>
                  <View style={[S.td, { width: `${MW.best}%` }]}><Text style={{ fontSize: 6.5 }}>{i === 0 ? (wo.bestaetigtVon ? `${wo.bestaetigtVon}${wo.bestaetigtAm ? `, ${datum(wo.bestaetigtAm)}` : ""}` : "") : ""}</Text></View>
                </View>
              );
            })}
            <View style={S.tr}>
              <View style={[S.td, { width: `${MW.woche + MW.tag + MW.datum + MW.von + MW.bis}%` }]}><Text /></View>
              <View style={[S.td, S.kopfLabel, { width: `${MW.pause}%` }]}><Text>Summe</Text></View>
              <View style={[S.td, S.kopfLabel, { width: `${MW.gesamt}%` }]}><Text style={[S.r, S.b]}>{z(b.summe)}</Text></View>
              <View style={[S.td, { width: `${MW.anm + MW.best}%` }]}><Text style={{ fontSize: 6.8 }}>Normal {z(b.normal)} · Ü50 {z(b.ue50)} · Ü100 {z(b.ue100)}</Text></View>
            </View>
          </View>
        ))}
        <View style={[S.tr, { marginTop: 4 }]}>
          <View style={[S.td, S.kopfLabel, { width: "48%", textAlign: "left" }]}><Text>Gesamt {MONATE_LANG[d.monat - 1]} {d.jahr}</Text></View>
          <View style={[S.td, { width: "13%" }]}><Text style={[S.r, S.b]}>{z(r2(gesamt))}</Text></View>
          <View style={[S.td, { width: "13%" }]}><Text style={S.r}>Normal {z(r2(normal))}</Text></View>
          <View style={[S.td, { width: "13%" }]}><Text style={S.r}>Ü50 {z(r2(ue50))}</Text></View>
          <View style={[S.td, { width: "13%" }]}><Text style={S.r}>Ü100 {z(r2(ue100))}</Text></View>
        </View>
        <View style={S.sign}>
          <View style={S.signBox}><Text>Datum, Unterschrift Mitarbeiter/in</Text></View>
          <View style={S.signBox}><Text>Datum, Unterschrift Beschäftiger</Text></View>
        </View>
        <Text style={S.foot} fixed render={({ pageNumber, totalPages }) => `${firma.rechtstraeger} (${firma.name}) · Monatsbericht ${MONATE_LANG[d.monat - 1]} ${d.jahr} · Seite ${pageNumber} von ${totalPages}`} />
      </Page>
    </Document>
  );
}
