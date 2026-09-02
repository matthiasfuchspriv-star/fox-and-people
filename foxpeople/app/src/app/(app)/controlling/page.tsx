import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { kostenJahr } from "@/lib/kosten";
import { controlling } from "@/lib/controlling";
import { forecast } from "@/lib/forecast";
import { liquiditaet } from "@/lib/liquiditaet";
import { auegStatistik } from "@/lib/aueg-statistik";
import { fehlzeitenJeKunde, recruitingKennzahlen } from "@/lib/kennzahlen";
import { eur, pct, datum, MONATE, MONATE_LANG } from "@/lib/format";
import { PageHeader, Card, Field, Kpi, Empty, Badge } from "@/components/ui";
import { kostenSpeichern, planSpeichern, kontostandSpeichern, provisionErzeugen, provisionStatus } from "./actions";

export const dynamic = "force-dynamic";
const TABS = [["kosten", "Kosten & DB2"], ["plan", "Plan / Ist / Forecast"], ["liquiditaet", "Liquidität"], ["provisionen", "Provisionsbelege"], ["rueckstellungen", "Rückstellungen UZ/WR"], ["fehlzeiten", "Fehlzeiten & Krankenstand"], ["recruiting", "Recruiting & Bindung"], ["aueg", "AÜG-Statistik"]] as const;

/** Controlling der Zentrale: Gemeinkosten → DB2 → Provisionen, Plan/Ist, Liquidität, Provisionsbelege, Überlassungsstatistik. */
export default async function ControllingPage({ searchParams }: { searchParams: Promise<{ tab?: string; jahr?: string; monat?: string; ks?: string; ok?: string; fehler?: string; stichtag?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  const sp = await searchParams;
  const tab = sp.tab ?? "kosten";
  const heute = new Date();
  const jahr = Number(sp.jahr) || heute.getFullYear();
  const ks = sp.ks ?? "";
  const kostenstellen = await db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: { isZentrale: "desc" } });
  const jahrForm = (extra?: React.ReactNode) => (
    <form className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      <select name="jahr" defaultValue={jahr} className="select !w-auto !py-1.5">{[jahr - 2, jahr - 1, jahr, jahr + 1].map((j) => <option key={j} value={j}>{j}</option>)}</select>
      {extra}
      <button className="btn btn-secondary btn-sm">Anzeigen</button>
    </form>
  );

  return (
    <>
      <PageHeader title="Controlling" sub="Gemeinkosten und Kostenumlage → DB2 und Provisionen · Plan/Ist mit Hochrechnung · Liquiditätsvorschau · Provisionsbelege · Überlassungsstatistik § 13 AÜG." />
      <div className="tabs mb-5 overflow-x-auto reveal">{TABS.map(([k, l]) => <Link key={k} href={`/controlling?tab=${k}&jahr=${jahr}`} className={`tab whitespace-nowrap ${tab === k ? "active" : ""}`}>{l}</Link>)}</div>
      {sp.ok && <div className="alert alert-teal mb-4">Gespeichert.</div>}
      {sp.fehler && <div className="alert alert-red mb-4">{sp.fehler === "pflicht" ? "Bitte Jahr, Gesamtkosten und Kosten je Mitarbeiter angeben." : sp.fehler}</div>}

      {tab === "kosten" && <KostenTab jahr={jahr} ks={ks} kostenstellen={kostenstellen} jahrForm={jahrForm} />}
      {tab === "plan" && <PlanTab jahr={jahr} ks={ks} kostenstellen={kostenstellen} jahrForm={jahrForm} />}
      {tab === "liquiditaet" && <LiquiTab ks={ks} kostenstellen={kostenstellen} />}
      {tab === "provisionen" && <ProvisionenTab jahr={jahr} monat={Number(sp.monat) || (heute.getMonth() === 0 ? 12 : heute.getMonth())} kostenstellen={kostenstellen} />}
      {tab === "rueckstellungen" && <RueckstellungenTab jahr={jahr} jahrForm={jahrForm} />}
      {tab === "fehlzeiten" && <FehlzeitenTab jahr={jahr} ks={ks} kostenstellen={kostenstellen} jahrForm={jahrForm} />}
      {tab === "recruiting" && <RecruitingTab ks={ks} kostenstellen={kostenstellen} />}
      {tab === "aueg" && <AuegTab jahr={jahr} stichtag={sp.stichtag} kostenstellen={kostenstellen} />}
    </>
  );
}

type Kst = { id: string; name: string; isZentrale: boolean; provisionUeberlassung: number; provisionVermittlung: number };
type JahrForm = (extra?: React.ReactNode) => React.ReactNode;

async function KostenTab({ jahr, ks, kostenstellen, jahrForm }: { jahr: number; ks: string; kostenstellen: Kst[]; jahrForm: JahrForm }) {
  const [c, alleKosten, kostenbild] = await Promise.all([controlling(jahr), db.controllingkosten.findMany({ orderBy: [{ jahr: "desc" }, { kostenstelleId: "asc" }] }), kostenJahr(jahr)]);
  // Was in der monatlichen Kostenerfassung steht – als nachvollziehbarer Vorschlag für die Jahressumme
  const kostenAusPositionen = kostenbild.summeJahr;
  const exakt = alleKosten.find((k) => k.jahr === jahr && k.kostenstelleId === ks) ?? null;
  const standard = alleKosten.find((k) => k.jahr === jahr && k.kostenstelleId === "") ?? null;
  const kstRows = await Promise.all(kostenstellen.map(async (k) => ({ k, c: await controlling(jahr, k.id) })));
  // Kosten sind da, sobald *eine* der beiden Quellen etwas liefert: die monatliche Erfassung oder
  // der von Hand gepflegte Satz. Vorher hing alles am Datensatz „Controlling-Kosten", und wer seine
  // Fixkosten sauber erfasst hatte, sah trotzdem überall einen Strich.
  const habenKosten = Boolean(c.kosten) || kostenAusPositionen > 0;
  const gemeinkosten = kostenAusPositionen || c.kosten?.gesamtkosten || 0;
  const ergebnis = habenKosten ? c.gesamt.db1 - gemeinkosten : null;
  const ksName = (id: string) => (id ? kostenstellen.find((k) => k.id === id)?.name ?? id : "Standard (alle)");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">{jahrForm()}</div>
      {!c.kosten && !kostenAusPositionen && <div className="alert alert-amber mb-4"><span><strong>Für {jahr} sind noch keine Kosten hinterlegt.</strong> Ohne Kosten gibt es keinen DB2 und keine Provision für die Kostenstellen – trag sie unter „Kosten monatlich erfassen“ ein, dann werden sie automatisch gegen den DB1 gerechnet.</span></div>}
      {c.kosten && c.kosten.jahr !== jahr && <div className="alert alert-amber mb-4"><span>Für {jahr} gelten vorläufig die Kosten aus {c.kosten.jahr} – bitte für {jahr} bestätigen oder anpassen.</span></div>}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <Kpi label={`DB1 gesamt ${jahr}`} value={eur(c.gesamt.db1, 0)} tone={c.gesamt.db1 >= 0 ? "teal" : "red"} sub={c.gesamt.praemien > 0 ? `Umsatz ${eur(c.gesamt.umsatz, 0)} · nach ${eur(c.gesamt.praemien, 0)} Empfehlungsprämien` : `Umsatz ${eur(c.gesamt.umsatz, 0)}`} />
        <Kpi label="Kostenumlage Mitarbeiter" value={eur(c.gesamt.kostenUmlage, 0)} sub={kostenAusPositionen ? `aus den erfassten Kosten ${jahr}, auf die eingesetzten Mitarbeiter verteilt` : c.kosten ? `feste Umlage ${eur(c.kosten.kostenProMitarbeiterMonat, 0)} je Mitarbeiter und Monat` : "noch keine Kosten hinterlegt"} className="reveal-2" />
        <Kpi label={`DB2 gesamt ${jahr}`} value={habenKosten ? eur(c.gesamt.db2, 0) : "–"} tone={habenKosten ? (c.gesamt.db2 >= 0 ? "teal" : "red") : undefined} sub={habenKosten && c.gesamt.umsatz ? `DB2-Marge ${pct(c.gesamt.db2 / c.gesamt.umsatz)}` : "DB1 − Kostenumlage"} className="reveal-3" />
        <Kpi label="Provisionen Kostenstellen" value={habenKosten ? eur(c.gesamt.provision, 0) : "–"} tone="fox" sub="Summe aller untergeordneten Kostenstellen" className="reveal-4" />
        <Kpi label="Ergebnis nach Gemeinkosten" value={ergebnis != null ? eur(ergebnis, 0) : "–"} tone={ergebnis == null ? undefined : ergebnis >= 0 ? "teal" : "red"} sub={habenKosten ? `DB1 − Gesamtkosten ${eur(gemeinkosten, 0)}` : "Gesamtkosten fehlen"} className="reveal-4" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card title={`Controlling-Kosten ${jahr}`} className="reveal" actions={<Link href={`/controlling/kosten?jahr=${jahr}`} className="btn btn-secondary btn-sm">Kosten monatlich erfassen</Link>}>
          <form action={kostenSpeichern} className="space-y-4">
            <input type="hidden" name="jahr" value={jahr} />
            <Field label="Gilt für" help="Standard gilt für alle Kostenstellen ohne eigene Werte. Eine Kostenstelle mit eigenen Kosten (z. B. Heindl mit anderen Fixkosten) bekommt ihren eigenen Satz."><select name="kostenstelleId" defaultValue={ks} className="select"><option value="">Standard – alle Kostenstellen</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
            <Field label="Gesamtkosten (Gemeinkosten) € / Jahr" help={kostenAusPositionen ? `Aus der monatlichen Kostenerfassung ${jahr}: ${eur(kostenAusPositionen, 0)}. Du kannst den Wert hier überschreiben – die Erfassung bleibt die nachvollziehbare Grundlage.` : "Verwaltung, Miete, Software, Disposition, Fahrzeuge … – alles, was nicht direkt im Bruttolohn und den Abgaben steckt. Sauberer: unter „Kosten monatlich erfassen“ Position für Position eintragen."}><input name="gesamtkosten" defaultValue={exakt?.gesamtkosten ?? standard?.gesamtkosten ?? c.kosten?.gesamtkosten ?? (kostenAusPositionen || "")} className="input num" inputMode="decimal" /></Field>
            <Field label="Kosten je Mitarbeiter € / Monat (optional)" help={kostenAusPositionen ? `Wird nicht gebraucht: Für ${jahr} sind ${eur(kostenAusPositionen, 0)} an Kosten erfasst, und die werden Monat für Monat auf die tatsächlich eingesetzten Mitarbeiter aufgeteilt und gegen den DB1 gerechnet. Ein Wert hier greift nur in Monaten ganz ohne erfasste Kosten.` : "Rückfallebene, solange unter „Kosten monatlich erfassen“ nichts eingetragen ist: fixe Umlage je aktivem Mitarbeiter und Abrechnungsmonat."}><input name="kostenProMitarbeiterMonat" defaultValue={exakt?.kostenProMitarbeiterMonat ?? standard?.kostenProMitarbeiterMonat ?? c.kosten?.kostenProMitarbeiterMonat ?? ""} className="input num" inputMode="decimal" /></Field>
            <Field label="Kosten je Direktvermittlung € (optional)" help="Einmalige Umlage je Vermittlung; leer = wie Überlassung."><input name="kostenProVermittlung" defaultValue={exakt?.kostenProVermittlung ?? standard?.kostenProVermittlung ?? ""} className="input num" inputMode="decimal" /></Field>
            <Field label="Notiz"><input name="notiz" defaultValue={exakt?.notiz ?? ""} className="input" placeholder="z. B. Basis: BWA 2025" /></Field>
            <button className="btn btn-primary">Kosten für {jahr} speichern</button>
            {c.gesamt.anzahlMitarbeiter > 0 && c.kosten && <p className="help">Zur Orientierung: Gesamtkosten ÷ (Mitarbeiter in Abrechnung × 12) = {eur(c.kosten.gesamtkosten / (c.gesamt.anzahlMitarbeiter * 12), 0)} je Mitarbeiter und Monat.</p>}
          </form>
          {c.praemien.summe > 0 && (
            <div className="mt-4 pt-4 border-t border-line text-[13px]">
              <div className="flex justify-between font-semibold"><span>Empfehlungsprämien {jahr}</span><span className="num text-red">− {eur(c.praemien.summe, 0)}</span></div>
              <p className="help mt-1">{c.praemien.anzahl} ausbezahlte Prämie{c.praemien.anzahl === 1 ? "" : "n"} aus „Freunde werben Freunde“. Die Zentrale trägt sie; sie sind im DB1 oben bereits abgezogen (DB1 vor Prämien: {eur(c.gesamt.db1Brutto, 0)}).</p>
            </div>
          )}
        </Card>
        <Card title="Kostenstellen: DB2 und Provision" pad={false} className="lg:col-span-2 reveal reveal-2">
          <table className="table">
            <thead><tr><th>Kostenstelle</th><th className="r">Umsatz</th><th className="r">DB1</th><th className="r">Umlage / MA</th><th className="r">Kostenumlage</th><th className="r">DB2</th><th className="r">Provision</th><th className="r">MA</th></tr></thead>
            <tbody>{kstRows.map(({ k, c: kc }) => (
              <tr key={k.id}>
                <td className="font-semibold">{k.name} {k.isZentrale ? <Badge tone="fox">Zentrale</Badge> : <span className="text-[11px] text-muted font-normal">{k.provisionUeberlassung} % Überl. · {k.provisionVermittlung} % Verm.</span>}</td>
                <td className="r num">{eur(kc.gesamt.umsatz, 0)}</td>
                <td className={`r num ${kc.gesamt.db1 < 0 ? "text-red" : ""}`}>{eur(kc.gesamt.db1, 0)}</td>
                <td className="r num text-muted">{kc.kosten ? <Link href={`/controlling?tab=kosten&jahr=${jahr}&ks=${k.id}`} className="hover:text-brand">{eur(kc.kosten.kostenProMitarbeiterMonat, 0)}{kc.kosten.kostenstelleId === k.id && <span className="text-[10px] ml-1">eigen</span>}</Link> : "–"}</td>
                <td className="r num text-muted">{kc.kosten ? eur(kc.gesamt.kostenUmlage, 0) : "–"}</td>
                <td className={`r num font-semibold ${kc.gesamt.db2 < 0 ? "text-red" : "text-teal"}`}>{kc.kosten ? eur(kc.gesamt.db2, 0) : "–"}</td>
                <td className="r num font-semibold">{k.isZentrale || !kc.kosten ? <span className="text-muted">–</span> : eur(kc.gesamt.provision, 0)}</td>
                <td className="r num">{kc.gesamt.anzahlMitarbeiter}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={`Mitarbeiter: DB1 → DB2 (${jahr})`} pad={false} className="reveal">
          {c.mitarbeiter.length ? (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Mitarbeiter</th><th>Kunde</th><th className="r">DB1</th><th className="r">Umlage</th><th className="r">DB2</th><th className="r">Provision KSt</th></tr></thead>
              <tbody>{[...c.mitarbeiter].sort((a, b) => b.db2Jahr - a.db2Jahr).map((m) => (
                <tr key={m.personId + m.kundeId}>
                  <td><Link href={`/personen/${m.personId}`} className="row-link">{m.name}</Link>{m.art === "DIREKTVERMITTLUNG" && <span className="badge badge-fox ml-1">Vermittlung</span>}</td>
                  <td className="text-muted">{m.kunde}</td>
                  <td className={`r num ${m.db1Jahr < 0 ? "text-red" : ""}`}>{eur(m.db1Jahr, 0)}</td>
                  <td className="r num text-muted">{c.kosten ? eur(m.kostenJahr, 0) : "–"}</td>
                  <td className={`r num font-semibold ${m.db2Jahr < 0 ? "text-red" : "text-teal"}`}>{c.kosten ? eur(m.db2Jahr, 0) : "–"}</td>
                  <td className="r num">{c.kosten && kostenstellen.find((k) => k.id === m.kostenstelleId && !k.isZentrale) ? eur(m.provisionJahr, 0) : <span className="text-muted">–</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title={`Noch keine Monatswerte in ${jahr}`} />}
        </Card>
        <Card title="Hinterlegte Kosten" pad={false} className="reveal reveal-2">
          {alleKosten.length ? (
            <table className="table">
              <thead><tr><th>Jahr</th><th>Gilt für</th><th className="r">Gesamtkosten</th><th className="r">je MA / Monat</th><th className="r">je Vermittlung</th><th>Notiz</th></tr></thead>
              <tbody>{alleKosten.map((k) => <tr key={k.id}><td><Link href={`/controlling?tab=kosten&jahr=${k.jahr}&ks=${k.kostenstelleId}`} className="row-link">{k.jahr}</Link></td><td>{ksName(k.kostenstelleId)}</td><td className="r num">{eur(k.gesamtkosten, 0)}</td><td className="r num">{eur(k.kostenProMitarbeiterMonat, 0)}</td><td className="r num">{k.kostenProVermittlung != null ? eur(k.kostenProVermittlung, 0) : "–"}</td><td className="text-muted">{k.notiz ?? "–"}</td></tr>)}</tbody>
            </table>
          ) : <Empty title="Noch keine Kosten hinterlegt" text="Trage links Gesamtkosten und Kosten je Mitarbeiter ein." />}
        </Card>
      </div>
    </>
  );
}

async function PlanTab({ jahr, ks, kostenstellen, jahrForm }: { jahr: number; ks: string; kostenstellen: Kst[]; jahrForm: JahrForm }) {
  const c = await controlling(jahr, ks || undefined);
  const f = await forecast(jahr, c, ks || undefined);
  const plaene = await db.planwert.findMany({ where: { jahr } });
  const rows = await Promise.all([{ id: "", name: "Gesamt", isZentrale: true }, ...kostenstellen].map(async (k) => { const kc = k.id ? await controlling(jahr, k.id) : c; const kf = await forecast(jahr, kc, k.id || undefined); return { k, kf, kc }; }));
  const balken = (ist: number, fc: number, ziel: number | null | undefined) => { const max = Math.max(ist, fc, ziel ?? 0, 1); return (
    <div className="relative h-3 bg-surface-2 rounded-sm overflow-hidden mt-1">
      <div className="absolute inset-y-0 left-0 bg-brand/25" style={{ width: `${(fc / max) * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${(ist / max) * 100}%` }} />
      {ziel ? <div className="absolute inset-y-0 w-0.5 bg-fox" style={{ left: `${(ziel / max) * 100}%` }} /> : null}
    </div>); };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">{jahrForm(<select name="ks" defaultValue={ks} className="select !w-auto !py-1.5"><option value="">Gesamt</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>)}</div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Kpi label={`Umsatz Ist (bis ${f.abgerechnetBisMonat ? MONATE[f.abgerechnetBisMonat - 1] : "–"})`} value={eur(f.istUmsatz, 0)} sub={f.plan ? `Plan ${eur(f.plan.zielUmsatz, 0)}` : "kein Plan hinterlegt"} />
        <Kpi label="Umsatz Forecast (Jahr)" value={eur(f.forecastUmsatz, 0)} tone={f.zielerreichungUmsatz == null ? undefined : f.zielerreichungUmsatz >= 1 ? "teal" : "amber"} sub={f.zielerreichungUmsatz != null ? `${pct(f.zielerreichungUmsatz)} vom Plan · ${f.laufendeEinsaetze} laufende Einsätze × ${f.offeneMonate} Monate` : `${f.laufendeEinsaetze} laufende Einsätze × ${f.offeneMonate} offene Monate`} className="reveal-2" />
        <Kpi label="DB1 Ist" value={eur(f.istDb1, 0)} tone={f.istDb1 >= 0 ? "teal" : "red"} sub={f.plan ? `Plan ${eur(f.plan.zielDb1, 0)}` : "kein Plan hinterlegt"} className="reveal-3" />
        <Kpi label="DB1 Forecast (Jahr)" value={eur(f.forecastDb1, 0)} tone={f.zielerreichungDb1 == null ? undefined : f.zielerreichungDb1 >= 1 ? "teal" : "amber"} sub={f.zielerreichungDb1 != null ? `${pct(f.zielerreichungDb1)} vom Plan` : `+ ${eur(f.db1JeMonatOffen, 0)} je offenem Monat`} className="reveal-4" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={`Planwerte ${jahr}`} className="reveal">
          <form action={planSpeichern} className="space-y-4">
            <input type="hidden" name="jahr" value={jahr} />
            <Field label="Gilt für"><select name="kostenstelleId" defaultValue={ks} className="select"><option value="">Gesamt</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
            <Field label="Zielumsatz € / Jahr"><input name="zielUmsatz" defaultValue={f.plan?.zielUmsatz ?? ""} className="input num" inputMode="decimal" /></Field>
            <Field label="Ziel-DB1 € / Jahr"><input name="zielDb1" defaultValue={f.plan?.zielDb1 ?? ""} className="input num" inputMode="decimal" /></Field>
            <Field label="Ziel aktive Mitarbeiter (Jahresende)"><input name="zielMitarbeiter" defaultValue={f.plan?.zielMitarbeiter ?? ""} className="input num" inputMode="numeric" /></Field>
            <Field label="Notiz"><input name="notiz" defaultValue={plaene.find((p) => p.kostenstelleId === ks)?.notiz ?? ""} className="input" /></Field>
            <button className="btn btn-primary">Plan speichern</button>
            <p className="help">Forecast = Ist bis zum letzten abgerechneten Monat + laufende Einsätze (Wochenstunden × Auslastung × 4,33 × Verrechnungssatz, DB1 aus der Kalkulation) für die restlichen Monate.</p>
          </form>
        </Card>
        <Card title="Plan / Ist / Forecast je Kostenstelle" pad={false} className="lg:col-span-2 reveal reveal-2">
          <table className="table">
            <thead><tr><th>Kostenstelle</th><th>Umsatz: Ist · Forecast · Plan</th><th>DB1: Ist · Forecast · Plan</th><th className="r">MA Ist / Ziel</th></tr></thead>
            <tbody>{rows.map(({ k, kf, kc }) => (
              <tr key={k.id || "gesamt"}>
                <td className="font-semibold">{k.name}</td>
                <td className="min-w-[220px]"><div className="num text-[12.5px]">{eur(kf.istUmsatz, 0)} · <span className="text-brand">{eur(kf.forecastUmsatz, 0)}</span> · <span className="text-fox">{kf.plan ? eur(kf.plan.zielUmsatz, 0) : "–"}</span></div>{balken(kf.istUmsatz, kf.forecastUmsatz, kf.plan?.zielUmsatz)}</td>
                <td className="min-w-[220px]"><div className="num text-[12.5px]">{eur(kf.istDb1, 0)} · <span className="text-brand">{eur(kf.forecastDb1, 0)}</span> · <span className="text-fox">{kf.plan ? eur(kf.plan.zielDb1, 0) : "–"}</span></div>{balken(kf.istDb1, kf.forecastDb1, kf.plan?.zielDb1)}</td>
                <td className="r num">{kc.gesamt.anzahlMitarbeiter} / {kf.plan?.zielMitarbeiter || "–"}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="help px-5 py-3">Balken: dunkel = Ist, hell = Forecast, roter Strich = Plan.</p>
        </Card>
      </div>
    </>
  );
}

async function LiquiTab({ ks, kostenstellen }: { ks: string; kostenstellen: Kst[] }) {
  const l = await liquiditaet(ks || undefined);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <form className="flex items-center gap-2"><input type="hidden" name="tab" value="liquiditaet" /><select name="ks" defaultValue={ks} className="select !w-auto !py-1.5"><option value="">Gesamt</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select><button className="btn btn-secondary btn-sm">Anzeigen</button></form>
        <form action={kontostandSpeichern} className="flex items-center gap-2"><span className="text-[13px] text-muted">Kontostand heute €</span><input name="betrag" defaultValue={l.kontostand || ""} className="input !w-36 num" inputMode="decimal" /><button className="btn btn-secondary btn-sm">Speichern</button></form>
      </div>
      {l.hinweise.map((h, i) => <div key={i} className="alert alert-amber mb-3"><span>{h}</span></div>)}
      {l.minimum && l.minimum.betrag < 0 && <div className="alert alert-red mb-4"><span><strong>Engpass:</strong> In der Woche ab {datum(l.minimum.woche)} sinkt der Kontostand auf {eur(l.minimum.betrag, 0)} – Rechnungen früher stellen, Mahnlauf, Factoring oder Kontokorrent prüfen.</span></div>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Kpi label="Kontostand" value={eur(l.kontostand, 0)} sub={l.kontostandDatum ? `Stand ${datum(l.kontostandDatum)}` : "nicht hinterlegt"} />
        <Kpi label="Eingänge 8 Wochen" value={eur(l.wochen.reduce((s, w) => s + w.eingaenge, 0), 0)} tone="teal" sub="offene + erwartete Rechnungen" className="reveal-2" />
        <Kpi label="Ausgänge 8 Wochen" value={eur(l.wochen.reduce((s, w) => s + w.loehne + w.abgaben + w.fixkosten + w.provisionen, 0), 0)} tone="red" sub="Löhne, Abgaben, Gemeinkosten, Provisionen" className="reveal-3" />
        <Kpi label="Tiefster Stand" value={l.minimum ? eur(l.minimum.betrag, 0) : "–"} tone={l.minimum && l.minimum.betrag < 0 ? "red" : "teal"} sub={l.minimum ? `Woche ab ${datum(l.minimum.woche)}` : ""} className="reveal-4" />
      </div>
      <Card title="Wochenvorschau" pad={false} className="reveal">
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Woche</th><th className="r">Eingänge</th><th className="r">Nettolöhne</th><th className="r">Abgaben</th><th className="r">Gemeinkosten</th><th className="r">Provisionen</th><th className="r">Saldo</th><th className="r">Kontostand</th><th>Positionen</th></tr></thead>
          <tbody>{l.wochen.map((w) => (
            <tr key={w.von.toISOString()}>
              <td className="font-semibold whitespace-nowrap">{datum(w.von)} – {datum(w.bis)}</td>
              <td className="r num text-teal">{w.eingaenge ? eur(w.eingaenge, 0) : "·"}</td>
              <td className="r num">{w.loehne ? eur(w.loehne, 0) : "·"}</td>
              <td className="r num">{w.abgaben ? eur(w.abgaben, 0) : "·"}</td>
              <td className="r num">{w.fixkosten ? eur(w.fixkosten, 0) : "·"}</td>
              <td className="r num">{w.provisionen ? eur(w.provisionen, 0) : "·"}</td>
              <td className={`r num font-semibold ${w.saldo < 0 ? "text-red" : "text-teal"}`}>{eur(w.saldo, 0)}</td>
              <td className={`r num font-bold ${w.kumuliert < 0 ? "text-red" : ""}`}>{eur(w.kumuliert, 0)}</td>
              <td className="text-[11.5px] text-muted">{w.positionen.length ? <details><summary className="cursor-pointer">{w.positionen.length} Positionen</summary><ul className="mt-1 space-y-0.5 min-w-[260px]">{w.positionen.map((p, i) => <li key={i}>{p}</li>)}</ul></details> : "·"}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="help px-5 py-3">Annahmen: überfällige Rechnungen gehen 14 Tage nach heute ein; laufende Abrechnung wird zum Monatsende + Zahlungsziel + 5 Tage fakturiert; Nettolöhne ≈ 72 % vom Brutto zum 15., Lohnabgaben (DG + DN) zum 15. des Folgemonats; Gemeinkosten ÷ 12 zum Monatsersten; freigegebene Provisionen zum Monatsende.</p>
      </Card>
    </>
  );
}

async function ProvisionenTab({ jahr, monat, kostenstellen }: { jahr: number; monat: number; kostenstellen: Kst[] }) {
  const belege = await db.provisionsabrechnung.findMany({ where: { jahr }, include: { kostenstelle: { select: { name: true } } }, orderBy: [{ monat: "desc" }, { kostenstelle: { name: "asc" } }] });
  const unter = kostenstellen.filter((k) => !k.isZentrale);
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Beleg erzeugen" className="reveal">
          <form action={provisionErzeugen} className="space-y-4">
            <Field label="Kostenstelle"><select name="kostenstelleId" className="select">{unter.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monat"><select name="monat" defaultValue={monat} className="select">{MONATE_LANG.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
              <Field label="Jahr"><select name="jahr" defaultValue={jahr} className="select">{[jahr - 1, jahr, jahr + 1].map((j) => <option key={j} value={j}>{j}</option>)}</select></Field>
            </div>
            <button className="btn btn-primary">Beleg berechnen (Entwurf)</button>
            <p className="help">Der Beleg friert die Provision des Monats ein (Prozentsatz × DB2). Danach freigeben – erst dann sieht die Kostenstelle den Beleg. Nachträgliche Korrekturen landen im Folgemonat.</p>
          </form>
        </Card>
        <Card title={`Provisionsbelege ${jahr}`} pad={false} className="lg:col-span-2 reveal reveal-2">
          {belege.length ? (
            <table className="table">
              <thead><tr><th>Monat</th><th>Kostenstelle</th><th className="r">Verrechnung</th><th className="r">Basis DB2</th><th className="r">Provision</th><th>Status</th><th></th></tr></thead>
              <tbody>{belege.map((b) => (
                <tr key={b.id}>
                  <td className="font-semibold">{MONATE[b.monat - 1]} {b.jahr}</td>
                  <td>{b.kostenstelle.name}</td>
                  <td className="r num">{eur(b.verrechnung, 0)}</td>
                  <td className="r num text-muted">{eur(b.db2, 0)}</td>
                  <td className="r num font-bold">{eur(b.betrag)}</td>
                  <td>{b.status === "ENTWURF" ? <Badge tone="grey">Entwurf</Badge> : b.status === "FREIGEGEBEN" ? <Badge tone="teal">freigegeben {datum(b.freigegebenAm)}</Badge> : <Badge tone="brand">ausbezahlt {datum(b.ausbezahltAm)}</Badge>}</td>
                  <td className="r whitespace-nowrap">
                    <a href={`/controlling/provision/${b.id}/pdf`} className="btn btn-ghost btn-sm">PDF</a>
                    {b.status === "ENTWURF" && <form action={provisionStatus.bind(null, b.id, "FREIGEGEBEN")} className="inline"><button className="btn btn-primary btn-sm ml-1">Freigeben</button></form>}
                    {b.status === "FREIGEGEBEN" && <><form action={provisionStatus.bind(null, b.id, "AUSBEZAHLT")} className="inline"><button className="btn btn-secondary btn-sm ml-1">Ausbezahlt</button></form><form action={provisionStatus.bind(null, b.id, "ENTWURF")} className="inline"><button className="btn btn-ghost btn-sm ml-1">Zurück</button></form></>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : <Empty title={`Noch keine Provisionsbelege in ${jahr}`} text="Links Kostenstelle und Monat wählen und den Beleg berechnen." />}
        </Card>
      </div>
    </>
  );
}

async function AuegTab({ jahr, stichtag, kostenstellen }: { jahr: number; stichtag?: string; kostenstellen: Kst[] }) {
  const st = stichtag ? new Date(stichtag) : new Date(jahr, 6, 31);
  const a = await auegStatistik(st);
  const csv = `/controlling/aueg-statistik.csv?stichtag=${st.toISOString().slice(0, 10)}`;
  void kostenstellen;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <form className="flex items-center gap-2"><input type="hidden" name="tab" value="aueg" /><span className="text-[13px] text-muted">Stichtag</span><input type="date" name="stichtag" defaultValue={st.toISOString().slice(0, 10)} className="input !w-auto !py-1.5" /><button className="btn btn-secondary btn-sm">Berechnen</button></form>
        <a href={csv} className="btn btn-primary">CSV für die Meldung herunterladen</a>
      </div>
      <div className="alert alert-amber mb-4"><span><strong>§ 13 Abs. 2 AÜG:</strong> Überlasser melden jährlich zum Stichtag 31. Juli die Überlassungsstatistik an die Gewerbebehörde (Formular der Landesgeschäftsstelle). Die Zahlen unten sind aus Einsätzen und Personalstamm berechnet – Hinweise beachten.</span></div>
      {a.hinweise.map((h, i) => <div key={i} className="alert alert-red mb-3"><span>{h}</span></div>)}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Kpi label="Beschäftigte im Dienstverhältnis" value={a.beschaeftigteGesamt} sub={`Stichtag ${datum(a.stichtag)}`} />
        <Kpi label="Überlassene Arbeitskräfte" value={a.ueberlassen} tone="teal" sub={`${a.nachGeschlecht.M ?? 0} m · ${a.nachGeschlecht.W ?? 0} w · ${a.nachGeschlecht.D ?? 0} d`} className="reveal-2" />
        <Kpi label="Beschäftigerbetriebe" value={a.beschaeftigerbetriebe} sub={`${a.grenzueberschreitend} grenzüberschreitend`} className="reveal-3" />
        <Kpi label="Arbeiter / Angestellte" value={`${a.nachArt.arbeiter} / ${a.nachArt.angestellte}`} sub={`Ö ${a.nachNationalitaet.oesterreich} · EU/EWR ${a.nachNationalitaet.euEwr} · Drittstaat ${a.nachNationalitaet.drittstaat}`} className="reveal-4" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Nach Bundesland des Beschäftigers" pad={false} className="reveal"><table className="table"><tbody>{Object.entries(a.nachBundesland).sort((x, y) => y[1] - x[1]).map(([bl, n]) => <tr key={bl}><td>{bl}</td><td className="r num font-semibold">{n}</td></tr>)}{!Object.keys(a.nachBundesland).length && <tr><td className="text-muted">–</td></tr>}</tbody></table></Card>
        <Card title="Dauer der laufenden Überlassungen" pad={false} className="reveal reveal-2"><table className="table"><tbody><tr><td>bis 3 Monate</td><td className="r num font-semibold">{a.nachDauer.bis3Monate}</td></tr><tr><td>3 bis 12 Monate</td><td className="r num font-semibold">{a.nachDauer.bis12Monate}</td></tr><tr><td>über 12 Monate</td><td className="r num font-semibold">{a.nachDauer.ueber12Monate}</td></tr></tbody></table></Card>
        <Card title="Staatsangehörigkeit" pad={false} className="reveal reveal-3"><table className="table"><tbody><tr><td>Österreich</td><td className="r num font-semibold">{a.nachNationalitaet.oesterreich}</td></tr><tr><td>EU / EWR / Schweiz</td><td className="r num font-semibold">{a.nachNationalitaet.euEwr}</td></tr><tr><td>Drittstaaten</td><td className="r num font-semibold">{a.nachNationalitaet.drittstaat}</td></tr><tr><td className="text-muted">unbekannt</td><td className="r num">{a.nachNationalitaet.unbekannt}</td></tr></tbody></table></Card>
      </div>
      <Card title="Einzelaufstellung (interne Prüfliste)" pad={false} className="reveal">
        {a.zeilen.length ? (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Mitarbeiter</th><th>Geschl.</th><th>Art</th><th>Staatsang.</th><th>Beschäftiger</th><th>Bundesland</th><th>seit</th><th className="r">Monate</th><th>Kostenstelle</th></tr></thead>
            <tbody>{a.zeilen.map((z, i) => <tr key={i}><td className="font-semibold">{z.name}</td><td>{z.geschlecht === "unbekannt" ? <span className="text-red">fehlt</span> : z.geschlecht}</td><td>{z.art}</td><td>{z.nationalitaet}</td><td>{z.kunde}</td><td>{z.bundesland}</td><td>{datum(z.seit)}</td><td className="r num">{z.dauerMonate}</td><td className="text-muted">{z.kostenstelle}</td></tr>)}</tbody></table></div>
        ) : <Empty title="Am Stichtag keine laufende Überlassung" />}
      </Card>
    </>
  );
}


/** Rückstellungskonto Urlaubszuschuss/Weihnachtsremuneration: je verrechnetem Monat anteilig zugeführt, bei Auszahlung aufgelöst – außerhalb des DB. */
async function RueckstellungenTab({ jahr, jahrForm }: { jahr: number; jahrForm: JahrForm }) {
  const c = await controlling(jahr);
  const rows = c.mitarbeiter.filter((m) => m.rueckstellung.zufuehrung || m.rueckstellung.aufloesung);
  const sum = rows.reduce((a, m) => ({ z: a.z + m.rueckstellung.zufuehrung, af: a.af + m.rueckstellung.aufloesung, st: a.st + m.rueckstellung.stand }), { z: 0, af: 0, st: 0 });
  const mon = Array.from({ length: 12 }, (_, i) => rows.reduce((a, m) => a + m.rueckstellung.monate[i], 0));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 reveal">{jahrForm()}<span className="text-[12.5px] text-muted">Satz: {Math.round((c.saetze.rueckstellungUrlaubsgeld + c.saetze.rueckstellungWeihnachtsgeld) * 10000) / 100} % vom Bruttolohn zzgl. DG-Abgaben (Einstellungen → Abgabensätze)</span></div>
      <div className="grid sm:grid-cols-3 gap-3 reveal">
        <div className="kpi"><div className="label">Zuführung {jahr}</div><div className="value">{eur(sum.z, 0)}</div><div className="sub">anteilig je verrechnetem Monat</div></div>
        <div className="kpi"><div className="label">Auflösung {jahr}</div><div className="value">{eur(sum.af, 0)}</div><div className="sub">ausbezahlte UZ/WR lt. Lohnprogramm</div></div>
        <div className="kpi"><div className="label">Offene Rückstellung</div><div className={`value ${sum.st < 0 ? "text-red" : "text-teal"}`}>{eur(sum.st, 0)}</div><div className="sub">Stand Jahresende / heute</div></div>
      </div>
      <Card title="Rückstellungsverlauf (kumuliert)" pad={false} className="reveal reveal-2">
        <table className="table"><thead><tr>{MONATE.map((m) => <th key={m} className="r">{m}</th>)}</tr></thead><tbody><tr>{mon.map((v, i) => <td key={i} className={`r num ${v < 0 ? "text-red" : ""}`}>{eur(v, 0)}</td>)}</tr></tbody></table>
      </Card>
      <Card title="Je Mitarbeiter" pad={false} className="reveal reveal-3">
        {rows.length ? <table className="table"><thead><tr><th>Mitarbeiter</th><th>Kunde</th><th className="r">Zuführung</th><th className="r">Auflösung</th><th className="r">Stand</th></tr></thead>
          <tbody>{rows.map((m) => <tr key={m.personId + m.kundeId}><td><Link href={`/personen/${m.personId}`} className="row-link">{m.name}</Link></td><td>{m.kunde}</td><td className="r num">{eur(m.rueckstellung.zufuehrung)}</td><td className="r num">{eur(m.rueckstellung.aufloesung)}</td><td className={`r num font-semibold ${m.rueckstellung.stand < 0 ? "text-red" : ""}`}>{eur(m.rueckstellung.stand)}</td></tr>)}</tbody></table>
        : <Empty title="Keine Rückstellungen" text="Sobald Bruttolöhne in der Monatsabrechnung erfasst sind, wird je Monat anteilig zurückgestellt." />}
      </Card>
      <p className="help">Die Rückstellung fließt nicht in DB1/DB2 ein. Ausbezahlte Sonderzahlungen werden in der Monatsabrechnung in der Spalte „davon Sonderzahlung UZ/WR“ erfasst und lösen die Rückstellung auf; ein negativer Stand bedeutet, dass mehr ausbezahlt als zurückgestellt wurde.</p>
    </div>
  );
}


/** Fehlzeitenquote und Krankenstandskosten je Kunde – Krankenstand kostet doppelt: Entgeltfortzahlung und entgangener Umsatz. */
async function FehlzeitenTab({ jahr, ks, kostenstellen, jahrForm }: { jahr: number; ks: string; kostenstellen: Kst[]; jahrForm: JahrForm }) {
  const rows = await fehlzeitenJeKunde(jahr, ks || null);
  const summe = rows.reduce((a, r) => ({ soll: a.soll + r.sollTage, krank: a.krank + r.krankTage, urlaub: a.urlaub + r.urlaubTage, kosten: a.kosten + r.kostenKrankenstand, umsatz: a.umsatz + r.entgangenerUmsatz }), { soll: 0, krank: 0, urlaub: 0, kosten: 0, umsatz: 0 });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 reveal">
        <Kpi label="Krankenstandsquote" value={summe.soll ? pct(summe.krank / summe.soll) : "–"} sub={`${summe.krank} von ${summe.soll} geplanten Arbeitstagen`} />
        <Kpi label="Krankenstandstage" value={summe.krank.toLocaleString("de-AT")} sub="aus dem Tagesraster der Einsatzplanung" />
        <Kpi label="Entgeltfortzahlung" value={eur(summe.kosten)} sub="Lohn inkl. Abgaben ohne Gegenwert" />
        <Kpi label="Entgangener Umsatz" value={eur(summe.umsatz)} sub="nicht verrechenbare Stunden" />
      </div>
      <Card title="Je Kunde" pad={false} className="reveal reveal-2" actions={jahrForm(<select name="ks" defaultValue={ks} className="select !w-auto !py-1.5"><option value="">Alle Kostenstellen</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>)}>
        {rows.length ? (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Kunde</th><th className="r">Mitarbeiter</th><th className="r">Solltage</th><th className="r">Krank</th><th className="r">Urlaub</th><th className="r">Quote</th><th className="r">Entgeltfortzahlung</th><th className="r">Entgangener Umsatz</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.kundeId}>
                <td><Link href={`/kunden/${r.kundeId}`} className="row-link">{r.kunde}</Link></td>
                <td className="r num">{r.mitarbeiter}</td>
                <td className="r num">{r.sollTage}</td>
                <td className="r num">{r.krankTage}</td>
                <td className="r num">{r.urlaubTage}</td>
                <td className="r num"><span className={r.quote > 0.07 ? "text-red font-semibold" : r.quote > 0.04 ? "text-amber" : ""}>{pct(r.quote)}</span></td>
                <td className="r num">{eur(r.kostenKrankenstand)}</td>
                <td className="r num">{eur(r.entgangenerUmsatz)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="Noch keine Daten" text="Sobald in der Einsatzplanung Tage mit K (Krankenstand) erfasst sind, erscheint hier die Auswertung je Kunde." />}
        <div className="px-5 py-3 text-[12.5px] text-muted border-t border-line">Richtwert Österreich: rund 4–5 % Krankenstandsquote. Über 7 % lohnt ein Gespräch mit dem Beschäftiger über Arbeitsbedingungen, Schichtmodell und Einschulung – laut AGB Punkt 5.6 werden Fehlzeiten aus Arbeitsunfällen in der Sphäre des Beschäftigers wie geleistete Arbeitszeit verrechnet.</div>
      </Card>
    </div>
  );
}

/** Recruiting-Trichter, Time-to-Fill, Wiedereinsatzquote und Bewerbungsquellen. */
async function RecruitingTab({ ks, kostenstellen }: { ks: string; kostenstellen: Kst[] }) {
  const k = await recruitingKennzahlen(ks || null);
  const STUFEN: Record<string, string> = { NEU: "Neu eingegangen", KONTAKTIERT: "Kontaktiert", GESPRAECH: "Gespräch", GEPRUEFT: "Geprüft", VORGESTELLT: "Vorgestellt", EINGESTELLT: "Eingestellt", ABGESAGT: "Abgesagt" };
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 reveal">
        <Kpi label="Time-to-Fill (Median)" value={k.timeToFillTage == null ? "–" : `${k.timeToFillTage} Tage`} sub={`aus ${k.timeToFillAnzahl} Einsätzen mit Anfragedatum`} />
        <Kpi label="Wiedereinsatzquote" value={pct(k.wiedereinsatzQuote)} sub={`${k.wiedereinsatzAnzahl} von ${k.mitarbeiterGesamt} Mitarbeitern mehrfach im Einsatz`} />
        <Kpi label="Im Talent-Pool" value={k.talentpool.toLocaleString("de-AT")} sub="Absagen, die später wieder angesprochen werden" />
        <Kpi label="Bewerber gesamt" value={k.stufen.reduce((a, x) => a + x.anzahl, 0).toLocaleString("de-AT")} sub="alle Personen im Bestand" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Trichter" pad={false} className="reveal reveal-2">
          <table className="table"><thead><tr><th>Stufe</th><th className="r">Anzahl</th></tr></thead>
            <tbody>{Object.keys(STUFEN).map((code) => { const x = k.stufen.find((y) => y.stufe === code); return <tr key={code}><td>{STUFEN[code]}</td><td className="r num">{x?.anzahl ?? 0}</td></tr>; })}</tbody>
          </table>
        </Card>
        <Card title="Absagegründe" pad={false} className="reveal reveal-2">
          {k.absagegruende.length ? <table className="table"><thead><tr><th>Grund</th><th className="r">Anzahl</th></tr></thead><tbody>{k.absagegruende.map((a) => <tr key={a.grund}><td>{a.grund}</td><td className="r num">{a.anzahl}</td></tr>)}</tbody></table> : <Empty title="Keine Absagen erfasst" text="Der Absagegrund wird im Bewerberprofil hinterlegt." />}
        </Card>
      </div>
      <Card title="Bewerbungsquellen" pad={false} className="reveal reveal-3" actions={<form className="flex items-center gap-2"><input type="hidden" name="tab" value="recruiting" /><select name="ks" defaultValue={ks} className="select !w-auto !py-1.5"><option value="">Alle Kostenstellen</option>{kostenstellen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="btn btn-secondary btn-sm">Anzeigen</button></form>}>
        <table className="table"><thead><tr><th>Quelle</th><th className="r">Bewerber</th><th className="r">davon eingestellt</th><th className="r">Trefferquote</th></tr></thead>
          <tbody>{k.quellen.map((q) => <tr key={q.quelle}><td>{q.quelle}</td><td className="r num">{q.bewerber}</td><td className="r num">{q.eingestellt}</td><td className="r num">{pct(q.quote)}</td></tr>)}</tbody>
        </table>
        <div className="px-5 py-3 text-[12.5px] text-muted border-t border-line">Die Trefferquote zeigt, welcher Kanal wirklich Mitarbeiter bringt – nicht nur Bewerbungen. Kanäle unter 10 % lohnen selten das Budget.</div>
      </Card>
    </div>
  );
}
