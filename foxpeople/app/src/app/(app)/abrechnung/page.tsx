import { Fragment } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { istZentrale, requireSession, tenantWhere, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { controlling } from "@/lib/controlling";
import { sollstundenMonat } from "@/lib/soll";
import { rueckstellungenJahr, type Monatswerte } from "@/engine/kalkulation";
import { eur, pct, MONATE, MONATE_LANG } from "@/lib/format";
import { PageHeader, Card, Empty } from "@/components/ui";
import { ergebnisSicht, provisionPct } from "@/lib/provision";
import { zulageEinheit, zulageEinzelpreisVerkauf, type EinsatzZulage } from "@/lib/zulagen";
import { zulagenMengenLesen } from "@/lib/verrechnung";
import { monatSpeichern, monatFakturieren } from "./actions";

export const dynamic = "force-dynamic";

export default async function AbrechnungPage({ searchParams }: { searchParams: Promise<{ jahr?: string; monat?: string; ansicht?: string; gespeichert?: string; fehler?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung"); // Rechnungen und Monatsabrechnung laufen über Fox & People (Zentrale)
  const sp = await searchParams;
  const heute = new Date();
  const jahr = Number(sp.jahr) || heute.getFullYear();
  const monat = Number(sp.monat) || heute.getMonth() + 1;
  const ansicht = sp.ansicht ?? "monat";
  const where = tenantWhere(s);
  const sensibel = darfSensibel(s);
  const prov = ergebnisSicht(s) === "PROVISION";
  const EL = prov ? "Provision" : "DB1";
  // Kostenstellen: Provision = % × DB2 (DB1 − Kostenumlage je Mitarbeiter); ohne Controlling-Kosten keine Anzeige
  const monatStart = new Date(Date.UTC(jahr, monat - 1, 1)); const monatEnde = new Date(Date.UTC(jahr, monat, 0));
  const sollM = await sollstundenMonat(jahr, monat, where.kostenstelleId);
  const [einsaetze, rows, c] = await Promise.all([
    db.einsatz.findMany({ where: { ...where, status: { in: ["AKTIV", "GEPLANT", "BEENDET"] }, von: { lte: monatEnde }, OR: [{ bis: null }, { bis: { gte: monatStart } }] }, include: { person: true, kunde: true, kostenstelle: { select: { provisionUeberlassung: true, provisionVermittlung: true } } }, orderBy: [{ kunde: { firmenname: "asc" } }, { person: { nachname: "asc" } }] }),
    db.monatsabrechnung.findMany({ where: { ...where, jahr }, include: { rechnung: { select: { nummer: true } } } }),
    controlling(jahr, where.kostenstelleId),
  ]);
  const { saetze } = c;
  const prev = monat === 1 ? { jahr: jahr - 1, monat: 12 } : { jahr, monat: monat - 1 };
  const next = monat === 12 ? { jahr: jahr + 1, monat: 1 } : { jahr, monat: monat + 1 };
  const zeilen = einsaetze.map((e) => {
    const alle = rows.filter((r) => r.personId === e.personId && r.kundeId === e.kundeId);
    const m = alle.find((r) => r.monat === monat);
    const verr: Monatswerte = Array(12).fill(null); const gl: Monatswerte = Array(12).fill(null); const ist: Monatswerte = Array(12).fill(null); const sz: Monatswerte = Array(12).fill(null);
    for (const r of alle) { if (r.verrechnung != null) verr[r.monat - 1] = r.verrechnung; if (r.bruttolohn != null) gl[r.monat - 1] = r.bruttolohn; if (r.selbstkostenIst != null) ist[r.monat - 1] = r.selbstkostenIst; if (r.sonderzahlungIst != null) sz[r.monat - 1] = r.sonderzahlungIst; }
    const j = rueckstellungenJahr(verr, gl, saetze, { selbstkostenIst: ist, sonderzahlungIst: sz });
    const pp = provisionPct(e.kostenstelle, e.art);
    const k = j.monate[monat - 1];
    const kostenMa = c.kosten?.kostenProMitarbeiterMonat ?? null;
    const startmonat = e.von.getUTCFullYear() === jahr && e.von.getUTCMonth() + 1 === monat;
    return { e, m, k, pp, provision: kostenMa == null ? null : ((k.db1 - (m ? kostenMa : 0)) * pp) / 100, honorarVorschlag: e.art === "DIREKTVERMITTLUNG" && startmonat && !m ? e.vermittlungshonorar : null };
  });
  const offen = zeilen.filter((z) => z.m && z.m.status === "OFFEN" && z.m.verrechnung).length;
  const sum = zeilen.reduce((a, z) => ({ v: a.v + (z.m?.verrechnung ?? 0), l: a.l + (z.m?.bruttolohn ?? 0), ab: a.ab + z.k.dgAbgaben + z.k.sonderzahlungsanteil, db: a.db + z.k.db1, p: a.p + (z.provision ?? 0) }), { v: 0, l: 0, ab: 0, db: 0, p: 0 });
  const ohneKosten = prov && !c.kosten;

  return (
    <>
      <PageHeader title="Monatsabrechnung" sub={prov ? "Verrechnung und Bruttolohn lt. Lohnzettel je Mitarbeiter erfassen – deine Provision wird automatisch berechnet." : "Verrechnung, Bruttolohn lt. Lohnzettel und – sobald vorhanden – die tatsächlichen Selbstkosten lt. Lohnüberweisung je Mitarbeiter erfassen. Ohne Ist-Wert werden die DG-Abgaben aus den Sätzen kalkuliert. Urlaubs- und Weihnachtsgeld belasten jeden Monat anteilig: Sie werden im Juni und November ausbezahlt, verdient werden sie aber laufend. Der Anteil steckt im DB1 und geht zugleich als Zuführung auf das Rückstellungskonto; die Auszahlung (Spalte „davon Sonderzahlung“) belastet nicht noch einmal, sondern löst die Rückstellung auf – siehe Controlling → Rückstellungen."} />
      {sp.fehler && sp.fehler !== "berechtigung" && (
        <div className="alert alert-red mb-4">
          <span><b>Der Rechnungslauf ist abgebrochen – es wurde keine Rechnung erzeugt.</b> {sp.fehler}<br />
          Die Monatsabrechnungen stehen unverändert auf „offen", du kannst es nach dem Beheben erneut versuchen.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-4 reveal">
        <div className="flex items-center gap-1 bg-surface border border-line rounded-xl p-1">
          <Link href={`/abrechnung?jahr=${prev.jahr}&monat=${prev.monat}&ansicht=${ansicht}`} className="btn btn-ghost btn-sm"><ChevronLeft size={16} /></Link>
          <span className="font-display font-bold px-2 min-w-[150px] text-center">{MONATE_LANG[monat - 1]} {jahr}</span>
          <Link href={`/abrechnung?jahr=${next.jahr}&monat=${next.monat}&ansicht=${ansicht}`} className="btn btn-ghost btn-sm"><ChevronRight size={16} /></Link>
        </div>
        <div className="seg">
          <Link href={`/abrechnung?jahr=${jahr}&monat=${monat}&ansicht=monat`} className={`chip-filter ${ansicht === "monat" ? "active" : ""}`}>Monat erfassen</Link>
          <Link href={`/abrechnung?jahr=${jahr}&monat=${monat}&ansicht=jahr`} className={`chip-filter ${ansicht === "jahr" ? "active" : ""}`}>Jahresübersicht</Link>
        </div>
        {sp.gespeichert && <span className="badge badge-teal ml-2">{sp.gespeichert} Zeilen gespeichert</span>}
        {sp.fehler === "berechtigung" && <span className="badge badge-red ml-2">Keine Berechtigung</span>}
      </div>

      {ohneKosten && <div className="alert alert-amber mb-4"><span><strong>Provision noch nicht verfügbar:</strong> Die Zentrale hat die Controlling-Kosten für {jahr} noch nicht hinterlegt.</span></div>}
      {ansicht === "monat" && (
        <>
          {prov ? (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="kpi reveal"><div className="label">Verrechnung {MONATE[monat - 1]}</div><div className="value">{eur(sum.v, 0)}</div></div>
              <div className="kpi reveal reveal-2"><div className="label">Provision {MONATE[monat - 1]}</div><div className={`value ${sum.p < 0 ? "text-red" : "text-teal"}`}>{ohneKosten ? "–" : eur(sum.p, 0)}</div></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
              <div className="kpi reveal"><div className="label">Verrechnung {MONATE[monat - 1]}</div><div className="value">{eur(sum.v, 0)}</div></div>
              <div className="kpi reveal reveal-2"><div className="label">Bruttolöhne</div><div className="value">{eur(sum.l, 0)}</div></div>
              <div className="kpi reveal reveal-3"><div className="label">Abgaben & UZ/WR-Anteil</div><div className="value">{eur(sum.ab, 0)}</div><div className="sub">DG {pct(saetze.pensionsversicherung + saetze.krankenversicherung + saetze.unfallversicherung + saetze.arbeitslosenversicherung + saetze.iesg + saetze.wohnbaufoerderung + saetze.swf + saetze.mitarbeitervorsorge + saetze.dienstgeberbeitrag + saetze.dz + saetze.kommunalsteuer + saetze.invalidenausgleichstaxePayroll)} + UZ/WR je 8,33 %</div></div>
              <div className="kpi reveal reveal-4"><div className="label">DB1 {MONATE[monat - 1]}</div><div className={`value ${sum.db < 0 ? "text-red" : "text-teal"}`}>{eur(sum.db, 0)}</div><div className="sub">{sum.v ? pct(sum.db / sum.v) : "–"} Marge</div></div>
            </div>
          )}
          <Card pad={false} className="reveal reveal-2">
            {zeilen.length === 0 ? <Empty title="Keine Einsätze in diesem Monat" text="Lege zuerst Einsätze an – hier erscheint dann je Mitarbeiter und Kunde eine Erfassungszeile." /> : (
              <form action={monatSpeichern.bind(null, jahr, monat)}>
                <div className="overflow-x-auto"><table className="table">
                  <thead><tr><th>Mitarbeiter</th><th>Kunde</th><th className="r">Satz €/Std</th><th className="r">Normalstd.</th><th className="r">Ü50 %</th><th className="r">Ü100 %</th><th className="r">Verrechnung €</th><th className="r">Bruttolohn lt. Lohnzettel €</th>{!prov && <><th className="r">Lohnkosten gesamt lt. Lohnprogramm €</th><th className="r">davon SZ ausbezahlt €</th><th className="r">Abgaben</th><th className="r">RSt UZ/WR</th></>}<th className="r">{EL}</th><th>Status</th></tr></thead>
                  <tbody>{zeilen.map(({ e, m, k, provision, honorarVorschlag }) => {
                    const fix = m?.status === "ABGERECHNET";
                    // Weiterverrechenbare Zulagen des Einsatzes: Menge (Std/Tage) kommt aus dem Stundenzettel
                    // und wird hier je Monat erfasst – nicht mehr automatisch für alle Stunden angenommen.
                    const zulagen = e.art === "DIREKTVERMITTLUNG" ? [] : (((e.zulagen as unknown as EinsatzZulage[] | null) ?? []).filter((z) => z.weiterverrechnen));
                    const mengen = zulagenMengenLesen(m?.zulagenMengen);
                    const zulagenFehlen = zulagen.length > 0 && (m?.stunden ?? 0) > 0 && !zulagen.some((z) => (mengen[z.kuerzel] ?? 0) > 0);
                    const spalten = prov ? 10 : 14;
                    return (
                      // Schlüssel enthält die gespeicherten Werte: Nach dem Speichern berechnet der Server
                      // Verrechnung/Stunden neu – unkontrollierte Eingabefelder behalten sonst ihren alten
                      // DOM-Wert und zeigen den neuen Betrag erst nach einem harten Reload.
                      <Fragment key={`${e.id}|${m?.stunden ?? ""}|${m?.verrechnung ?? ""}|${m?.zulagenBetrag ?? ""}`}>
                      <tr>
                        <td><Link href={`/personen/${e.personId}`} className="row-link">{e.person.nachname} {e.person.vorname}</Link><div className="text-[12.5px] text-muted">{e.rolleImEinsatz}{e.art === "DIREKTVERMITTLUNG" && <span className="badge badge-fox ml-1">Vermittlung</span>}</div></td>
                        <td>{e.kunde.firmenname}</td>
                        <td className="r num text-muted">{e.art === "DIREKTVERMITTLUNG" ? "Honorar" : eur(e.verrechnungssatz)}</td>
                        <td className="r"><input name={`stunden_${e.id}`} defaultValue={m?.stunden ?? ""} placeholder={(() => { const sp2 = sollM.jePerson.find((x) => x.personId === e.personId); return sp2?.soll ? `Soll ${Math.round(sp2.soll)}` : ""; })()} title="Leer lassen = Sollstunden aus der Einsatzplanung (X-Tage) bzw. bestätigte Stundennachweise werden übernommen" className="input !w-20 !py-1.5 num text-right" inputMode="decimal" readOnly={fix || !sensibel} /></td>
                        <td className="r"><input name={`ue50_${e.id}`} defaultValue={m?.ueberstunden50 ?? ""} title="50%-Überstunden – Zuschlag lt. Kundenkondition (Standard +35 %)" className="input !w-16 !py-1.5 num text-right" inputMode="decimal" readOnly={fix || !sensibel || e.art === "DIREKTVERMITTLUNG"} /></td>
                        <td className="r"><input name={`ue100_${e.id}`} defaultValue={m?.ueberstunden100 ?? ""} title="100%-Überstunden / Sonn- & Feiertag (Standard +70 %)" className="input !w-16 !py-1.5 num text-right" inputMode="decimal" readOnly={fix || !sensibel || e.art === "DIREKTVERMITTLUNG"} /></td>
                        <td className="r"><input name={`verrechnung_${e.id}`} defaultValue={m?.verrechnung ?? honorarVorschlag ?? ""} placeholder={e.verrechnungssatz ? "auto" : ""} title={m?.zulagenBetrag ? `inkl. Zulagen ${eur(m.zulagenBetrag)} – unverändert gespeichert wird der Betrag bei geänderten Stunden/Zulagen neu berechnet; nur ein von Hand geänderter Betrag bleibt stehen` : "leer lassen = automatisch aus Normal-/Überstunden × Satz (+ Zuschläge, + Zulagen lt. Menge). Ein unverändert gespeicherter Betrag wird neu berechnet; nur ein von Hand geänderter bleibt stehen."} className="input !w-28 !py-1.5 num text-right font-semibold" inputMode="decimal" readOnly={fix || !sensibel} /></td>
                        <td className="r"><input name={`bruttolohn_${e.id}`} defaultValue={m?.bruttolohn ?? ""} className="input !w-28 !py-1.5 num text-right" inputMode="decimal" readOnly={fix || !sensibel} /></td>
                        {!prov && <><td className="r"><input name={`selbstkosten_${e.id}`} defaultValue={m?.selbstkostenIst ?? ""} placeholder="kalkuliert" title="„Lohnkosten Gesamt“ aus dem Lohnprogramm (Brutto + Lohnnebenkosten) – ersetzt die kalkulierten Abgaben" className="input !w-28 !py-1.5 num text-right" inputMode="decimal" readOnly={fix || !sensibel} /></td>
                        <td className="r"><input name={`sonderzahlung_${e.id}`} defaultValue={m?.sonderzahlungIst ?? ""} placeholder="0" title="Nur was in diesem Monat tatsächlich ausbezahlt wurde (Urlaubszuschuss/Weihnachtsremuneration inkl. Abgaben, im Juni und November). Nicht die Rückstellung – die steht rechts in der Spalte „RSt UZ/WR“ und rechnet die Software selbst. Die Auszahlung belastet den DB1 nicht noch einmal, sie löst die Rückstellung auf." className="input !w-24 !py-1.5 num text-right" inputMode="decimal" readOnly={fix || !sensibel} /></td>
                        <td className="r num text-muted" title={m?.selbstkostenIst != null ? "Ist: Lohnkosten − Sonderzahlung − Bruttolohn" : "kalkuliert aus Abgabensätzen (ohne Rückstellungen)"}>{m?.bruttolohn != null || m?.selbstkostenIst != null ? eur(k.dgAbgaben) : "–"}</td>
                        <td className="r num text-muted" title="Anteiliges Urlaubs- und Weihnachtsgeld inkl. Abgaben, das dieser Monat trägt. Wird automatisch gerechnet (Bruttolohn × 2/12 × 1 + DG-Abgaben), belastet den DB1 und geht als Zuführung auf das Rückstellungskonto.">{m?.selbstkostenIst != null && m?.bruttolohn == null ? <span className="badge badge-amber" title="Lohnkosten Gesamt sind erfasst, aber der Bruttolohn lt. Lohnzettel fehlt. Ohne Bruttolohn kann die UZ/WR-Rückstellung nicht gebildet werden – bitte beide Spalten erfassen.">Bruttolohn fehlt</span> : k.sonderzahlungsanteil ? eur(k.sonderzahlungsanteil) : "–"}</td></>}
                        <td className={`r num font-bold ${k.db1 < 0 ? "text-red" : m ? "text-teal" : "text-muted"}`}>{m ? (prov ? (provision == null ? "–" : eur(provision)) : eur(k.db1)) : "–"}</td>
                        <td>{fix ? <Link href="/rechnungen" className="badge badge-teal">{m?.rechnung?.nummer ?? "abgerechnet"}</Link> : m ? <span className="badge badge-brand">offen</span> : <span className="badge badge-grey">leer</span>}</td>
                      </tr>
                      {zulagen.length > 0 && (
                        <tr className="!bg-surface-2/60">
                          <td colSpan={spalten} className="!py-2">
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pl-4 text-[12.5px]">
                              <span className="text-muted font-semibold">Zulagen lt. Stundenzettel:</span>
                              {zulagen.map((z) => (
                                <label key={z.kuerzel} className="flex items-center gap-1.5">
                                  <span title={`${eur(zulageEinzelpreisVerkauf(z, e.stundenlohn))} je ${zulageEinheit(z) === "Tage" ? "Tag" : "Stunde"} – verrechnet wird nur die hier eingetragene Menge`}>{z.name}</span>
                                  <input name={`zul_${e.id}_${z.kuerzel}`} defaultValue={mengen[z.kuerzel] ?? ""} placeholder="0" className="input !w-16 !py-1 num text-right" inputMode="decimal" readOnly={fix || !sensibel} />
                                  <span className="text-muted">{zulageEinheit(z)}</span>
                                </label>
                              ))}
                              {zulagenFehlen && !fix && <span className="badge badge-amber" title="Der Einsatz hat weiterverrechenbare Zulagen, aber es ist keine Menge eingetragen – so wird KEINE Zulage verrechnet. Menge lt. Stundenzettel eintragen und speichern.">Zulagen ohne Menge – wird nicht verrechnet</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}</tbody>
                </table></div>
                {sensibel && <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-line">
                  <button className="btn btn-primary">Monat speichern</button>
                  <span className="help">Leere Verrechnung wird aus Stunden × Satz berechnet; bei Direktvermittlung ist das Honorar im Startmonat vorbelegt. Bereits fakturierte Zeilen sind gesperrt.</span>
                </div>}
              </form>
            )}
          </Card>
          {sensibel && offen > 0 && (
            <Card className="mt-4 reveal reveal-3">
              <form action={monatFakturieren.bind(null, jahr, monat)} className="flex flex-wrap items-center gap-3">
                <Receipt size={18} className="text-brand" />
                <div className="flex-1"><div className="font-semibold">{offen} offene Zeile{offen !== 1 && "n"} für {MONATE_LANG[monat - 1]} {jahr}</div><div className="help">Erzeugt je Kunde eine Rechnung (Entwurf) mit fortlaufender Nummer – danach prüfen, PDF erzeugen und versenden.</div></div>
                <button className="btn btn-primary">Rechnungen erzeugen</button>
              </form>
            </Card>
          )}
        </>
      )}

      {ansicht === "jahr" && (
        <Card pad={false} className="reveal reveal-2">
          {c.mitarbeiter.length ? (
            <div className="overflow-x-auto"><table className="table text-[12.5px]">
              <thead><tr><th>Mitarbeiter / Kunde</th><th>Typ</th>{MONATE.map((m) => <th key={m} className="r">{m}</th>)}<th className="r">Jahr</th>{!prov && <th className="r">Marge</th>}</tr></thead>
              <tbody>{c.mitarbeiter.map((m) => (
                <>
                  <tr key={m.personId + m.kundeId + "v"}><td rowSpan={prov ? 2 : 4} className="font-semibold align-top"><Link href={`/personen/${m.personId}`} className="row-link">{m.name}</Link><div className="text-[12.5px] text-muted font-normal">{m.kunde}</div></td><td className="text-muted">Verrechnung</td>{m.monate.map((x) => <td key={x.monat} className="r num">{x.verrechnung ? eur(x.verrechnung, 0) : "·"}</td>)}<td className="r num font-semibold">{eur(m.verrechnungJahr, 0)}</td>{!prov && <td rowSpan={4} className={`r num font-bold align-middle ${m.db1Marge < 0 ? "text-red" : "text-teal"}`}>{pct(m.db1Marge)}</td>}</tr>
                  {!prov && <tr key={m.personId + m.kundeId + "l"}><td className="text-muted">Bruttolohn</td>{m.monate.map((x) => <td key={x.monat} className="r num">{x.grundlohn ? eur(x.grundlohn, 0) : "·"}</td>)}<td className="r num">{eur(m.selbstkostenJahr, 0)}</td></tr>}
                  {!prov && <tr key={m.personId + m.kundeId + "a"}><td className="text-muted">Abgaben & RSt</td>{m.monate.map((x) => <td key={x.monat} className="r num text-muted">{x.abgaben ? eur(x.abgaben, 0) : "·"}</td>)}<td className="r num">{eur(m.abgabenRueckstellungenJahr, 0)}</td></tr>}
                  <tr key={m.personId + m.kundeId + "d"} className="!bg-surface-2"><td className="font-semibold">{EL}</td>{m.monate.map((x) => <td key={x.monat} className={`r num font-semibold ${x.db1 < 0 ? "text-red" : x.db1 > 0 ? "text-teal" : "text-muted"}`}>{x.verrechnung || x.grundlohn ? (ohneKosten ? "–" : eur(prov ? x.provision : x.db1, 0)) : "·"}</td>)}<td className={`r num font-bold ${m.db1Jahr < 0 ? "text-red" : "text-teal"}`}>{ohneKosten ? "–" : eur(prov ? m.provisionJahr : m.db1Jahr, 0)}</td></tr>
                </>
              ))}</tbody>
            </table></div>
          ) : <Empty title={`Noch keine Monatswerte in ${jahr}`} />}
        </Card>
      )}
    </>
  );
}
