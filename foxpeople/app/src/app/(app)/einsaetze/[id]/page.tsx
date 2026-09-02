import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession, darfKostenstelle, darfSensibel, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { aktuelleSaetze } from "@/lib/einstellungen";
import { ueberlassung } from "@/engine/kalkulation";
import { eur, pct, datum, isoDate } from "@/lib/format";
import { ergebnisSicht, provisionPct, ladeControllingkosten } from "@/lib/provision";
import { einsatzDb } from "@/lib/kennzahlen";
import { zulageText, zulagenProStunde, type EinsatzZulage } from "@/lib/zulagen";
import { PageHeader, Card, Field, Stat, Gauge, einsatzStatusBadge } from "@/components/ui";
import { einsatzStatus, einsatzSpeichern, einsatzLoeschen, arbeitspapiereErzeugen } from "../actions";
import { titel as vertragTitel } from "../../vertraege/titel";
import { AUFLOESUNGSARTEN } from "@/lib/einsatz";
import { DienstvertragFelder } from "../dienstvertrag";

export const dynamic = "force-dynamic";

export default async function EinsatzDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string; papiere?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const e = await db.einsatz.findUnique({ where: { id }, include: { person: true, kunde: true, kostenstelle: true, monatsabrechnungen: { orderBy: [{ jahr: "asc" }, { monat: "asc" }] }, vertraege: true } });
  if (!e || !darfKostenstelle(s, e.kostenstelleId)) notFound();
  const sensibel = darfSensibel(s);
  const prov = ergebnisSicht(s) === "PROVISION";
  // Live-Deckungsbeitrag mit Ampel – nur im HQ sichtbar
  const edb = !prov && sensibel ? await einsatzDb(id) : null;
  const pp = provisionPct(e.kostenstelle, e.art);
  // Provision gibt es nur für untergeordnete Kostenstellen. Läuft der Einsatz auf der Zentrale (HQ),
  // wird keine Provisionszeile gezeigt – sie wäre sinnlos (die Zentrale bekommt keine Provision).
  const zeigeProvision = !e.kostenstelle.isZentrale;
  const ARBEITSPAPIERE = ["DIENSTVERTRAG", "UEBERLASSUNGSMITTEILUNG", "ZUSATZVEREINBARUNG"] as const;
  const alleArbeitspapiereDa = ARBEITSPAPIERE.every((t) => e.vertraege.some((v) => v.typ === t));
  const kostenstellen = istZentrale(s) ? await db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: [{ isZentrale: "desc" }, { name: "asc" }], select: { id: true, name: true } }) : [];
  const kosten = await ladeControllingkosten(e.von.getFullYear());
  const kostenMa = kosten?.kostenProMitarbeiterMonat ?? null; // Kostenumlage je Mitarbeiter und Monat → DB2
  const provMonat = (db1Monat: number | null | undefined) => (db1Monat == null || kostenMa == null ? null : ((db1Monat - kostenMa) * pp) / 100);
  const provAnzeige = (v: number | null) => (kostenMa == null ? <span className="text-muted">– (Controlling-Kosten fehlen)</span> : <span className={v != null && v < 0 ? "text-red" : "text-teal"}>{eur(v)}</span>);
  const { saetze } = await aktuelleSaetze(e.kostenstelle.bundesland);
  const angebote = await db.angebot.findMany({ where: { kundeId: e.kundeId, status: "ANGENOMMEN" }, orderBy: { erstelltAm: "desc" }, include: { positionen: true } });
  const kvs = await db.kollektivvertrag.findMany({ orderBy: { name: "asc" }, include: { lohntabelle: { orderBy: { beschaeftigungsgruppe: "asc" } } } }).then((liste) => Promise.resolve(import("@/lib/referenzlohn")).then(({ aktuelleLohnstufen }) => liste.map((kv) => ({ ...kv, lohntabelle: aktuelleLohnstufen(kv.lohntabelle) }))));
  const alleZulagen = await db.zulage.findMany({ where: { aktiv: true }, orderBy: [{ reihenfolge: "asc" }, { name: "asc" }] });
  const zul = ((e.zulagen as unknown as EinsatzZulage[] | null) ?? []);
  const zps = zulagenProStunde(zul, e.stundenlohn);
  // Kalkulation inkl. Zulagen: Lohn + Zulagen je Std; weiterverrechnete Zulagen erhöhen den Satz × Faktor (wie im WIFI-Schema)
  const kalk = sensibel && e.stundenlohn ? ueberlassung(e.stundenlohn + zps.lohn, saetze, e.verrechnungssatz != null ? e.verrechnungssatz + zps.weiter * ueberlassung(e.stundenlohn, saetze, e.verrechnungssatz, 1).faktor : null, (e.wochenstunden * 4.33 * e.auslastung) / 100) : null;
  return (
    <>
      {sp.fehler && <div className="alert alert-red mb-4">{sp.fehler === "berechtigung" ? "Nur der Systemadmin darf löschen." : sp.fehler}</div>}
      {sp.papiere && <div className="alert alert-teal mb-4"><span>{sp.papiere === "vorhanden" ? "Alle Arbeitspapiere sind für diesen Einsatz bereits angelegt – siehe Karte „Arbeitspapiere“." : `Erzeugt: ${sp.papiere}. Die PDFs liegen bei Mitarbeiter und Kunde in den Akten – unten prüfen und versenden.`}</span></div>}
      <PageHeader crumbs={[{ href: "/einsaetze", label: "Einsatzplanung" }, { label: `${e.person.vorname} ${e.person.nachname} @ ${e.kunde.firmenname}` }]}
        title={<span className="flex items-center gap-3 flex-wrap">{e.person.vorname} {e.person.nachname} <span className="text-muted font-normal">bei</span> {e.kunde.firmenname} {einsatzStatusBadge(e.status)}{e.nachtschwerarbeit && <span className="badge badge-amber">Nachtschwerarbeit</span>}{e.schwerarbeit && <span className="badge badge-amber">Schwerarbeit</span>}</span>}
        sub={`${e.rolleImEinsatz} · ${datum(e.von)} – ${e.bis ? datum(e.bis) : "unbefristet"} · ${e.kostenstelle.name}`}
        actions={alleArbeitspapiereDa
          ? <Link href="#arbeitspapiere" className="btn btn-secondary">Arbeitspapiere ansehen</Link>
          : <form action={arbeitspapiereErzeugen.bind(null, id)}><input type="hidden" name="typ" value="ALLE" /><button className="btn btn-primary">Alle Dokumente erstellen</button></form>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Einsatz bearbeiten" className="reveal">
            <form action={einsatzSpeichern.bind(null, id)} className="grid sm:grid-cols-2 gap-4">
              <Field label="Rolle im Einsatz"><input name="rolle" defaultValue={e.rolleImEinsatz} className="input" /></Field>
              <Field label="Einsatzort"><input name="einsatzort" defaultValue={e.einsatzort ?? ""} className="input" /></Field>
              <Field label="Kostenstelle beim Kunden" help="Wird je Mitarbeiter auf der Rechnung ausgewiesen."><input name="kundenKostenstelle" defaultValue={e.kundenKostenstelle ?? ""} className="input" /></Field>
              <Field label="Angebot (Verrechnungssatz)"><select name="angebotId" defaultValue={e.angebotId ?? ""} className="select"><option value="">– ohne Angebot –</option>{angebote.map((a) => <option key={a.id} value={a.id}>{a.nummer} · {a.positionen.map((p) => `${p.rolle} ${p.verrechnungssatz?.toFixed(2) ?? "–"} €`).join(", ")}</option>)}</select></Field>
              <Field label="Beginn"><input type="date" name="von" defaultValue={isoDate(e.von)} className="input" /></Field>
              <Field label="Ende"><input type="date" name="bis" defaultValue={isoDate(e.bis)} className="input" /></Field>
              <Field label="Grenzüberschreitend / ZKO"><div className="space-y-1 mt-1"><label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="grenzueberschreitend" defaultChecked={e.grenzueberschreitend} /> Überlassung ins Ausland</label><label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="zkoGemeldet" defaultChecked={e.zkoGemeldet} /> ZKO-Meldung erledigt</label></div></Field>
              <Field label="Stundenerfassung in der Mitarbeiter-App" help="Standardmäßig aus. Erst wenn das angehakt ist, sieht der Mitarbeiter für diesen Einsatz den Stundenzettel in der App."><label className="flex items-center gap-2 text-[13.5px] mt-2"><input type="checkbox" name="stundenerfassungApp" defaultChecked={e.stundenerfassungApp} /> Mitarbeiter darf Stunden in der App erfassen</label></Field>
              <Field label="Schwerarbeit" help="Steht in der Überlassungsmitteilung (Punkte 9/10) und als Kennzeichen am Einsatz."><div className="space-y-1 mt-1"><label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="nachtschwerarbeit" defaultChecked={e.nachtschwerarbeit} /> Nachtschwerarbeitsgesetz (NSchG) kommt zur Anwendung</label><label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="schwerarbeit" defaultChecked={e.schwerarbeit} /> Schwerarbeitsverordnung kommt zur Anwendung</label></div></Field>
              <Field label="Art"><select name="art" defaultValue={e.art} className="select"><option value="UEBERLASSUNG">Arbeitskräfteüberlassung</option><option value="DIREKTVERMITTLUNG">Direktvermittlung</option></select></Field>
              {kostenstellen.length > 0 && (
                <Field label="Umsatz zählt zu Kostenstelle" help="Bestimmt, welcher Kostenstelle Umsatz und Provision zugeordnet werden. Noch nicht abgerechnete Monate ziehen mit.">
                  <select name="kostenstelleId" defaultValue={e.kostenstelleId} className="select">{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                </Field>
              )}
              {sensibel && <Field label="Vermittlungshonorar € (einmalig)"><input name="vermittlungshonorar" defaultValue={e.vermittlungshonorar ?? ""} className="input num" /></Field>}
              <Field label="Schichtmodell"><select name="schichtmodell" defaultValue={e.schichtmodell} className="select"><option value="TAG">Tagschicht</option><option value="ZWEI_SCHICHT">2-Schicht</option><option value="DREI_SCHICHT">3-Schicht</option><option value="FREI">Frei</option></select></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Wochenstunden"><input name="wochenstunden" defaultValue={e.wochenstunden} className="input num" /></Field><Field label="Auslastung %"><input name="auslastung" defaultValue={e.auslastung} className="input num" /></Field></div>
              {sensibel && <><Field label="Verrechnungssatz €/Std"><input name="verrechnungssatz" defaultValue={e.verrechnungssatz ?? ""} className="input num" /></Field><Field label="Bruttostundenlohn €/Std"><input name="stundenlohn" defaultValue={e.stundenlohn ?? ""} className="input num" /></Field></>}
              <div className="sm:col-span-2 section-title pt-2">Dienstvertrag (Arbeitsrecht) – wird im Personalstamm gespeichert</div>
              <DienstvertragFelder kvs={kvs} w={e.person} eintrittVorschlag={isoDate(e.von)} mitAustritt />
              {alleZulagen.length > 0 && <Field label="Zulagen & Zuschläge" className="sm:col-span-2"><div className="grid sm:grid-cols-2 gap-1.5 mt-1">{alleZulagen.map((z) => <label key={z.id} className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="zulage" value={z.kuerzel} defaultChecked={zul.some((x) => x.kuerzel === z.kuerzel)} /> {z.name} <span className="text-muted text-[12px]">{zulageText(z)}</span></label>)}</div></Field>}
              <Field label="Notizen" className="sm:col-span-2"><textarea name="notizen" defaultValue={e.notizen ?? ""} rows={3} className="textarea" /></Field>
              <div className="sm:col-span-2"><button className="btn btn-primary">Speichern</button></div>
            </form>
          </Card>
          {e.monatsabrechnungen.length > 0 && sensibel && (
            <Card title="Verrechnete Monate" pad={false} className="reveal reveal-2">
              <table className="table"><thead><tr><th>Monat</th><th className="r">Stunden</th><th className="r">Verrechnung</th><th className="r">Bruttolohn</th><th>Status</th></tr></thead><tbody>{e.monatsabrechnungen.map((m) => <tr key={m.id}><td>{String(m.monat).padStart(2, "0")}/{m.jahr}</td><td className="r num">{m.stunden ?? "–"}</td><td className="r num">{eur(m.verrechnung)}</td><td className="r num">{eur(m.bruttolohn)}</td><td>{m.status === "ABGERECHNET" ? <span className="badge badge-teal">abgerechnet</span> : <span className="badge badge-grey">offen</span>}</td></tr>)}</tbody></table>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {e.art === "DIREKTVERMITTLUNG" && sensibel && (
            <Card title={prov ? "Provision (Direktvermittlung)" : "Direktvermittlung"} className="reveal reveal-2">
              <Stat label="Vermittlungshonorar (netto)" value={eur(e.vermittlungshonorar)} />
              {!prov && <Stat label="DB2 (Honorar − Kostenumlage)" value={kostenMa == null ? "–" : eur(e.vermittlungshonorar != null ? e.vermittlungshonorar - kostenMa : null)} />}
              {zeigeProvision && <Stat label={prov ? "Provision" : `Provision Kostenstelle (${pp} % vom DB2)`} value={provAnzeige(provMonat(e.vermittlungshonorar))} />}
              <p className="help mt-2">Das Honorar wird in der Monatsabrechnung des Startmonats als Verrechnung vorbelegt (kein Bruttolohn, keine Abgaben).</p>
            </Card>
          )}
          {kalk && e.art !== "DIREKTVERMITTLUNG" && (
            <Card title={prov ? "Provision (Kalkulation)" : "Deckungsbeitrag (Kalkulation)"} className="reveal reveal-2">
              {!prov && <Gauge kosten={kalk.kalkulationProStunde} preis={kalk.verrechnungssatz} />}
              <div className="mt-3">
                {!prov && <Stat label="Selbstkosten / Std" value={eur(kalk.kalkulationProStunde)} />}
                <Stat label="Verrechnungssatz" value={<span>{eur(e.verrechnungssatz)}{zps.weiter > 0 && <span className="text-muted text-[12px]"> + Zulagen {eur(zps.weiter)} × Faktor = {eur(kalk.verrechnungssatz)}</span>}</span>} />
                {zul.length > 0 && <Stat label="Zulagen (Lohnseite)" value={`${eur(zps.lohn)}/Std · ${zul.map((z) => z.name).join(", ")}`} />}
                {prov ? (
                  <>
                    {zeigeProvision && <Stat label="Provision / Monat (kalk.)" value={provAnzeige(provMonat(kalk.db1ProMonat))} />}
                  </>
                ) : (
                  <>
                    <Stat label="DB1 / Std" value={<span className={kalk.db1ProStunde != null && kalk.db1ProStunde < 0 ? "text-red" : "text-teal"}>{eur(kalk.db1ProStunde)}</span>} />
                    <Stat label="DB1-Marge" value={pct(kalk.db1Marge)} />
                    <Stat label="DB1 / Monat (kalk.)" value={eur(kalk.db1ProMonat)} />
                    <Stat label="DB2 / Monat (nach Kostenumlage)" value={kostenMa == null ? "–" : eur(kalk.db1ProMonat != null ? kalk.db1ProMonat - kostenMa : null)} />
                    {zeigeProvision && <Stat label={`Provision Kostenstelle (${pp} % vom DB2)`} value={provAnzeige(provMonat(kalk.db1ProMonat))} />}
                  </>
                )}
              </div>
              {!prov && edb && (
                <div className={`mt-4 rounded-lg border p-3 ${edb.ampel === "gruen" ? "border-teal/40 bg-teal/5" : edb.ampel === "gelb" ? "border-amber/40 bg-amber/5" : "border-red/40 bg-red/5"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${edb.ampel === "gruen" ? "bg-teal" : edb.ampel === "gelb" ? "bg-amber" : "bg-red"}`} />
                    <span className="text-[13px] font-semibold">Deckungsbeitrag {edb.ampel === "gruen" ? "in Ordnung" : edb.ampel === "gelb" ? "knapp" : "zu niedrig"} · {pct(edb.marge)}</span>
                  </div>
                  <div className="text-[12.5px] text-muted">DB {eur(edb.db1ProStd)}/Std bei {eur(edb.verrechnungssatz)} Verrechnungssatz und {eur(edb.selbstkostenProStd)} Selbstkosten · rund {eur(edb.db1Monat)} im Monat bei {edb.stundenMonat.toLocaleString("de-AT")} Stunden. Zielkorridor: ab 18 % grün, ab 10 % gelb.</div>
                  {edb.hinweise.length > 0 && <ul className="mt-1.5 text-[12.5px] list-disc pl-4 space-y-0.5">{edb.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>}
                </div>
              )}
            </Card>
          )}
          <Card title="Arbeitspapiere" className="reveal reveal-2" id="arbeitspapiere">
            <p className="help mb-3">Arbeitsvertrag, Überlassungsmitteilung und Zusatzvereinbarung – direkt aus diesem Einsatz, im Layout deiner Word-Vorlagen. Bekannte Daten sind ausgefüllt, alles andere bleibt ein Ausfüllfeld. Dateinamen wie die Vorlagen (keine Verwechslung).</p>
            <div className="space-y-2">
              {ARBEITSPAPIERE.map((t) => {
                const vorhanden = e.vertraege.find((v) => v.typ === t);
                return vorhanden ? (
                  <div key={t} className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px]">{vertragTitel(t)}</span>
                    <Link href={`/vertraege/${vorhanden.id}`} className="btn btn-secondary btn-sm">{vorhanden.nummer} öffnen</Link>
                  </div>
                ) : (
                  <form key={t} action={arbeitspapiereErzeugen.bind(null, id)} className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px]">{vertragTitel(t)}</span>
                    <input type="hidden" name="typ" value={t} />
                    <button className="btn btn-secondary btn-sm">Erzeugen</button>
                  </form>
                );
              })}
              {!alleArbeitspapiereDa && (
                <form action={arbeitspapiereErzeugen.bind(null, id)} className="pt-1">
                  <input type="hidden" name="typ" value="ALLE" />
                  <button className="btn btn-primary btn-sm w-full justify-center">Alle drei erzeugen</button>
                </form>
              )}
            </div>
          </Card>
          <Card title="Status" className="reveal reveal-3">
            <form action={einsatzStatus.bind(null, id)} className="space-y-3">
              <select name="status" defaultValue={e.status} className="select"><option value="GEPLANT">Geplant</option><option value="AKTIV">Aktiv</option><option value="BEENDET">Beendet</option><option value="ABGEBROCHEN">Abgebrochen</option></select>
              <Field label="Ende (bei Beendigung)"><input type="date" name="bis" defaultValue={isoDate(e.bis)} className="input" /></Field>
              <Field label="Auflösungsart" help="Steht in der Einsatzhistorie des Mitarbeiters – Grundlage für Wiedereinsatzquote und Sperrlisten."><select name="aufloesungsart" defaultValue={e.aufloesungsart ?? ""} className="select">{AUFLOESUNGSARTEN.map((a) => <option key={a} value={a === "– offen –" ? "" : a}>{a}</option>)}</select></Field>
              <button className="btn btn-secondary w-full justify-center">Übernehmen</button>
            </form>
            <p className="text-[12px] text-muted mt-3">Beim Beenden ohne weiteren Einsatz wandert die Person automatisch zurück in den Bewerber-Pool.</p>
            {s.rolle === "SYSTEMADMIN" && <form action={einsatzLoeschen.bind(null, id)} className="mt-3"><button className="btn btn-ghost btn-sm w-full justify-center text-red">Einsatz endgültig löschen (nur Systemadmin)</button><p className="help mt-1">Planung, Verträge und Nachweise werden vom Einsatz gelöst.</p><label className="flex items-start gap-2 mt-2 text-[12px] text-muted"><input type="checkbox" name="erzwingen" value="ja" className="mt-[3px]" /><span>Auch Rechnungspositionen und abgerechnete Monate mitlöschen (Rechnungen werden neu gerechnet).</span></label></form>}
          </Card>
          {e.vertraege.length > 0 && <Card title="Verträge" className="reveal reveal-4"><ul className="divide-y divide-line">{e.vertraege.map((v) => <li key={v.id} className="py-2 flex justify-between text-[13.5px]"><Link href={`/vertraege/${v.id}`} className="font-semibold hover:text-brand">{v.nummer}</Link><span className="text-muted">{v.typ.replace("_", " ")} · {v.status}</span></li>)}</ul></Card>}
        </div>
      </div>
    </>
  );
}
