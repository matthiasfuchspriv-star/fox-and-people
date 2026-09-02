"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Check, AlertTriangle } from "lucide-react";
import { berechneAngebotsposition, monatsstunden } from "@/lib/angebot-kalkulation";
import { Dezimal } from "@/components/dezimal";
import type { AbgabenSaetze } from "@/engine/kalkulation";
import { angebotSpeichern, type PositionInput } from "../actions";
import { Gauge } from "@/components/ui";
import { mindestlohnAbsolut } from "@/lib/mindestlohn-regel";
import { mitReferenzzuschlag } from "@/lib/referenzlohn-rechnen";

const eur = (n: number | null | undefined, d = 2) => n == null || Number.isNaN(n) ? "–" : new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const pct = (n: number | null | undefined) => n == null || Number.isNaN(n) ? "–" : new Intl.NumberFormat("de-AT", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

type Kv = { id: string; name: string; lohntabelle: { beschaeftigungsgruppe: string; bezeichnung: string | null; mindestStundenlohn: number | null; mindestMonatsbrutto: number | null; referenzzuschlagProzent: number | null }[] };

/**
 * Referenzlohn einer Beschäftigungsgruppe – KV-Stundenlohn zuzüglich Referenzzuschlag nach § 10 AÜG.
 *
 * Das ist der Betrag, mit dem ein Angebot rechnen muss. Der nackte KV-Lohn ist es ausdrücklich
 * nicht: Wer damit kalkuliert, bietet einen Satz an, den er später nicht halten kann, ohne den
 * Mitarbeiter zu unterzahlen.
 */
function referenzlohnStufe(stufe: { mindestStundenlohn: number | null; referenzzuschlagProzent: number | null } | undefined) {
  if (!stufe?.mindestStundenlohn) return null;
  return stufe.referenzzuschlagProzent != null
    ? mitReferenzzuschlag(stufe.mindestStundenlohn, stufe.referenzzuschlagProzent)
    : stufe.mindestStundenlohn;
}

export function AngebotEditor({ id, kopf, positionen: init, saetze, kvs, kundenKvId, readOnly, konditionen, bundeslaender, provision, zulagen }: {
  id: string;
  /** gesetzt für Kostenstellen-Nutzer: sie sehen statt DB1 nur ihre (serverseitig berechnete) Provision – der Prozentsatz wird nicht übertragen */
  provision?: { monat: number | null; jahr: number | null } | null;
  kopf: { betreff: string; gultigBis: string; bundesland: string; einleitung: string; schlusstext: string; stundennachweisVomKunden: boolean };
  positionen: PositionInput[];
  saetze: AbgabenSaetze;
  kvs: Kv[];
  /** Beschäftiger-KV dieses Kunden – neue Positionen starten damit, nicht mit dem erstbesten KV der Liste */
  kundenKvId?: string | null;
  readOnly: boolean;
  konditionen: { rolle: string; stundensatz: number }[];
  bundeslaender: string[];
  /** weiterverrechenbare Zulagen aus den Stammdaten – im Angebot je Position auswählbar */
  zulagen: { id: string; name: string; kuerzel: string; art: string; wert: number }[];
}) {
  const [k, setK] = useState(kopf);
  const [pos, setPos] = useState<PositionInput[]>(init.length ? init : [leer()]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function leer(): PositionInput { return { kalkulationsart: "UEBERLASSUNG", rolle: "", anzahlPersonen: 1, stundenlohn: null, bruttogehalt: null, wochenstunden: 38.5, stundenProMonat: null, verrechnungssatz: null, aufschlagMonat: null, honorar: null, kvId: kundenKvId ?? kvs[0]?.id ?? null, beschaeftigungsgruppe: null, zuschlag50: 0.35, zuschlag100: 0.7, zulagenIds: [] }; }
  const upd = (i: number, patch: Partial<PositionInput>) => { setPos((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const stufeVon = (p: PositionInput) => kvs.find((x) => x.id === p.kvId)?.lohntabelle.find((l) => l.beschaeftigungsgruppe === p.beschaeftigungsgruppe);

  /**
   * Beschäftigungsgruppe gewählt – der Referenzlohn wird eingetragen, nicht abgetippt.
   *
   * Der Bruttostundenlohn ist die Zahl, an der alles hängt: Kalkulation, Verrechnungssatz, später
   * der Einsatz und der Arbeitsvertrag. Ihn von Hand einzutragen heißt, den Referenzzuschlag jedes
   * Mal neu im Kopf zu rechnen – und irgendwann steht dort der nackte KV-Lohn.
   *
   * Ein bereits höherer Lohn bleibt stehen: Mehr zahlen ist erlaubt, weniger nicht.
   */
  const waehleGruppe = (i: number, bg: string | null) => {
    const p = pos[i];
    const stufe = kvs.find((x) => x.id === p.kvId)?.lohntabelle.find((l) => l.beschaeftigungsgruppe === bg);
    if (p.kalkulationsart === "PAYROLL") {
      const monat = stufe?.mindestMonatsbrutto ?? null;
      upd(i, { beschaeftigungsgruppe: bg, ...(monat != null && (p.bruttogehalt ?? 0) < monat ? { bruttogehalt: monat } : {}) });
      return;
    }
    const ref = referenzlohnStufe(stufe);
    const soll = Math.max(ref ?? 0, mindestlohnAbsolut());
    upd(i, { beschaeftigungsgruppe: bg, ...(soll > 0 && (p.stundenlohn ?? 0) < soll ? { stundenlohn: soll } : {}) });
  };

  const kalk = useMemo(() => pos.map((p) => {
    const stufe = kvs.find((x) => x.id === p.kvId)?.lohntabelle.find((l) => l.beschaeftigungsgruppe === p.beschaeftigungsgruppe);
    // Besserer KV + Hausregel (13,90 € bis 31.12.2026): kein Angebot unter dem maßgeblichen Mindestlohn
    // Maßgeblich ist der Referenzlohn (KV-Lohn + Referenzzuschlag), nicht der nackte KV-Lohn.
    const mindestlohn = p.kalkulationsart === "PAYROLL" ? stufe?.mindestMonatsbrutto ?? null : Math.max(referenzlohnStufe(stufe) ?? 0, mindestlohnAbsolut());
    return { ...berechneAngebotsposition({ ...p, anzahlPersonen: 1, stundenProMonat: monatsstunden(p.wochenstunden), mindestlohn }, saetze), mindestlohn };
  }), [pos, saetze, kvs]);
  const router = useRouter();
  const summe = kalk.reduce((a, c) => ({ umsatz: a.umsatz + (c.umsatzMonat ?? 0), db1: a.db1 + (c.db1Monat ?? 0) }), { umsatz: 0, db1: 0 });
  const marge = summe.umsatz ? summe.db1 / summe.umsatz : null;

  const speichern = () => start(async () => {
    const r = await angebotSpeichern(id, k, pos);
    setMsg(r.ok ? "Gespeichert" : r.fehler ?? "Fehler");
    if (r.ok) { setDirty(false); router.refresh(); }
    setTimeout(() => setMsg(null), 2500);
  });

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <section className="card card-pad reveal">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="field sm:col-span-2"><label className="label">Betreff</label><input className="input" value={k.betreff} disabled={readOnly} onChange={(e) => { setK({ ...k, betreff: e.target.value }); setDirty(true); }} /></div>
            <div className="field"><label className="label">Gültig bis</label><input type="date" className="input" value={k.gultigBis} disabled={readOnly} onChange={(e) => { setK({ ...k, gultigBis: e.target.value }); setDirty(true); }} /></div>
            <div className="field"><label className="label">Bundesland (DZ-Satz)</label><select className="select" value={k.bundesland} disabled={readOnly} onChange={(e) => { setK({ ...k, bundesland: e.target.value }); setDirty(true); }}>{bundeslaender.map((b) => <option key={b}>{b}</option>)}</select><div className="help">DZ {pct(saetze.dz)} · DG-Abgaben gesamt {pct(saetze.pensionsversicherung + saetze.krankenversicherung + saetze.unfallversicherung + saetze.arbeitslosenversicherung + saetze.iesg + saetze.wohnbaufoerderung + saetze.swf + saetze.mitarbeitervorsorge + saetze.dienstgeberbeitrag + saetze.dz + saetze.kommunalsteuer)}</div></div>
            <div className="field sm:col-span-3">
              <label className="label">Stundennachweis</label>
              <select className="select" value={k.stundennachweisVomKunden ? "KUNDE" : "WIR"} disabled={readOnly} onChange={(e) => { setK({ ...k, stundennachweisVomKunden: e.target.value === "KUNDE" }); setDirty(true); }}>
                <option value="WIR">Wir schicken den Stundennachweis zur Freigabe (Portal-Link an den Beschäftiger)</option>
                <option value="KUNDE">Wir bekommen die Stundenzettel vom Beschäftiger (kein Link nötig)</option>
              </select>
              <div className="help">Steht so im Angebot und wird beim Annehmen zum Kunden übernommen. „Vom Beschäftiger“ heißt: kein Freigabe-Link geht hinaus.</div>
            </div>
            <div className="field sm:col-span-2"><label className="label">Einleitung (optional)</label><input className="input" value={k.einleitung} disabled={readOnly} placeholder="Sehr geehrte Damen und Herren, vielen Dank für Ihre Anfrage …" onChange={(e) => { setK({ ...k, einleitung: e.target.value }); setDirty(true); }} /></div>
          </div>
        </section>

        {pos.map((p, i) => {
          const c = kalk[i];
          const kv = kvs.find((x) => x.id === p.kvId);
          const ueb = p.kalkulationsart === "UEBERLASSUNG"; const pay = p.kalkulationsart === "PAYROLL";
          return (
            <section key={i} className="card reveal overflow-hidden">
              <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-line">
                <span className="w-7 h-7 rounded-lg bg-brand-soft text-brand font-bold text-[12px] flex items-center justify-center">{i + 1}</span>
                <select className="select !w-auto !py-1.5 font-semibold" value={p.kalkulationsart} disabled={readOnly} onChange={(e) => upd(i, { kalkulationsart: e.target.value as PositionInput["kalkulationsart"] })}>
                  <option value="UEBERLASSUNG">Überlassung (pro Leistungsstunde)</option>
                  <option value="PAYROLL">Payroll (Angestellte, 12×/Jahr)</option>
                  <option value="VERMITTLUNG">Vermittlung (Honorar)</option>
                </select>
                <div className="ml-auto flex items-center gap-2">
                  {c.status && <span className={`badge ${c.status === "positiv" ? "badge-teal" : "badge-red"}`}>{provision ? "Provision" : "DB1"} {c.status}</span>}
                  {c.unterMindestlohn && <span className="badge badge-red"><AlertTriangle size={11} /> unter Mindestlohn {c.mindestlohn?.toFixed(2)} € (besserer KV / Hausregel 13,90 €)</span>}
                  {!readOnly && <button type="button" className="btn btn-ghost btn-sm text-red" onClick={() => { setPos((x) => x.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 size={14} /></button>}
                </div>
              </div>
              <div className="grid md:grid-cols-[1fr_300px]">
                <div className="p-5 grid sm:grid-cols-3 gap-4">
                  <div className="field sm:col-span-2"><label className="label">Rolle / Position</label><input className="input" list={`rollen-${i}`} value={p.rolle} disabled={readOnly} onChange={(e) => { const kond = konditionen.find((x) => x.rolle.toLowerCase() === e.target.value.toLowerCase()); upd(i, { rolle: e.target.value, ...(kond && ueb && p.verrechnungssatz == null ? { verrechnungssatz: kond.stundensatz } : {}) }); }} /><datalist id={`rollen-${i}`}>{konditionen.map((x) => <option key={x.rolle} value={x.rolle}>{`${x.stundensatz.toFixed(2)} €/Std hinterlegt`}</option>)}</datalist></div>
                  {ueb && <>
                    <div className="field"><label className="label">Bruttostundenlohn €</label><Dezimal wert={p.stundenlohn} disabled={readOnly} aendern={(n) => upd(i, { stundenlohn: n })} /></div>
                    <div className="field"><label className="label">Wöchentliche Sollarbeitszeit</label><Dezimal wert={p.wochenstunden} nachkomma={1} disabled={readOnly} placeholder="38,5" aendern={(n) => upd(i, { wochenstunden: n })} /><div className="help">= {monatsstunden(p.wochenstunden)?.toLocaleString("de-AT", { maximumFractionDigits: 1 }) ?? "–"} Std/Monat (× 4,3333) – nur für die interne Kalkulation</div></div>
                    <div className="field"><label className="label">Verrechnungssatz an Kunde €/Std</label><Dezimal wert={p.verrechnungssatz} disabled={readOnly} className="input num font-bold" aendern={(n) => upd(i, { verrechnungssatz: n })} /></div>
                  </>}
                  {pay && <>
                    <div className="field"><label className="label">Bruttogehalt €/Monat</label><Dezimal wert={p.bruttogehalt} disabled={readOnly} aendern={(n) => upd(i, { bruttogehalt: n })} /></div>
                    <div className="field"><label className="label">Aufschlag €/Monat (= DB1)</label><Dezimal wert={p.aufschlagMonat} disabled={readOnly} className="input num font-bold" aendern={(n) => upd(i, { aufschlagMonat: n })} /></div>
                    <div className="field"><label className="label">Verkaufspreis €/Monat</label><input className="input num" readOnly value={c.preis == null ? "" : c.preis.toFixed(2).replace(".", ",")} /></div>
                  </>}
                  {!ueb && !pay && <div className="field"><label className="label">Vermittlungshonorar € (einmalig)</label><Dezimal wert={p.honorar} disabled={readOnly} className="input num font-bold" aendern={(n) => upd(i, { honorar: n })} /></div>}
                  {(ueb || pay) && <>
                    <div className="field"><label className="label">Kollektivvertrag</label><select className="select" value={p.kvId ?? ""} disabled={readOnly} onChange={(e) => upd(i, { kvId: e.target.value || null, beschaeftigungsgruppe: null })}><option value="">–</option>{kvs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                    <div className="field"><label className="label">Beschäftigungsgruppe</label><select className="select" value={p.beschaeftigungsgruppe ?? ""} disabled={readOnly || !kv} onChange={(e) => waehleGruppe(i, e.target.value || null)}><option value="">–</option>{kv?.lohntabelle.map((l) => <option key={l.beschaeftigungsgruppe} value={l.beschaeftigungsgruppe}>{l.beschaeftigungsgruppe} · {l.bezeichnung} · {eur(pay ? l.mindestMonatsbrutto : (referenzlohnStufe(l) ?? l.mindestStundenlohn))}{!pay && l.referenzzuschlagProzent != null ? ` (inkl. ${l.referenzzuschlagProzent.toString().replace(".", ",")} % Ref.)` : ""}</option>)}</select>{c.mindestlohn != null && <div className={`help ${c.unterMindestlohn ? "!text-red font-semibold" : ""}`}>{pay ? "KV-Mindestgehalt" : stufeVon(p)?.referenzzuschlagProzent != null ? "Referenzlohn § 10 AÜG" : "KV-Mindestlohn"} {eur(c.mindestlohn)}{pay ? "/Monat" : "/Std"}{!pay && stufeVon(p)?.referenzzuschlagProzent != null && <> · KV {eur(stufeVon(p)?.mindestStundenlohn)} + {stufeVon(p)!.referenzzuschlagProzent!.toString().replace(".", ",")} % Referenzzuschlag</>}</div>}</div>
                  </>}
                  {ueb && <div className="sm:col-span-3 border-t border-line pt-4 mt-1">
                    <div className="section-title mb-2">Zuschläge – stehen immer im Angebot</div>
                    <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
                      <div className="field"><label className="label">Überstunde 50 % – Aufschlag in %</label><Dezimal wert={p.zuschlag50 == null ? null : p.zuschlag50 * 100} nachkomma={1} disabled={readOnly} aendern={(n) => upd(i, { zuschlag50: n == null ? null : n / 100 })} /><div className="help">{eur(p.verrechnungssatz != null && p.zuschlag50 != null ? p.verrechnungssatz * (1 + p.zuschlag50) : null)} / Std</div></div>
                      <div className="field"><label className="label">Überstunde 100 % – Aufschlag in %</label><Dezimal wert={p.zuschlag100 == null ? null : p.zuschlag100 * 100} nachkomma={1} disabled={readOnly} aendern={(n) => upd(i, { zuschlag100: n == null ? null : n / 100 })} /><div className="help">{eur(p.verrechnungssatz != null && p.zuschlag100 != null ? p.verrechnungssatz * (1 + p.zuschlag100) : null)} / Std</div></div>
                    </div>
                    {zulagen.length > 0 && <>
                      <div className="section-title mt-4 mb-2">Zulagen – nur die angehakten stehen im Angebot</div>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {zulagen.map((z) => (
                          <label key={z.id} className="flex items-center gap-2 text-[13px]">
                            <input type="checkbox" checked={p.zulagenIds.includes(z.id)} disabled={readOnly}
                              onChange={(e) => upd(i, { zulagenIds: e.target.checked ? [...p.zulagenIds, z.id] : p.zulagenIds.filter((x) => x !== z.id) })} />
                            <span>{z.name} <span className="text-muted">({zulageText(z)})</span></span>
                          </label>
                        ))}
                      </div>
                    </>}
                  </div>}
                </div>
                <div className="bg-surface-2 border-l border-line p-5">
                  <div className="section-title mb-2">{provision ? "Provision (intern)" : "Kalkulation (intern)"}</div>
                  {provision && <div className="text-[13px] space-y-1.5">
                    {ueb && <><Row l="Verrechnungssatz" v={eur(c.preis)} /><Row l={`Volumen / Monat (${monatsstunden(p.wochenstunden) ?? 0} h)`} v={eur(c.umsatzMonat)} /><Row l="Kalkulation" v={c.status === "positiv" ? "kostendeckend" : c.status === "negativ" ? "nicht kostendeckend" : "–"} tone={c.status} bold /></>}
                    {pay && <><Row l="Verkaufspreis / Monat" v={eur(c.preis)} /><Row l="Kalkulation" v={c.status === "positiv" ? "kostendeckend" : c.status === "negativ" ? "nicht kostendeckend" : "–"} tone={c.status} bold /></>}
                    {!ueb && !pay && <Row l="Honorar gesamt" v={eur(c.umsatzMonat)} bold />}
                    {c.status === "negativ" && <p className="text-red text-[12px] mt-2">Preis liegt unter den Selbstkosten – bitte Verrechnungssatz erhöhen.</p>}
                    <p className="text-muted text-[12px] mt-2">Deine Provision wird nach dem Speichern rechts angezeigt.</p>
                  </div>}
                  {!provision && ueb && <><Gauge kosten={c.selbstkosten} preis={c.preis} /><div className="mt-3 text-[13px] space-y-1.5">
                    <Row l="Stundenlohn" v={eur(p.stundenlohn)} />
                    <Row l={`× Faktor ${c.faktor.toFixed(4)}`} v="" muted />
                    <Row l="Selbstkosten / Std" v={eur(c.selbstkosten)} bold />
                    <Row l="Verrechnungssatz" v={eur(c.preis)} />
                    <Row l="DB1 / Std" v={eur(c.db1Einheit)} tone={c.status} bold />
                    <Row l="DB1-Marge" v={pct(c.db1Marge)} tone={c.status} />
                    <Row l={`DB1 / Monat (${monatsstunden(p.wochenstunden) ?? 0} h)`} v={eur(c.db1Monat)} />
                    <Row l="DB1 / Jahr" v={eur(c.db1Jahr)} bold />
                  </div></>}
                  {!provision && pay && <><Gauge kosten={c.selbstkosten} preis={c.preis} /><div className="mt-3 text-[13px] space-y-1.5">
                    <Row l="Bruttogehalt" v={eur(p.bruttogehalt)} />
                    <Row l={`× Payroll-Faktor ${c.faktor.toFixed(4)}`} v="" muted />
                    <Row l="Selbstkosten / Monat" v={eur(c.selbstkosten)} bold />
                    <Row l="Verkaufspreis / Monat" v={eur(c.preis)} />
                    <Row l="DB1 / Monat" v={eur(c.db1Monat)} tone={c.status} bold />
                    <Row l="DB1-Marge" v={pct(c.db1Marge)} tone={c.status} />
                    <Row l="Verkaufsfaktor" v={c.detail.verkaufsfaktor ? c.detail.verkaufsfaktor.toFixed(3) : "–"} />
                    <Row l="DB1 / Jahr" v={eur(c.db1Jahr)} bold />
                  </div></>}
                  {!provision && !ueb && !pay && <div className="text-[13px] space-y-1.5"><Row l="Honorar gesamt" v={eur(c.umsatzMonat)} bold /><Row l="DB1" v={eur(c.db1Monat)} tone="positiv" /></div>}
                </div>
              </div>
            </section>
          );
        })}
        {!readOnly && <button type="button" className="btn btn-secondary" onClick={() => { setPos((p) => [...p, leer()]); setDirty(true); }}><Plus size={15} /> Position hinzufügen</button>}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 self-start">
        <section className="card card-pad reveal reveal-2">
          <div className="section-title mb-3">Angebot gesamt</div>
          <div className="text-[12px] text-muted">Monatsvolumen (netto)</div>
          <div className="num text-[26px] font-extrabold">{eur(summe.umsatz, 0)}</div>
          {provision ? (
            <>
              <div className="mt-3 text-[12px] text-muted">Provision / Monat{dirty && <span className="text-amber"> · nach dem Speichern aktuell</span>}</div>
              {provision.monat == null ? <div className="text-[13px] text-amber mt-1">Noch nicht verfügbar – die Zentrale hat die Controlling-Kosten noch nicht hinterlegt.</div> : <>
                <div className={`num text-[22px] font-extrabold ${provision.monat < 0 ? "text-red" : "text-teal"}`}>{eur(provision.monat, 0)}</div>
                <div className="mt-1 text-[13px]">Provision/Jahr <b className="num">{eur(provision.jahr ?? 0, 0)}</b></div>
              </>}
            </>
          ) : (
            <>
              <div className="mt-3 text-[12px] text-muted">DB1 / Monat</div>
              <div className={`num text-[22px] font-extrabold ${summe.db1 < 0 ? "text-red" : "text-teal"}`}>{eur(summe.db1, 0)}</div>
              <div className="mt-1 text-[13px]">Ø DB1-Marge <b className={`num ${marge != null && marge < 0 ? "text-red" : ""}`}>{pct(marge)}</b> · DB1/Jahr <b className="num">{eur(summe.db1 * 12, 0)}</b></div>
              <div className="mt-3"><Gauge kosten={summe.umsatz - summe.db1} preis={summe.umsatz} /></div>
            </>
          )}
          <p className="text-[11.5px] text-muted mt-3">Kalkulation bleibt intern – im PDF erscheinen nur Verrechnungssätze (kein Open Book).</p>
        </section>
        {!readOnly && (
          <button type="button" onClick={speichern} disabled={pending} className={`btn w-full justify-center ${dirty ? "btn-primary" : "btn-secondary"}`}>
            {msg ? <><Check size={15} /> {msg}</> : <><Save size={15} /> {pending ? "Speichern…" : dirty ? "Änderungen speichern" : "Gespeichert"}</>}
          </button>
        )}
      </aside>
    </div>
  );
}

/** kurze Beschreibung einer Zulage für die Auswahl */
function zulageText(z: { art: string; wert: number }): string {
  if (z.art === "PROZENT_STUNDENLOHN") return `${z.wert.toLocaleString("de-AT")} % vom Stundenlohn`;
  const je = z.art === "EURO_STUNDE" ? "Std" : z.art === "EURO_TAG" ? "Tag" : "Monat";
  return `${z.wert.toLocaleString("de-AT", { minimumFractionDigits: 2 })} € / ${je}`;
}

function Row({ l, v, bold, muted, tone }: { l: string; v: string; bold?: boolean; muted?: boolean; tone?: "positiv" | "negativ" | null }) {
  return <div className={`flex justify-between gap-3 ${muted ? "text-muted text-[12px]" : ""}`}><span className="text-muted">{l}</span><span className={`num ${bold ? "font-bold" : ""} ${tone === "negativ" ? "text-red" : tone === "positiv" ? "text-teal" : ""}`}>{v}</span></div>;
}
