import { db } from "@/lib/db";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { AngebotPdf, pdfBuffer } from "@/lib/pdf";
import type { PositionKalkulation } from "@/lib/angebot-kalkulation";

/** „12,50 € / Std“ bzw. „8 % vom Stundenlohn“ – wie die Zulage im Angebot ausgewiesen wird. */
function zulagenZeile(z: { name: string; art: string; wert: number }, stundenlohn: number | null, faktor: number) {
  if (z.art === "PROZENT_STUNDENLOHN") {
    // prozentuelle Zulagen hängen am Lohn; weiterverrechnet mit demselben Faktor wie der Grundsatz
    const satz = stundenlohn == null ? null : Math.round(stundenlohn * (z.wert / 100) * faktor * 100) / 100;
    return { bezeichnung: `Zulage ${z.name} (${z.wert.toLocaleString("de-AT")} % vom Stundenlohn)`, satz, einheit: "/ Std" };
  }
  const einheit = z.art === "EURO_STUNDE" ? "/ Std" : z.art === "EURO_TAG" ? "/ Tag" : "/ Monat";
  return { bezeichnung: `Zulage ${z.name}`, satz: Math.round(z.wert * faktor * 100) / 100, einheit };
}

export async function angebotPdfBuffer(id: string): Promise<Buffer> {
  const a = await db.angebot.findUniqueOrThrow({ where: { id }, include: { kunde: { include: { ansprechpartner: true } }, positionen: { orderBy: { reihenfolge: "asc" } }, kostenstelle: true } });
  const f = await ladeFirma();
  const haupt = a.kunde.ansprechpartner.find((x) => x.istHaupt) ?? a.kunde.ansprechpartner[0];
  const kvIds = [...new Set(a.positionen.map((p) => p.kvId).filter((x): x is string => !!x))];
  const kvs = kvIds.length ? await db.kollektivvertrag.findMany({ where: { id: { in: kvIds } }, select: { id: true, name: true } }) : [];
  const zulagenIds = [...new Set(a.positionen.flatMap((p) => p.zulagenIds))];
  const zulagen = zulagenIds.length ? await db.zulage.findMany({ where: { id: { in: zulagenIds } }, orderBy: [{ reihenfolge: "asc" }, { name: "asc" }] }) : [];

  return pdfBuffer(
    AngebotPdf({
      firma: f, ks: a.kostenstelle, nummer: a.nummer, datum: a.datum, gultigBis: a.gultigBis, betreff: a.betreff, einleitung: a.einleitung, schlusstext: a.schlusstext,
      kunde: a.kunde, ansprechpartner: haupt?.name, stundennachweisVomKunden: a.stundennachweisVomKunden,
      positionen: a.positionen.map((p) => {
        const k = p.kalkulation as unknown as PositionKalkulation | null;
        const preis = k?.preis ?? (p.kalkulationsart === "UEBERLASSUNG" ? p.verrechnungssatz : p.kalkulationsart === "PAYROLL" ? null : p.honorar);
        const kvName = kvs.find((x) => x.id === p.kvId)?.name;
        const einstufung = [kvName, p.beschaeftigungsgruppe ? `Beschäftigungsgruppe ${p.beschaeftigungsgruppe}` : null].filter(Boolean).join(" · ") || null;
        // Überstunden stehen immer im Angebot, Zulagen nur die ausgewählten
        const zuschlaege = p.kalkulationsart !== "UEBERLASSUNG" || preis == null ? [] : [
          { bezeichnung: `Überstunde 50 % (Zuschlag ${Math.round(p.zuschlag50 * 100)} %)`, satz: Math.round(preis * (1 + p.zuschlag50) * 100) / 100, einheit: "/ Std" },
          { bezeichnung: `Überstunde 100 % / Sonn- und Feiertag (Zuschlag ${Math.round(p.zuschlag100 * 100)} %)`, satz: Math.round(preis * (1 + p.zuschlag100) * 100) / 100, einheit: "/ Std" },
          ...zulagen.filter((z) => p.zulagenIds.includes(z.id)).map((z) => zulagenZeile(z, p.stundenlohn, k?.faktor ?? 1)),
        ];
        return {
          rolle: p.rolle, kalkulationsart: p.kalkulationsart, preis, einstufung, zuschlaege,
          einheit: p.kalkulationsart === "UEBERLASSUNG" ? "/ Std" : p.kalkulationsart === "PAYROLL" ? "/ Monat" : "pauschal",
        };
      }),
      erstelltVon: a.erstelltVon,
    }),
  );
}
