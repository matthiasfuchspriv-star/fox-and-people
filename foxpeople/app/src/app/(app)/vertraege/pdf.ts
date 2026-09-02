import { db } from "@/lib/db";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { pdfBuffer } from "@/lib/pdf";
import { DokumentPdf } from "@/lib/pdf-dokument";
import { ArbeitsvertragPdf, UeberlassungsmitteilungPdf, ZusatzvereinbarungPdf } from "@/lib/pdf-arbeitspapiere";
import type { EinsatzZulage } from "@/lib/zulagen";
import { titel } from "./titel";

/**
 * PDF eines Vertrags. Die drei Arbeitspapiere (Arbeitsvertrag, Überlassungsmitteilung,
 * Zusatzvereinbarung) werden strukturiert aus den Stammdaten gebaut – im Layout der
 * Word-Vorlagen von Matthias, mit sichtbaren Ausfüllfeldern für alles, was die Software
 * nicht weiß. Der Vertragstext-Editor gilt für diese drei Typen NICHT (siehe Vertragsseite);
 * die übrigen Typen (Rahmen-, Überlassungs-, Vermittlungsvertrag) rendern weiter den Text.
 */
export async function vertragPdf(id: string): Promise<Buffer> {
  const v = await db.vertrag.findUniqueOrThrow({ where: { id }, include: { kostenstelle: true, person: true, kunde: true, einsatz: { include: { kunde: true, person: true } } } });
  const f = await ladeFirma();
  const e = v.einsatz;
  const p = e?.person ?? v.person;
  const k = e?.kunde ?? v.kunde;

  if (v.typ === "DIENSTVERTRAG" && p) {
    // KV-Mindeststundenlohn (AKÜ) der Einstufung – Abschnitt V.1 des Arbeitsvertrags
    let kvMindestlohn: number | null = null;
    if (p.beschaeftigungsgruppe) {
      const { massgeblicherMindestlohn } = await import("@/lib/mindestlohn");
      const ml = await massgeblicherMindestlohn({ kvId: p.kvId, beschaeftigungsgruppe: p.beschaeftigungsgruppe, am: e?.von ?? p.eintrittsdatum ?? new Date() });
      kvMindestlohn = ml.akue ?? null;
    }
    return pdfBuffer(ArbeitsvertragPdf({
      firma: f, nummer: v.nummer, erstelltAm: v.erstelltAm,
      person: { vorname: p.vorname, nachname: p.nachname, geschlecht: p.geschlecht, geburtsdatum: p.geburtsdatum, strasse: p.strasse, plz: p.plz, ort: p.ort, urlaubsanspruchTage: p.urlaubsanspruchTage },
      eintritt: p.eintrittsdatum ?? e?.von ?? null,
      verwendung: (e?.rolleImEinsatz ?? p.standardrolle) ? `${e?.rolleImEinsatz ?? p.standardrolle}${p.beschaeftigungsgruppe ? ` (BG ${p.beschaeftigungsgruppe})` : ""}` : null,
      einsatzbereich: v.kostenstelle.bundesland ?? null,
      kvMindestlohn,
      wochenstunden: e?.wochenstunden ?? p.wochenstunden ?? 38.5,
    }));
  }

  if (v.typ === "ZUSATZVEREINBARUNG" && p) {
    return pdfBuffer(ZusatzvereinbarungPdf({
      firma: f, nummer: v.nummer, erstelltAm: v.erstelltAm,
      person: { vorname: p.vorname, nachname: p.nachname, geschlecht: p.geschlecht },
    }));
  }

  if (v.typ === "UEBERLASSUNGSMITTEILUNG" && p) {
    // Der Kollektivvertrag des Beschäftigers ist auf der Mitteilung nach § 12 AÜG vorgeschrieben.
    // Vorrang hat die verknüpfte Lohntafel – sie trägt den amtlichen Namen, der Freitext im
    // Kundenstamm ist oft eine Abkürzung („KV Metallindustrie“).
    const beschKvId = k ? (p.angestellt && k.referenzKvAngestellteId ? k.referenzKvAngestellteId : k.referenzKvId) : null;
    const beschKv = beschKvId ? await db.kollektivvertrag.findUnique({ where: { id: beschKvId }, select: { name: true } }) : null;
    const beschKvName = beschKv?.name ?? k?.kollektivvertrag ?? null;
    return pdfBuffer(UeberlassungsmitteilungPdf({
      firma: f, nummer: v.nummer, angestellt: p.angestellt, erstelltAm: v.erstelltAm,
      person: { vorname: p.vorname, nachname: p.nachname, geschlecht: p.geschlecht, geburtsdatum: p.geburtsdatum, strasse: p.strasse, plz: p.plz, ort: p.ort, beschaeftigungsgruppe: p.beschaeftigungsgruppe },
      kunde: { firmenname: k?.firmenname ?? "", strasse: k?.strasse ?? null, plz: k?.plz ?? null, ort: k?.ort ?? null, kollektivvertrag: beschKvName },
      einsatz: {
        von: e?.von ?? p.eintrittsdatum ?? new Date(), bis: e?.bis ?? null,
        rolle: e?.rolleImEinsatz ?? p.standardrolle ?? "",
        wochenstunden: e?.wochenstunden ?? p.wochenstunden ?? 38.5,
        stundenlohn: e?.stundenlohn ?? p.stundenlohn,
        referenzzuschlag: e?.referenzzuschlag ?? null,
        zulagen: ((e?.zulagen as unknown as EinsatzZulage[] | null) ?? []),
        einsatzort: e?.einsatzort ?? null,
        // Angehakt am Einsatz → „ja“. Nicht angehakt bleibt bewusst KEIN hartes „nein“ bei 3-Schicht:
        // dort druckt die Mitteilung ein Ausfüllfeld (siehe janein in pdf-arbeitspapiere) – ob
        // NSchG/Schwerarbeitsverordnung greifen, entscheidet der konkrete Einsatz, keine Software.
        nachtschwerarbeit: e?.nachtschwerarbeit ? true : null,
        schwerarbeit: e?.schwerarbeit ? true : null,
        dreischicht: e?.schichtmodell === "DREI_SCHICHT",
      },
    }));
  }

  // Alle übrigen Verträge: Layout nach den Word-Vorlagen (Parteien-Tabelle, Abschnitte, Unterschriftenblock)
  return pdfBuffer(DokumentPdf({ firma: f, titel: titel(v.typ), inhalt: v.inhalt, nummer: v.nummer }));
}
