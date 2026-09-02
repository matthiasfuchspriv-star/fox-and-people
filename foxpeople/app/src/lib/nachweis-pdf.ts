import { db } from "./db";
import { firma as ladeFirma } from "./einstellungen";
import { pdfBuffer } from "./pdf";
import { WochennachweisPdf, MonatsberichtPdf } from "./pdf-stundennachweis";
import { eintraegeAusTagen, type Tageseintrag } from "./zeitaufzeichnung";
import { wochenImMonat } from "./wochen";
import { MONATE_LANG } from "./format";
import React from "react";

/** Einträge eines Nachweises – neue Detailerfassung, sonst aus den reinen Tagesstunden aufgebaut. */
export function eintraegeAus(n: { eintraege?: unknown; tage?: unknown }): Tageseintrag[] {
  const e = n.eintraege as Tageseintrag[] | null | undefined;
  if (Array.isArray(e) && e.length) return Array.from({ length: 7 }, (_, i) => e[i] ?? {});
  return eintraegeAusTagen(((n.tage as number[]) ?? []).map((x) => x ?? 0));
}

/** Wochen-Stundennachweis als PDF (Vorlage „Stundennachweis Woche“). */
export async function wochennachweisPdf(id: string): Promise<{ buf: Buffer; dateiname: string; kostenstelleId: string } | null> {
  const n = await db.stundennachweis.findUnique({ where: { id }, include: { person: true } });
  if (!n) return null;
  const einsatz = n.einsatzId ? await db.einsatz.findUnique({ where: { id: n.einsatzId }, include: { kunde: true } })
    : await db.einsatz.findFirst({ where: { personId: n.personId }, orderBy: { von: "desc" }, include: { kunde: true } });
  const f = await ladeFirma();
  const buf = await pdfBuffer(React.createElement(WochennachweisPdf, {
    firma: f,
    d: {
      vorname: n.person.vorname, nachname: n.person.nachname,
      beschaeftiger: einsatz?.kunde.firmenname ?? "–",
      jahr: n.jahr, kw: n.kw, eintraege: eintraegeAus(n),
      wochennormal: einsatz?.wochenstunden ?? n.person.wochenstunden ?? 38.5,
      bestaetigtVon: n.bestaetigtVon, bestaetigtAm: n.bestaetigtAm,
    },
  }));
  return { buf, dateiname: `Stundennachweis_KW${n.kw}_${n.jahr}_${n.person.nachname}.pdf`, kostenstelleId: n.person.kostenstelleId };
}

/** Monatsbericht eines Mitarbeiters (Vorlage „Monatsbericht“) – alle Wochen des Monats mit Bestätigung. */
export async function monatsberichtPdf(personId: string, jahr: number, monat: number): Promise<{ buf: Buffer; dateiname: string; kostenstelleId: string } | null> {
  const p = await db.person.findUnique({ where: { id: personId } });
  if (!p) return null;
  const wochen = wochenImMonat(jahr, monat);
  const nachweise = await db.stundennachweis.findMany({
    where: { personId, OR: wochen.map((w) => ({ jahr: w.jahr, kw: w.kw })) },
    orderBy: [{ jahr: "asc" }, { kw: "asc" }],
  });
  const einsatz = await db.einsatz.findFirst({ where: { personId }, orderBy: { von: "desc" }, include: { kunde: true } });
  const f = await ladeFirma();
  const buf = await pdfBuffer(React.createElement(MonatsberichtPdf, {
    firma: f,
    d: {
      vorname: p.vorname, nachname: p.nachname,
      beschaeftiger: einsatz?.kunde.firmenname ?? "–",
      jahr, monat,
      wochennormal: einsatz?.wochenstunden ?? p.wochenstunden ?? 38.5,
      wochen: wochen.map((w) => {
        const n = nachweise.find((x) => x.jahr === w.jahr && x.kw === w.kw);
        return { jahr: w.jahr, kw: w.kw, eintraege: n ? eintraegeAus(n) : Array.from({ length: 7 }, () => ({})), bestaetigtVon: n?.bestaetigtVon ?? null, bestaetigtAm: n?.bestaetigtAm ?? null };
      }),
    },
  }));
  return { buf, dateiname: `Monatsbericht_${MONATE_LANG[monat - 1]}_${jahr}_${p.nachname}.pdf`, kostenstelleId: p.kostenstelleId };
}
