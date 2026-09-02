import { db } from "./db";
import { firma as ladeFirma } from "./einstellungen";
import { leseDokument } from "./storage";
import { pdfBuffer } from "./pdf";
import { ProfilPdf } from "./pdf-profil";
import { alter } from "./person-stats";
import { datum } from "./format";

/** Kundenprofil (anonymisiertes Kandidatenprofil) als PDF – für Anzeige und Versand. */
export async function erzeugeKundenprofil(personId: string, erstelltVon: string) {
  const p = await db.person.findUnique({ where: { id: personId }, include: { kostenstelle: true, qualifikationen: { orderBy: { typ: "asc" } }, einsaetze: { orderBy: { von: "desc" }, include: { kunde: true } }, bewertungen: true, berufserfahrung: { orderBy: { reihenfolge: "asc" } } } });
  if (!p) return null;
  const f = await ladeFirma();
  let foto: Buffer | null = null; let fotoMime: string | undefined;
  if (p.fotoDokumentId) { const d = await db.dokument.findUnique({ where: { id: p.fotoDokumentId } }); if (d) { foto = await leseDokument(d.speicherpfad); fotoMime = d.mime; } }
  const buf = await pdfBuffer(ProfilPdf({
    firma: f, ks: p.kostenstelle,
    person: { vorname: p.vorname, nachname: p.nachname, ort: p.ort, plz: p.plz, alter: alter(p.geburtsdatum), standardrolle: p.standardrolle, staatsangehoerigkeit: p.staatsangehoerigkeit, verfuegbar: p.status === "VERMITTELT" ? "derzeit im Einsatz" : p.verfuegbarSofort ? "sofort" : p.verfuegbarAb ? `ab ${datum(p.verfuegbarAb)}` : "nach Vereinbarung", foto, fotoMime, fuehrerschein: p.fuehrerschein, autoVorhanden: p.autoVorhanden, maxPendelKm: p.maxPendelKm },
    qualifikationen: p.qualifikationen.map((q) => ({ typ: q.typ, gultigBis: q.gultigBis })),
    einsaetze: p.einsaetze.filter((e) => e.status !== "ABGEBROCHEN").map((e) => { const b = p.bewertungen.filter((x) => x.einsatzId === e.id || (x.kundeId === e.kundeId && !x.einsatzId)); return { kunde: e.kunde.firmenname, ort: e.einsatzort ?? e.kunde.ort, rolle: e.rolleImEinsatz, von: e.von, bis: e.bis, sterne: b.length ? Math.round(b.reduce((a, x) => a + x.sterne, 0) / b.length) : null }; }),
    berufserfahrung: p.berufserfahrung.map((b) => ({ zeitraum: b.zeitraum, firma: b.firma, taetigkeit: b.taetigkeit, notiz: b.notiz })),
    erstelltVon,
  }));
  return { person: p, buf, dateiname: `Profil_${p.nachname}_${p.vorname}.pdf` };
}
