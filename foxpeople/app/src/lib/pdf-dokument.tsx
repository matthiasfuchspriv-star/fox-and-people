import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Firma } from "./einstellungen";

/**
 * Arbeitspapiere (Arbeitsvertrag, Zusatzvereinbarung, Rahmen-/Überlassungs-/Vermittlungsvertrag) im Layout der
 * Word-Vorlagen: Titel, Parteien-Tabelle mit Rahmen, römisch nummerierte Abschnitte, nummerierte Absätze mit
 * hängendem Einzug, Datumszeile und Unterschriftentabelle. Eingabe ist der gerenderte Markdown-Vertragstext.
 *
 * Erkannte Markdown-Elemente:
 *   # Titel                          → Dokumenttitel
 *   Zeile direkt nach dem Titel ohne Markup → Untertitel (z. B. „Wichtige Information zu …“)
 *   **Label:** … / **Label: Wert**   → Zeile der Parteien-Tabelle (Folgezeilen bis zum nächsten Label/Abschnitt gehören dazu)
 *   ## Abschnitt                     → Abschnittsüberschrift
 *   1. Text                          → nummerierter Absatz
 *   Text mit Doppelpunkt am Ende     → Zwischenüberschrift (fett)
 *   „Ort, am Datum“ + Unterschriftslabels am Ende → Unterschriftenblock (Unterstriche werden ignoriert)
 */
const S = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 42, paddingHorizontal: 46, fontSize: 8.6, fontFamily: "Helvetica", color: "#000", lineHeight: 1.3 },
  h1: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  sub: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  h2: { fontSize: 9.4, fontFamily: "Helvetica-Bold", marginTop: 7, marginBottom: 2 },
  p: { marginBottom: 3, textAlign: "justify" },
  strong: { fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 2 },
  num: { flexDirection: "row", marginBottom: 3 },
  numL: { width: 16 },
  numR: { flex: 1, textAlign: "justify" },
  tbl: { borderWidth: 0.75, borderColor: "#000", marginBottom: 7, marginTop: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: "#000" },
  trLast: { flexDirection: "row" },
  tdL: { width: "30%", paddingHorizontal: 4, paddingVertical: 2.5, borderRightWidth: 0.75, borderRightColor: "#000", fontFamily: "Helvetica-Bold" },
  tdR: { width: "70%", paddingHorizontal: 4, paddingVertical: 2.5 },
  grid: { borderWidth: 0.75, borderColor: "#000", marginTop: 6, marginBottom: 10 },
  gridKopf: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: "#000", backgroundColor: "#f2f0ec" },
  gridZeile: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#999" },
  gridZeileLetzte: { flexDirection: "row" },
  gridZelle: { flex: 1, padding: 4 },
  gridRechts: { textAlign: "right", flex: 0, width: "34%", borderLeftWidth: 0.5, borderLeftColor: "#999" },
  kopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1.2, borderBottomColor: "#b4522c", paddingBottom: 4, marginBottom: 9 },
  kopfMarke: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#10222a", letterSpacing: 1.2 },
  kopfUnter: { fontSize: 7.5, color: "#5b6b70", marginTop: 2, letterSpacing: 0.6, textTransform: "uppercase" },
  kopfRechts: { fontSize: 7.5, color: "#5b6b70", textAlign: "right", lineHeight: 1.5 },
  foot: { position: "absolute", bottom: 22, left: 46, right: 46, fontSize: 8, color: "#444", borderTopWidth: 0.5, borderTopColor: "#999", paddingTop: 4, flexDirection: "row", justifyContent: "space-between" },
});

type Block =
  | { t: "h1"; text: string } | { t: "sub"; text: string } | { t: "h2"; text: string } | { t: "p"; text: string }
  | { t: "strong"; text: string } | { t: "num"; n: string; text: string } | { t: "table"; rows: { label: string; lines: string[] }[] }
  | { t: "sign"; datum: string; labels: string[]; firma?: string }
  | { t: "grid"; kopf: string[]; zeilen: string[][] };

function parse(inhalt: string): Block[] {
  const lines = inhalt.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let table: { label: string; lines: string[] }[] | null = null;
  const flushTable = () => { if (table && table.length) out.push({ t: "table", rows: table }); table = null; };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]; const l = raw.trim();
    if (!l || /^_{3,}(\s+_{3,})*$/.test(l)) continue;
    // Markdown-Tabelle (| a | b |) – z. B. die Entgeltaufstellung auf der Überlassungsmitteilung
    if (l.startsWith("|") && l.endsWith("|")) {
      flushTable();
      const zellen = (x: string) => x.slice(1, -1).split("|").map((c) => c.trim());
      const kopf = zellen(l);
      const zeilen: string[][] = [];
      let j = i + 1;
      if (j < lines.length && /^\|[\s:-]+\|$/.test(lines[j].trim())) j++;
      while (j < lines.length) {
        const z = lines[j].trim();
        if (!z.startsWith("|") || !z.endsWith("|")) break;
        zeilen.push(zellen(z)); j++;
      }
      out.push({ t: "grid", kopf, zeilen });
      i = j - 1;
      continue;
    }
    if (l.startsWith("# ")) { flushTable(); out.push({ t: "h1", text: l.slice(2) }); continue; }
    if (l.startsWith("## ")) { flushTable(); out.push({ t: "h2", text: l.slice(3) }); continue; }
    const lab = l.match(/^\*\*([^*]+?):\*\*\s*(.*)$/) ?? l.match(/^\*\*([^*:]+?):\s*([^*]*)\*\*$/);
    if (lab) { if (!table) table = []; table.push({ label: lab[1].trim() + ":", lines: lab[2].trim() ? [lab[2].trim()] : [] }); continue; }
    if (table && !/:$/.test(l) && !/^\d+\.\s/.test(l) && l.length <= 110) { const t = l.replace(/\*\*/g, "").replace(/^[,\s]+|[,\s]+$/g, ""); if (t) table[table.length - 1].lines.push(t); continue; }
    if (table) flushTable();
    const dat = l.match(/^([A-Za-zÄÖÜäöüß.\- ]+), am (.+)$/);
    if (dat) {
      // Unterschriftenblock: Datumszeile + folgende Labelzeilen (mehrere Labels je Zeile durch >2 Leerzeichen getrennt)
      const labels: string[] = []; let firma: string | undefined;
      for (let j = i + 1; j < lines.length; j++) {
        const s = lines[j].trim(); if (!s || /^_{3,}/.test(s)) continue;
        if (/GmbH|AG$|OG$|KG$/.test(s) && !/\(D[GN]\)/.test(s)) { firma = s; continue; }
        labels.push(...s.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean));
      }
      out.push({ t: "sign", datum: l, labels: labels.length ? labels : ["Dienstgeber (DG)", "Dienstnehmer/in (DN)"], firma });
      break;
    }
    const num = l.match(/^(\d+)\.\s+(.+)$/);
    if (num) { out.push({ t: "num", n: num[1] + ".", text: num[2] }); continue; }
    if (out.length === 1 && out[0].t === "h1") { out.push({ t: "sub", text: l.replace(/\*\*/g, "") }); continue; }
    if (/:$/.test(l) && l.length < 90) { out.push({ t: "strong", text: l.replace(/\*\*/g, "") }); continue; }
    out.push({ t: "p", text: l });
  }
  flushTable();
  return out;
}

/** Inline-Fett (**…**) in Text-Runs umsetzen. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, j) => (p.startsWith("**") ? <Text key={j} style={{ fontFamily: "Helvetica-Bold" }}>{p.slice(2, -2)}</Text> : <Text key={j}>{p}</Text>))}</>;
}

export function DokumentPdf({ firma, titel, inhalt, nummer }: { firma: Firma; titel: string; inhalt: string; nummer: string }) {
  const blocks = parse(inhalt);
  const dgLabel = blocks.find((b) => b.t === "sign") as Extract<Block, { t: "sign" }> | undefined;
  return (
    <Document title={titel} author={firma.name}>
      <Page size="A4" style={S.page}>
        {/* Briefkopf – ein Arbeitsvertrag ohne Absender sieht aus wie ein Entwurf, und der
            Dienstnehmer soll auf einen Blick sehen, von wem das Papier kommt. */}
        <View style={S.kopf} fixed>
          <View>
            <Text style={S.kopfMarke}>{firma.name.toUpperCase()}</Text>
            <Text style={S.kopfUnter}>Arbeitskräfteüberlassung &amp; Personalvermittlung</Text>
          </View>
          <View>
            <Text style={S.kopfRechts}>{firma.rechtstraeger}</Text>
            <Text style={S.kopfRechts}>{firma.strasse} · {firma.plz} {firma.ort}</Text>
            <Text style={S.kopfRechts}>{firma.telefon} · {firma.email}</Text>
          </View>
        </View>
        {blocks.map((b, i) => {
          switch (b.t) {
            case "h1": return <Text key={i} style={S.h1}>{b.text}</Text>;
            case "sub": return <Text key={i} style={S.sub}>{b.text}</Text>;
            case "h2": return <Text key={i} style={S.h2} minPresenceAhead={40}>{b.text}</Text>;
            case "strong": return <Text key={i} style={S.strong}>{b.text}</Text>;
            case "num": return <View key={i} style={S.num} wrap={false}><Text style={S.numL}>{b.n}</Text><Text style={S.numR}><Inline text={b.text} /></Text></View>;
            case "table": return (
              <View key={i} style={S.tbl}>
                {b.rows.map((r, j) => (
                  <View key={j} style={j === b.rows.length - 1 ? S.trLast : S.tr} wrap={false}>
                    <Text style={S.tdL}>{r.label}</Text>
                    <View style={S.tdR}>{r.lines.map((ln, k) => <Text key={k} style={k === 0 ? { fontFamily: "Helvetica-Bold" } : undefined}>{ln}</Text>)}</View>
                  </View>
                ))}
              </View>
            );
            case "grid": return (
              <View key={i} style={S.grid} wrap={false}>
                <View style={S.gridKopf}>
                  {b.kopf.map((c, j) => <Text key={j} style={[S.gridZelle, j > 0 ? S.gridRechts : {}, { fontFamily: "Helvetica-Bold" }]}>{c}</Text>)}
                </View>
                {b.zeilen.map((z, j) => (
                  <View key={j} style={j === b.zeilen.length - 1 ? S.gridZeileLetzte : S.gridZeile}>
                    {z.map((c, k) => <Text key={k} style={[S.gridZelle, k > 0 ? S.gridRechts : {}]}><Inline text={c} /></Text>)}
                  </View>
                ))}
              </View>
            );
            case "sign": {
              const cols = b.labels.slice(0, 2);
              const w = `${100 / cols.length}%`;
              return (
                <View key={i} style={[S.tbl, { marginTop: 14 }]} wrap={false}>
                  <View style={S.tr}><Text style={{ padding: 4 }}>{b.datum}</Text></View>
                  <View style={S.tr}>
                    {cols.map((c, j) => <View key={j} style={[j === 0 && cols.length > 1 ? S.tdL : S.tdR, { width: w, height: 46, justifyContent: "flex-end", fontFamily: "Helvetica-Bold" }]}>{/DG/.test(c) && <Text>{b.firma ?? firma.rechtstraeger}</Text>}</View>)}
                  </View>
                  <View style={S.trLast}>
                    {cols.map((c, j) => <Text key={j} style={[j === 0 && cols.length > 1 ? S.tdL : S.tdR, { width: w, fontFamily: "Helvetica" }]}>{c}</Text>)}
                  </View>
                </View>
              );
            }
            default: return <Text key={i} style={S.p}><Inline text={b.text} /></Text>;
          }
        })}
        <View style={S.foot} fixed>
          <Text>{firma.rechtstraeger} ({firma.name}) · {titel} {nummer}</Text>
          <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
        </View>
        {dgLabel ? null : null}
      </Page>
    </Document>
  );
}
