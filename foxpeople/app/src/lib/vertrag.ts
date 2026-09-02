import { db } from "./db";
import { zulageText } from "./zulagen";
import { firma as ladeFirma } from "./einstellungen";
import { datum, eur, num } from "./format";

/** Baut den Platzhalter-Kontext für Vertragsvorlagen (Serienbrief-Prinzip). */
export async function vertragsKontext(opts: { personId?: string | null; kundeId?: string | null; einsatzId?: string | null; kostenstelleId: string }) {
  const firma = await ladeFirma();
  const ks = await db.kostenstelle.findUnique({ where: { id: opts.kostenstelleId } });
  const einsatz = opts.einsatzId ? await db.einsatz.findUnique({ where: { id: opts.einsatzId }, include: { person: true, kunde: { include: { konditionen: true } } } }) : null;
  const person = einsatz?.person ?? (opts.personId ? await db.person.findUnique({ where: { id: opts.personId } }) : null);
  const kunde = einsatz?.kunde ?? (opts.kundeId ? await db.kunde.findUnique({ where: { id: opts.kundeId }, include: { konditionen: true } }) : null);
  const kv = person?.kvId ? await db.kollektivvertrag.findUnique({ where: { id: person.kvId } }) : null;
  // Kollektivvertrag des Beschäftigers: erst die verknüpfte Lohntafel, sonst der Freitext aus dem
  // Kundenstamm. Stand hier früher fest „________“ – auf der Überlassungsmitteilung nach § 12 AÜG
  // ist genau dieser Punkt vorgeschrieben, ein Strich darin macht das Papier wertlos.
  const beschKvId = kunde ? (person?.angestellt && kunde.referenzKvAngestellteId ? kunde.referenzKvAngestellteId : kunde.referenzKvId) : null;
  const beschKv = beschKvId ? await db.kollektivvertrag.findUnique({ where: { id: beschKvId } }) : null;
  const konditionen = kunde && "konditionen" in kunde ? kunde.konditionen : [];
  const ctx: Record<string, string> = {
    datum: datum(new Date()),
    "firma.name": firma.name, "firma.rechtstraeger": firma.rechtstraeger, "firma.strasse": firma.strasse, "firma.plz": firma.plz, "firma.ort": firma.ort, "firma.uid": firma.uid, "firma.firmenbuch": firma.firmenbuch, "firma.telefon": firma.telefon, "firma.email": firma.email, "firma.iban": firma.iban,
    "kostenstelle.name": ks?.name ?? "", "kostenstelle.bundesland": ks?.bundesland ?? "",
    "person.anrede": person?.geschlecht === "W" ? "Frau" : person?.geschlecht === "M" ? "Herr" : "Herr/Frau", "person.vorname": person?.vorname ?? "", "person.nachname": person?.nachname ?? "", "person.geburtsdatum": datum(person?.geburtsdatum), "person.strasse": person?.strasse ?? "", "person.plz": person?.plz ?? "", "person.ort": person?.ort ?? "",
    "person.standardrolle": person?.standardrolle ?? "", "person.stundenlohn": person?.stundenlohn != null ? num(person.stundenlohn) : "________", "person.kv": kv?.name ?? "KV für das Gewerbe der Arbeitskräfteüberlassung", "person.beschaeftigungsgruppe": person?.beschaeftigungsgruppe ?? "________", "person.urlaubsanspruch": String(person?.urlaubsanspruchTage ?? 25), "person.wochenstunden": num(person?.wochenstunden ?? 38.5),
    "kunde.firmenname": kunde?.firmenname ?? "", "kunde.strasse": kunde?.strasse ?? "", "kunde.plz": kunde?.plz ?? "", "kunde.ort": kunde?.ort ?? "", "kunde.uid": kunde?.uid ?? "", "kunde.zahlungszielTage": kunde?.zahlungszielTage ? String(kunde.zahlungszielTage) : "sofort", "kunde.kuendigungsfrist": kunde?.kuendigungsfrist ?? "4 Wochen", "kunde.rahmenvertragEnde": datum(kunde?.rahmenvertragEnde), "kunde.kollektivvertrag": beschKv?.name ?? kunde?.kollektivvertrag ?? "________",
    "kunde.ueberstundenZuschlag": konditionen[0] ? `${Math.round(konditionen[0].ueberstundenZuschlag * 100)} %` : "35 %", "kunde.nachtZuschlag": konditionen[0] ? `${Math.round(konditionen[0].nachtZuschlag * 100)} %` : "25 %", "kunde.wochenendZuschlag": konditionen[0] ? `${Math.round(konditionen[0].wochenendZuschlag * 100)} %` : "70 %",
    "kunde.konditionenTabelle": konditionen.length ? ["| Rolle | Stundensatz | Überstunden 50 % | Überstunden 100 % |", "|---|---|---|---|", ...konditionen.map((k) => `| ${k.rolle} | ${eur(k.stundensatz)} | +${Math.round(k.ueberstundenZuschlag * 100)} % | +${Math.round(k.wochenendZuschlag * 100)} % |`)].join("\n") : "Konditionen laut jeweiligem Angebot.",
    "einsatz.von": datum(einsatz?.von ?? new Date()), "einsatz.bis": einsatz?.bis ? datum(einsatz.bis) : "unbefristet", "einsatz.bisText": einsatz?.bis ? ` bis ${datum(einsatz.bis)}` : "", "einsatz.rolle": einsatz?.rolleImEinsatz ?? person?.standardrolle ?? "", "einsatz.ort": einsatz?.einsatzort ?? kunde?.ort ?? "", "einsatz.wochenstunden": num(einsatz?.wochenstunden ?? person?.wochenstunden ?? 38.5), "einsatz.schicht": einsatz?.schichtmodell === "TAG" ? "Tagschicht" : einsatz?.schichtmodell === "ZWEI_SCHICHT" ? "2-Schicht" : einsatz?.schichtmodell === "DREI_SCHICHT" ? "3-Schicht" : "nach Bedarf", "einsatz.verrechnungssatz": einsatz?.verrechnungssatz != null ? num(einsatz.verrechnungssatz) : "________", "einsatz.zulagen": (() => { const z = (einsatz?.zulagen as { name: string; art: string; wert: number }[] | null) ?? []; return z.length ? z.map((x) => `${x.name} (${zulageText(x as never)})`).join(", ") : "keine"; })(), "einsatz.grenzueberschreitend": einsatz?.grenzueberschreitend ? "ja – grenzüberschreitende Überlassung (ZKO-Meldung)" : "nein", "einsatz.dauer": einsatz?.bis ? `befristet bis ${datum(einsatz.bis)}` : "1 Monat Probezeit, danach unbefristet",
  };

  ctx["person.gruppe"] = person?.angestellt ? "Angestellte" : "Arbeiter";
  ctx["person.verwendung"] = [einsatz?.rolleImEinsatz ?? person?.standardrolle, person?.beschaeftigungsgruppe ? `(BG ${person.beschaeftigungsgruppe})` : ""].filter(Boolean).join(" ") || "Arbeitskraft";
  ctx["einsatz.einsatzbereich"] = ks?.bundesland ?? kunde?.bundesland ?? "Österreich";
  ctx["einsatz.dauerText"] = einsatz?.bis ? `befristet bis ${datum(einsatz.bis)}` : "unbefristet";
  ctx["einsatz.nachtschwerarbeit"] = einsatz?.schichtmodell === "DREI_SCHICHT" ? "ja – bitte prüfen" : "nein";
  ctx["einsatz.schwerarbeit"] = "nein";
  ctx["firma.mvk"] = firma.mvk || "________";
  ctx["firma.app"] = firma.app || `${firma.name} App`;

  // Entgelttabelle für die Überlassungsmitteilung (§ 12 Z 8 AÜG).
  //
  // Der Mitarbeiter muss schwarz auf weiß sehen, woraus sich sein Stundenlohn zusammensetzt: die
  // Normalstunde, ein allfälliger Referenzzuschlag nach § 10 AÜG in Euro (nicht in Prozent – der
  // Prozentsatz sagt ihm nichts) und jede vereinbarte Zulage. Genau das prüft die Finanzpolizei.
  const lohn = einsatz?.stundenlohn ?? person?.stundenlohn ?? null;
  const zeilen: string[] = ["| Position | Satz |", "|---|---|"];
  zeilen.push(`| Normalstunde | ${lohn != null ? eur(lohn) : "________"} |`);
  if (einsatz?.referenzzuschlag) zeilen.push(`| Referenzzuschlag § 10 AÜG (${beschKv?.kuerzel ?? kunde?.kollektivvertrag ?? "Beschäftiger-KV"}) | ${eur(einsatz.referenzzuschlag)} |`);
  const zulagen = (einsatz?.zulagen as { name: string; art: string; wert: number }[] | null) ?? [];
  for (const z of zulagen) zeilen.push(`| ${z.name} | ${zulageText(z as never)} |`);
  if (lohn != null) {
    const gesamt = lohn + (einsatz?.referenzzuschlag ?? 0);
    if (einsatz?.referenzzuschlag) zeilen.push(`| **Stundenlohn gesamt** | **${eur(gesamt)}** |`);
  }
  zeilen.push(`| Überstunde 50 % | ${lohn != null ? eur(lohn * 1.5) : "________"} |`);
  zeilen.push(`| Überstunde 100 % | ${lohn != null ? eur(lohn * 2) : "________"} |`);
  ctx["einsatz.entgeltTabelle"] = zeilen.join("\n");

  return { ctx, firma, ks, person, kunde, einsatz };
}

export function renderVorlage(inhalt: string, ctx: Record<string, string>) {
  return inhalt.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => ctx[k] ?? `[${k}]`);
}
