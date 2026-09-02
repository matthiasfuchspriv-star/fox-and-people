import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { db } from "./db";
import { firma as ladeFirma } from "./einstellungen";
import { leseDokument } from "./storage";
import { pdfBuffer } from "./pdf";
import { datum, MONATE_LANG } from "./format";
import { wochenImMonat, montagDerKw } from "./wochen";
import { WochenblaetterPdf } from "./pdf-stundennachweis";
import { eintraegeAus } from "./nachweis-pdf";

/**
 * Beilage zur Rechnung: alle bestätigten Stundennachweise der abgerechneten Mitarbeiter im Leistungsmonat
 * als Übersichts-PDF (Woche, Tagesstunden, Summe, Bestätigung) plus die hochgeladenen Nachweis-Fotos als eigene Anhänge.
 */
const S = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 50, paddingHorizontal: 50, fontSize: 9, fontFamily: "Helvetica", color: "#10222a", lineHeight: 1.35 },
  h1: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4 },
  th: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: "#10222a", paddingBottom: 3, marginBottom: 3, fontSize: 8, color: "#6b7477" },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.4, borderBottomColor: "#d9d5cc" },
  c: { textAlign: "right" },
  foot: { position: "absolute", bottom: 24, left: 50, right: 50, fontSize: 7.5, color: "#6b7477", textAlign: "center" },
});
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export interface Beilage { anhaenge: { filename: string; content: Buffer; contentType?: string }[]; beschreibung: string[]; anzahl: number }

export async function stundennachweisBeilage(rechnungId: string): Promise<Beilage> {
  const r = await db.rechnung.findUniqueOrThrow({ where: { id: rechnungId }, include: { kunde: true, monatsabrechnungen: { include: { person: true } } } });
  const f = await ladeFirma();
  const wochen = wochenImMonat(r.leistungJahr, r.leistungMonat);
  const personIds = [...new Set(r.monatsabrechnungen.map((m) => m.personId))];
  const nachweise = await db.stundennachweis.findMany({
    where: { personId: { in: personIds }, status: "BESTAETIGT", OR: wochen.map((w) => ({ jahr: w.jahr, kw: w.kw })) },
    include: { person: true }, orderBy: [{ personId: "asc" }, { jahr: "asc" }, { kw: "asc" }],
  });
  if (!nachweise.length) return { anhaenge: [], beschreibung: [], anzahl: 0 };
  const proPerson = new Map<string, typeof nachweise>();
  for (const n of nachweise) { if (!proPerson.has(n.personId)) proPerson.set(n.personId, []); proPerson.get(n.personId)!.push(n); }
  const monatName = `${MONATE_LANG[r.leistungMonat - 1]} ${r.leistungJahr}`;
  const doc = (
    <Document title={`Stundennachweise zu Rechnung ${r.nummer}`} author={f.name}>
      <Page size="A4" style={S.page}>
        <Text style={S.h1}>Stundennachweise – Beilage zu Rechnung {r.nummer}</Text>
        <Text>{r.kunde.firmenname} · Leistungszeitraum {monatName} · vom Beschäftiger bestätigte Wochennachweise</Text>
        {[...proPerson.values()].map((liste) => {
          const p = liste[0].person;
          const summe = liste.reduce((a, n) => a + n.summe, 0);
          return (
            <View key={p.id} wrap={false}>
              <Text style={S.h2}>{p.vorname} {p.nachname}</Text>
              <View style={S.th}><Text style={{ width: "14%" }}>Woche</Text><Text style={{ width: "22%" }}>Zeitraum</Text>{TAGE.map((t) => <Text key={t} style={[{ width: "6%" }, S.c]}>{t}</Text>)}<Text style={[{ width: "8%" }, S.c]}>Summe</Text><Text style={[{ width: "8%" }, S.c]}>Ü50</Text><Text style={[{ width: "8%" }, S.c]}>Ü100</Text><Text style={{ width: "10%", paddingLeft: 6 }}>Bestätigt</Text></View>
              {liste.map((n) => { const mo = montagDerKw(n.jahr, n.kw); const so = new Date(mo.getTime() + 6 * 86400000); const t = (n.tage as number[]) ?? []; return (
                <View key={n.id} style={S.tr}><Text style={{ width: "14%" }}>KW {n.kw}/{n.jahr}</Text><Text style={{ width: "22%" }}>{datum(mo)} – {datum(so)}</Text>{TAGE.map((_, i) => <Text key={i} style={[{ width: "6%" }, S.c]}>{t[i] ? t[i].toLocaleString("de-AT") : "–"}</Text>)}<Text style={[{ width: "8%", fontFamily: "Helvetica-Bold" }, S.c]}>{n.summe.toLocaleString("de-AT")}</Text><Text style={[{ width: "8%" }, S.c]}>{n.summeUe50 ? n.summeUe50.toLocaleString("de-AT") : "–"}</Text><Text style={[{ width: "8%" }, S.c]}>{n.summeUe100 ? n.summeUe100.toLocaleString("de-AT") : "–"}</Text><Text style={{ width: "10%", paddingLeft: 6, fontSize: 7.5 }}>{n.geprueftAm ? datum(n.geprueftAm) : ""}{n.fotoDokumentId ? " · Foto" : ""}</Text></View>
              ); })}
              <View style={[S.tr, { borderBottomWidth: 0 }]}><Text style={{ width: "66%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>Gesamt {monatName}</Text><Text style={[{ width: "8%", fontFamily: "Helvetica-Bold" }, S.c]}>{summe.toLocaleString("de-AT")}</Text><Text style={[{ width: "8%", fontFamily: "Helvetica-Bold" }, S.c]}>{liste.reduce((a, n) => a + n.summeUe50, 0).toLocaleString("de-AT")}</Text><Text style={[{ width: "8%", fontFamily: "Helvetica-Bold" }, S.c]}>{liste.reduce((a, n) => a + n.summeUe100, 0).toLocaleString("de-AT")}</Text><Text style={{ width: "10%" }} /></View>
            </View>
          );
        })}
        <Text style={{ marginTop: 16, fontSize: 8, color: "#6b7477" }}>Die vollständige Arbeitszeitaufzeichnung (Beginn, Ende, Pausen je Tag, § 26 AZG) liegt als eigenes PDF bei. Die vom Beschäftiger unterschriebenen Original-Stundennachweise (Foto/Scan) sind als weitere Anhänge beigefügt, sofern sie hochgeladen wurden.</Text>
        <Text style={S.foot} fixed render={({ pageNumber, totalPages }) => `${f.rechtstraeger} (${f.name}) · Beilage Stundennachweise zu ${r.nummer} · Seite ${pageNumber} von ${totalPages}`} />
      </Page>
    </Document>
  );
  const anhaenge: Beilage["anhaenge"] = [{ filename: `Stundennachweise_${r.nummer}.pdf`, content: await pdfBuffer(doc), contentType: "application/pdf" }];
  // Wochenblätter im Layout der Vorlage „Stundennachweis“ (Arbeitszeitaufzeichnung § 26 AZG) als eigenes PDF
  const blaetter = nachweise.map((n) => ({
    vorname: n.person.vorname, nachname: n.person.nachname,
    beschaeftiger: r.kunde.firmenname, jahr: n.jahr, kw: n.kw,
    eintraege: eintraegeAus(n),
    wochennormal: n.person.wochenstunden ?? 38.5,
    bestaetigtVon: n.bestaetigtVon, bestaetigtAm: n.bestaetigtAm,
  }));
  if (blaetter.length) anhaenge.push({ filename: `Arbeitszeitaufzeichnung_${r.nummer}.pdf`, content: await pdfBuffer(<WochenblaetterPdf firma={f} titel={`Arbeitszeitaufzeichnung zu Rechnung ${r.nummer}`} blaetter={blaetter} />), contentType: "application/pdf" });
  for (const n of nachweise) {
    if (!n.fotoDokumentId) continue;
    const d = await db.dokument.findUnique({ where: { id: n.fotoDokumentId } });
    if (!d) continue;
    try { anhaenge.push({ filename: `Nachweis_KW${n.kw}_${n.person.nachname}_${d.dateiname}`, content: await leseDokument(d.speicherpfad), contentType: d.mime }); } catch { /* Datei fehlt – Übersicht reicht */ }
  }
  return { anhaenge, beschreibung: [`Stundennachweise ${monatName} (${nachweise.length} Wochen, ${proPerson.size} Mitarbeiter)`], anzahl: nachweise.length };
}
