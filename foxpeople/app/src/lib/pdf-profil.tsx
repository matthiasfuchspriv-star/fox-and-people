import React from "react";
import { Document, Page, Text, View, StyleSheet, Image, Svg, Path } from "@react-pdf/renderer";
import { datum } from "./format";
import type { Firma } from "./einstellungen";

const S = StyleSheet.create({
  page: { padding: 0, fontSize: 10, fontFamily: "Helvetica", color: "#10222a" },
  band: { backgroundColor: "#10222a", paddingHorizontal: 44, paddingVertical: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#f7f6f2", fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  brandSub: { color: "#b9b3a6", fontSize: 7.5, letterSpacing: 2.2, marginTop: 3 },
  body: { paddingHorizontal: 44, paddingTop: 30 },
  head: { flexDirection: "row", gap: 22, alignItems: "flex-start" },
  photo: { width: 110, height: 138, borderRadius: 10, objectFit: "cover", backgroundColor: "#e9e6de" },
  name: { fontSize: 24, fontFamily: "Helvetica-Bold", letterSpacing: -0.3, marginBottom: 2 },
  role: { fontSize: 12, color: "#10222a", fontFamily: "Helvetica-Bold", marginBottom: 10 },
  fact: { flexDirection: "row", marginBottom: 3 },
  factL: { width: 95, color: "#6b7477", fontSize: 9 },
  h2: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#b4522c", letterSpacing: 1.6, textTransform: "uppercase", marginTop: 26, marginBottom: 10, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: "#ddd9d0" },
  row: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: "#ddd9d0" },
  chip: { backgroundColor: "#e9e6de", color: "#10222a", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 9, marginRight: 6, marginBottom: 6 },
  foot: { position: "absolute", bottom: 26, left: 44, right: 44, borderTopWidth: 0.5, borderTopColor: "#ddd9d0", paddingTop: 7, fontSize: 7.5, color: "#6b7477", flexDirection: "row", justifyContent: "space-between" },
});

export interface ProfilDaten {
  firma: Firma;
  ks: { name: string; email?: string | null; telefon?: string | null };
  person: { vorname: string; nachname: string; ort: string | null; plz: string | null; alter: number | null; standardrolle: string | null; staatsangehoerigkeit: string | null; verfuegbar: string; foto: Buffer | null; fotoMime?: string; fuehrerschein?: boolean; autoVorhanden?: boolean; maxPendelKm?: number | null };
  qualifikationen: { typ: string; gultigBis: Date | null }[];
  einsaetze: { kunde: string; ort: string | null; rolle: string; von: Date; bis: Date | null; sterne: number | null }[];
  berufserfahrung?: { zeitraum: string; firma: string; taetigkeit: string; notiz: string | null }[];
  erstelltVon?: string | null;
}


/** Fuchskopf-Symbol für Bewertungen im PDF (statt Sterne). */
function Fuchs({ aktiv, size = 9 }: { aktiv: boolean; size?: number }) {
  const c = aktiv ? "#c86a44" : "#e2ddd2";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 3 L9 8 L15 8 L21 3 L20 13 C20 18 16 21 12 21 C8 21 4 18 4 13 Z" fill={c} />
      <Path d="M8.5 12.5 L10.5 12.5 M13.5 12.5 L15.5 12.5" stroke="#ffffff" strokeWidth={1.4} />
      <Path d="M12 15 L10.6 16.6 L13.4 16.6 Z" fill="#ffffff" />
    </Svg>
  );
}

/**
 * Ja/Nein-Merkmal als Kästchen. Der Beschäftiger fragt am Telefon als Erstes nach Auto,
 * Führerschein und Staplerschein – das soll man auf dem Profil sehen, ohne zu suchen.
 */
function Merkmal({ an, text }: { an: boolean; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: an ? "#e3ede6" : "#f2f0ec", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 0.5, borderColor: an ? "#2f6f4f" : "#ddd9d0" }}>
      <Text style={{ fontSize: 11, color: an ? "#2f6f4f" : "#b9b3a6", fontFamily: "Helvetica-Bold" }}>{an ? "\u2713" : "\u2013"}</Text>
      <Text style={{ fontSize: 9, color: an ? "#2f6f4f" : "#8a9296", fontFamily: an ? "Helvetica-Bold" : "Helvetica" }}>{text}</Text>
    </View>
  );
}

export function ProfilPdf(d: ProfilDaten) {
  const p = d.person;
  return (
    <Document title={`Mitarbeiterprofil ${p.vorname} ${p.nachname}`} author={d.firma.name}>
      <Page size="A4" style={S.page}>
        <View style={S.band}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><View style={{ width: 3, height: 30, backgroundColor: "#c86a44", borderRadius: 1 }} /><View><Text style={S.brand}>FOX <Text style={{ color: "#c86a44" }}>&</Text> PEOPLE</Text><Text style={S.brandSub}>PERSONAL · ÜBERLASSUNG · VERMITTLUNG</Text></View></View>
          <View style={{ alignItems: "flex-end" }}><Text style={{ color: "#f7f6f2", fontSize: 9, fontFamily: "Helvetica-Bold" }}>Mitarbeiterprofil</Text><Text style={{ color: "#b9b3a6", fontSize: 8 }}>Stand {datum(new Date())}</Text></View>
        </View>
        <View style={S.body}>
          <View style={S.head}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {p.foto ? <Image src={{ data: p.foto, format: (p.fotoMime?.includes("png") ? "png" : "jpg") as "png" | "jpg" }} style={S.photo} /> : <View style={[S.photo, { alignItems: "center", justifyContent: "center" }]}><Text style={{ fontSize: 30, color: "#10222a", fontFamily: "Helvetica-Bold" }}>{p.vorname.charAt(0)}{p.nachname.charAt(0)}</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={S.name}>{p.vorname} {p.nachname}</Text>
              <Text style={S.role}>{p.standardrolle ?? "Mitarbeiter/in"}</Text>
              <View style={S.fact}><Text style={S.factL}>Wohnort</Text><Text>{[p.plz, p.ort].filter(Boolean).join(" ") || "–"}</Text></View>
              <View style={S.fact}><Text style={S.factL}>Alter</Text><Text>{p.alter != null ? `${p.alter} Jahre` : "–"}</Text></View>
              {p.staatsangehoerigkeit && <View style={S.fact}><Text style={S.factL}>Staatsangehörigkeit</Text><Text>{p.staatsangehoerigkeit}</Text></View>}
              <View style={S.fact}><Text style={S.factL}>Verfügbar</Text><Text>{p.verfuegbar}</Text></View>
              {d.qualifikationen.length > 0 && <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>{d.qualifikationen.map((q, i) => <Text key={i} style={S.chip}>{q.typ}{q.gultigBis ? ` · bis ${datum(q.gultigBis)}` : ""}</Text>)}</View>}
            </View>
          </View>
          {(d.berufserfahrung?.length ?? 0) > 0 && <>
            <Text style={S.h2}>Werdegang</Text>
            {d.berufserfahrung!.map((b, i) => (
              <View key={i} style={S.row}>
                <Text style={{ width: "22%" }}>{b.zeitraum}</Text>
                <Text style={{ width: "30%", fontFamily: "Helvetica-Bold" }}>{b.firma}</Text>
                <Text style={{ width: "28%" }}>{b.taetigkeit}</Text>
                <Text style={{ width: "20%", color: "#6b7477", fontSize: 8.5 }}>{b.notiz ?? ""}</Text>
              </View>
            ))}
          </>}
          <Text style={S.h2}>Mobilität &amp; Nachweise</Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
            <Merkmal an={Boolean(p.fuehrerschein)} text="Führerschein B" />
            <Merkmal an={Boolean(p.autoVorhanden)} text="eigenes Auto" />
            <Merkmal an={d.qualifikationen.some((q) => /stapler/i.test(q.typ))} text="Staplerschein" />
            <Merkmal an={d.qualifikationen.some((q) => /kran/i.test(q.typ))} text="Kranschein" />
          </View>
          {p.maxPendelKm != null && <Text style={{ color: "#6b7477", fontSize: 9 }}>Pendelbereit bis {p.maxPendelKm} km</Text>}

          <Text style={S.h2}>Ihr Kontakt</Text>
          <Text>{d.erstelltVon ?? d.firma.name} · {d.ks.name}</Text>
          <Text style={{ color: "#6b7477" }}>{d.ks.telefon ?? d.firma.telefon} · {d.ks.email ?? d.firma.email} · www.foxandpeople.at</Text>
        </View>
        <View style={S.foot} fixed><Text>{d.firma.name} ist eine Marke der {d.firma.rechtstraeger} · {d.firma.strasse}, {d.firma.plz} {d.firma.ort}</Text><Text>{d.firma.firmenbuch}</Text></View>
      </Page>
    </Document>
  );
}
