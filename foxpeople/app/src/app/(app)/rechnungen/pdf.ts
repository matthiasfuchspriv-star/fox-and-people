import { db } from "@/lib/db";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { pdfBuffer } from "@/lib/pdf";
import { RechnungPdf } from "@/lib/pdf-rechnung";

export async function rechnungPdf(id: string, mahnstufe = 0, beilagen?: string[]): Promise<Buffer> {
  const r = await db.rechnung.findUniqueOrThrow({ where: { id }, include: { kunde: true, positionen: { include: { person: { select: { vorname: true, nachname: true } }, einsatz: { select: { rolleImEinsatz: true, kundenKostenstelle: true, angebot: { select: { nummer: true } } } } } }, kostenstelle: true } });
  const f = await ladeFirma();
  return pdfBuffer(RechnungPdf({ firma: f, ks: r.kostenstelle, nummer: r.nummer, rechnungsdatum: r.rechnungsdatum, faelligAm: r.faelligAm, leistungJahr: r.leistungJahr, leistungMonat: r.leistungMonat, kunde: r.kunde, positionen: r.positionen.map((p) => ({ beschreibung: p.beschreibung, menge: p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis, betrag: p.betrag, personId: p.personId, person: p.person ? `${p.person.vorname} ${p.person.nachname}` : null, rolle: p.einsatz?.rolleImEinsatz ?? null, kostenstelle: p.einsatz?.kundenKostenstelle ?? null, angebot: p.einsatz?.angebot?.nummer ?? null })), netto: r.netto, ustProzent: r.ustProzent, brutto: r.brutto, mahnstufe, notiz: r.notiz, storno: r.netto < 0, beilagen }));
}
