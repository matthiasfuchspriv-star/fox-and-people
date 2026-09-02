import Link from "next/link";
import { requireSession, istAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { aktuelleSaetze, firma as ladeFirma, einstellung } from "@/lib/einstellungen";
import { DZ_BUNDESLAND, abgeleiteteSaetze, type AbgabenSaetze } from "@/engine/kalkulation";
import { datum, isoDate, pct } from "@/lib/format";
import { AGB_VERSION, AGB_STAND } from "@/lib/agb";
import { PageHeader, Card, Field, Badge } from "@/components/ui";
import { zulageSpeichern, zulageLoeschen, zulagenStandardAnlegen, fristenSpeichern, nummernkreisSpeichern } from "./actions";
import { zulageText } from "@/lib/zulagen";
import { FRISTEN_DEFAULT, fristText, terminText, type Fristentabelle, type Fristenstufe } from "@/lib/fristen";
import { bestandLeeren } from "./actions";
import { BEREICHE, bestandZaehlen } from "@/lib/loeschen";
import { keinZuschlagListe, type KeinZuschlagEintrag } from "@/lib/referenz-entscheidung";
import { firmaSpeichern, kostenstelleSpeichern, nutzerSpeichern, saetzeSpeichern, dzSpeichern, kvSpeichern, kvStufeLoeschen, referenzKvAktualisieren, keinZuschlagAufheben, vorlageSpeichern, excelImport, demoDatenLoeschen, testmailSenden, totpAktivieren, totpDeaktivieren, passwortAendern } from "./actions";
import { TotpSetup } from "./totp";
import type { ImportErgebnis } from "@/lib/import-excel";

export const dynamic = "force-dynamic";
const TABS = [["firma", "Firma"], ["kostenstellen", "Kostenstellen"], ["nutzer", "Nutzer"], ["saetze", "Abgabensätze"], ["kv", "KV-Mindestlöhne"], ["vorlagen", "Vertragsvorlagen"], ["zulagen", "Zulagen"], ["fristen", "Fristen"], ["import", "Import & Daten"], ["loeschen", "Daten löschen"], ["audit", "Audit-Log"], ["konto", "Mein Konto"]] as const;
const SATZ_LABELS: [keyof AbgabenSaetze, string][] = [["pensionsversicherung", "Pensionsversicherung DG"], ["krankenversicherung", "Krankenversicherung DG"], ["unfallversicherung", "Unfallversicherung"], ["arbeitslosenversicherung", "Arbeitslosenversicherung DG"], ["iesg", "IESG-Zuschlag"], ["wohnbaufoerderung", "Wohnbauförderungsbeitrag"], ["swf", "Sozial-/Weiterbildungsfonds"], ["mitarbeitervorsorge", "Mitarbeitervorsorge (MVK)"], ["dienstgeberbeitrag", "Dienstgeberbeitrag FLAG (DB)"], ["dz", "Zuschlag zum DB (DZ, Referenz)"], ["kommunalsteuer", "Kommunalsteuer"], ["urlaubszuschussPayroll", "Urlaubszuschuss Payroll"], ["weihnachtsremunerationPayroll", "Weihnachtsremuneration Payroll"], ["invalidenausgleichstaxePayroll", "Invalidenausgleichstaxe Payroll"], ["abwUrlaub", "Abwesenheit: Urlaub"], ["abwFeiertage", "Abwesenheit: Feiertage"], ["abwKrankheit", "Abwesenheit: Krankheit"], ["abwSonstige", "Abwesenheit: Sonstige"], ["abwStehzeiten", "Abwesenheit: Stehzeiten"], ["abwKvFeiertage", "Abwesenheit: KV-Feiertage"], ["urlaubszuschussUeberlassung", "Urlaubszuschuss Überlassung"], ["weihnachtsremunerationUeberlassung", "Weihnachtsremuneration Überlassung"], ["invalidenausgleichstaxeUeberlassung", "Invalidenausgleichstaxe Überlassung"], ["rueckstellungUrlaubsgeld", "Rückstellungssatz Urlaubsgeld"], ["rueckstellungWeihnachtsgeld", "Rückstellungssatz Weihnachtsgeld"]];

export default async function EinstellungenPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; fehler?: string; edit?: string; testmail?: string; geleert?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const admin = istAdmin(s);
  const tab = admin ? sp.tab ?? "firma" : "konto";
  const me = await db.nutzer.findUnique({ where: { id: s.nutzerId } });
  const nummernkreise = admin ? await db.nummernkreis.findMany({ orderBy: [{ typ: "asc" }, { jahr: "desc" }] }) : [];
  const [f, kostenstellen, nutzer, satzSets, dz, kvs, vorlagen, auditLog, letzterImport, saetzeNow] = admin ? await Promise.all([
    ladeFirma(), db.kostenstelle.findMany({ orderBy: [{ isZentrale: "desc" }, { name: "asc" }], include: { _count: { select: { kunden: true, personen: true, nutzer: true } } } }), db.nutzer.findMany({ orderBy: { name: "asc" }, include: { kostenstelle: true } }), db.abgabenSatzSet.findMany({ orderBy: { gultigAb: "desc" } }), db.dzSatz.findMany({ orderBy: [{ bundesland: "asc" }, { gultigAb: "desc" }] }), db.kollektivvertrag.findMany({ include: { lohntabelle: { orderBy: { beschaeftigungsgruppe: "asc" } } } }), db.vertragsvorlage.findMany({ orderBy: { name: "asc" } }), tab === "audit" ? db.auditLog.findMany({ orderBy: { zeitpunkt: "desc" }, take: 200 }) : Promise.resolve([]), einstellung<{ datei: string; zeitpunkt: string; erg: ImportErgebnis } | null>("letzterImport", null), aktuelleSaetze(),
  ]) : [null, [], [], [], [], [], [], [], null, null];
  const keinZuschlag: KeinZuschlagEintrag[] = admin && tab === "kv" ? await keinZuschlagListe() : [];
  const a = saetzeNow ? abgeleiteteSaetze(saetzeNow.saetze) : null;
  const editKs = kostenstellen.find((k) => k.id === sp.edit); const editNutzer = nutzer.find((n) => n.id === sp.edit); const editVorlage = vorlagen.find((v) => v.id === sp.edit);
  const zulagen = admin && tab === "zulagen" ? await db.zulage.findMany({ orderBy: [{ reihenfolge: "asc" }, { name: "asc" }] }) : [];
  const editZulage = zulagen.find((z) => z.id === sp.edit);
  const fristen: Fristentabelle = admin && tab === "fristen" ? { ...FRISTEN_DEFAULT, ...(await einstellung<Partial<Fristentabelle>>("fristen", {})) } : FRISTEN_DEFAULT;
  const bestand = s.rolle === "SYSTEMADMIN" && tab === "loeschen" ? await bestandZaehlen() : null;
  const dzAktuell = Object.keys(DZ_BUNDESLAND).map((bl) => ({ bl, satz: dz.find((d) => d.bundesland === bl)?.satz ?? DZ_BUNDESLAND[bl] }));

  return (
    <>
      <PageHeader title="Einstellungen" sub={admin ? "Firmendaten, Kostenstellen, Nutzer & Rollen, Abgabensätze, KV-Tabellen, Vorlagen, Import und Audit-Log." : "Mein Konto"} />
      <div className="tabs mb-5 overflow-x-auto reveal">{(admin ? TABS : TABS.filter(([k]) => k === "konto")).map(([k, l]) => <Link key={k} href={`/einstellungen?tab=${k}`} className={`tab whitespace-nowrap ${tab === k ? "active" : ""}`}>{l}</Link>)}</div>
      {sp.ok && <div className="alert alert-teal mb-4">Gespeichert.</div>}
      {sp.fehler && <div className="alert alert-red mb-4">{sp.fehler === "2fa" ? "Code ungültig – bitte erneut versuchen." : sp.fehler === "altespasswort" ? "Das bisherige Passwort stimmt nicht." : sp.fehler === "passwort" ? "Passwort muss mindestens 10 Zeichen haben." : sp.fehler === "kostenstelle" ? "Für diese Rolle ist eine Kostenstelle nötig." : "Bitte Pflichtfelder ausfüllen."}</div>}

      {tab === "firma" && f && (<>
        <Card title="Rechtsträger & Marke" className="max-w-4xl reveal">
          <form action={firmaSpeichern} className="grid sm:grid-cols-3 gap-4">
            <Field label="Marke (auf Dokumenten)"><input name="name" defaultValue={f.name} className="input" /></Field>
            <Field label="Rechtsträger" className="sm:col-span-2"><input name="rechtstraeger" defaultValue={f.rechtstraeger} className="input" /></Field>
            <Field label="Straße"><input name="strasse" defaultValue={f.strasse} className="input" /></Field>
            <Field label="PLZ"><input name="plz" defaultValue={f.plz} className="input" /></Field>
            <Field label="Ort"><input name="ort" defaultValue={f.ort} className="input" /></Field>
            <Field label="UID"><input name="uid" defaultValue={f.uid} className="input" /></Field>
            <Field label="Firmenbuch"><input name="firmenbuch" defaultValue={f.firmenbuch} className="input" /></Field>
            <Field label="Telefon"><input name="telefon" defaultValue={f.telefon} className="input" /></Field>
            <Field label="E-Mail"><input name="email" defaultValue={f.email} className="input" /></Field>
            <Field label="IBAN" help="Erscheint auf Rechnungen – bitte eintragen."><input name="iban" defaultValue={f.iban} className="input" /></Field>
            <Field label="BIC"><input name="bic" defaultValue={f.bic} className="input" /></Field>
            <Field label="Bank"><input name="bank" defaultValue={f.bank} className="input" /></Field>
            <Field label="USt %"><input name="ustProzent" defaultValue={f.ustProzent} className="input num" /></Field>
            <Field label="Mitarbeitervorsorgekasse (BMSVG)" className="sm:col-span-2" help="Name und Anschrift – Pflichtangabe im Arbeitsvertrag (Abschnitt X). Ohne Eintrag stünde dort eine Lücke."><input name="mvk" defaultValue={f.mvk} className="input" /></Field>
            <Field label="Name der Mitarbeiter-App" help="So wird die App im Arbeitsvertrag genannt (Abschnitt XI)."><input name="app" defaultValue={f.app} className="input" /></Field>
            <Field label="Zahlungsziel Standard (Tage, 0 = sofort)"><input name="zahlungszielTage" defaultValue={f.zahlungszielTage} className="input num" /></Field>
            <Field label="Angebot gültig (Tage)"><input name="angebotGueltigTage" defaultValue={f.angebotGueltigTage} className="input num" /></Field>
            <Field label="Mahnstufen (Tage nach Fälligkeit)"><div className="flex gap-2"><input name="m1" defaultValue={f.mahnstufenTage[0]} className="input num" /><input name="m2" defaultValue={f.mahnstufenTage[1]} className="input num" /><input name="m3" defaultValue={f.mahnstufenTage[2]} className="input num" /></div></Field>
            <div className="sm:col-span-3"><button className="btn btn-primary">Speichern</button></div>
          </form>
        </Card>
        <Card title="Nummernkreise (Rechnungen, Angebote, Verträge)" className="max-w-4xl reveal reveal-2" pad={false}>
          {nummernkreise.length ? (
            <table className="table"><thead><tr><th>Kostenstelle</th><th>Typ</th><th>Jahr</th><th>Format</th><th className="r">Zuletzt vergeben</th><th>Frei (zuerst vergeben)</th><th>Nächste Nummer</th><th></th></tr></thead>
              <tbody>{nummernkreise.map((n) => {
                const ks = kostenstellen.find((k) => k.id === n.kostenstelleId);
                const vorschau = (nr: number) => n.format.replace("{typ}", n.typ).replace("{kuerzel}", ks?.kuerzel ?? "").replace("{jahr}", String(n.jahr)).replace("{nnnn}", String(nr).padStart(4, "0")).replace("{nnn}", String(nr).padStart(3, "0"));
                return (
                  <tr key={n.id}>
                    <td>{ks?.name ?? n.kostenstelleId}</td><td>{({ RE: "Rechnung", AN: "Angebot", VT: "Vertrag" } as Record<string, string>)[n.typ] ?? n.typ}</td><td>{n.jahr}</td>
                    <td><form action={nummernkreisSpeichern.bind(null, n.id)} id={`nk-${n.id}`} className="flex items-center gap-2"><input name="format" defaultValue={n.format} className="input !w-44 !py-1 font-mono text-[12px]" /></form></td>
                    <td className="r"><input form={`nk-${n.id}`} name="letzteNummer" type="number" min={0} defaultValue={n.letzteNummer} className="input !w-24 !py-1 num text-right" /></td>
                    <td className="num text-muted text-[12px]">{n.freieNummern.length ? n.freieNummern.map(vorschau).join(", ") : "–"}</td>
                    <td className="num text-muted">{n.freieNummern.length ? vorschau(Math.min(...n.freieNummern)) : vorschau(n.letzteNummer + 1)}</td>
                    <td className="r"><button form={`nk-${n.id}`} className="btn btn-secondary btn-sm">Speichern</button></td>
                  </tr>
                );
              })}</tbody></table>
          ) : <p className="p-5 text-[13px] text-muted">Noch keine Nummernkreise – sie entstehen automatisch mit der ersten Rechnung, dem ersten Angebot bzw. Vertrag.</p>}
          <p className="help px-5 py-3">„Zuletzt vergeben“ = laufende Zahl der letzten Nummer; die nächste Rechnung bekommt die Zahl + 1. Platzhalter im Format: {"{jahr} {kuerzel} {typ} {nnn} {nnnn}"}. Beispiel Rechnung: Format <code>{"{jahr}{nnn}"}</code>, zuletzt 7 → nächste 2026008. Änderungen werden im Audit-Log protokolliert – § 11 UStG verlangt eine fortlaufende Nummerierung ohne Lücken.</p>
        </Card>
      </>)}

      {tab === "kostenstellen" && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          <Card title="Kostenstellen" pad={false} className="reveal">
            <table className="table"><thead><tr><th>Name</th><th>Kürzel</th><th>Typ</th><th>Bundesland</th><th className="r">Provision Überl. / Verm.</th><th className="r">Kunden</th><th className="r">Personen</th><th className="r">Nutzer</th><th></th></tr></thead>
              <tbody>{kostenstellen.map((k) => <tr key={k.id}><td className="font-semibold">{k.name}{!k.aktiv && <Badge tone="grey">inaktiv</Badge>}</td><td className="num">{k.kuerzel}</td><td>{k.isZentrale ? <Badge tone="fox">Zentrale</Badge> : <Badge tone="brand">Kostenstelle</Badge>}</td><td>{k.bundesland}</td><td className="r num">{k.isZentrale ? <span className="text-muted">DB1</span> : `${k.provisionUeberlassung} % / ${k.provisionVermittlung} %`}</td><td className="r num">{k._count.kunden}</td><td className="r num">{k._count.personen}</td><td className="r num">{k._count.nutzer}</td><td className="r"><Link href={`/einstellungen?tab=kostenstellen&edit=${k.id}`} className="btn btn-ghost btn-sm">Bearbeiten</Link></td></tr>)}</tbody></table>
          </Card>
          <Card title={editKs ? `${editKs.name} bearbeiten` : "Neue Kostenstelle"} className="reveal reveal-2">
            <form action={kostenstelleSpeichern} className="space-y-3">
              {editKs && <input type="hidden" name="id" value={editKs.id} />}
              <Field label="Name" required><input name="name" required defaultValue={editKs?.name ?? ""} className="input" placeholder="z. B. Kostenstelle Wien" /></Field>
              <Field label="Kürzel (für Nummernkreise)" required><input name="kuerzel" required defaultValue={editKs?.kuerzel ?? ""} className="input num" maxLength={5} /></Field>
              <Field label="Bundesland (DZ-Satz)"><select name="bundesland" defaultValue={editKs?.bundesland ?? "Niederösterreich"} className="select">{Object.keys(DZ_BUNDESLAND).map((b) => <option key={b}>{b}</option>)}</select></Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Provision Überlassung %" help="Anteil am DB1, den die Kostenstelle sieht."><input name="provisionUeberlassung" defaultValue={editKs?.provisionUeberlassung ?? 20} className="input num" inputMode="decimal" /></Field>
                <Field label="Provision Direktvermittlung %" help="Anteil am Vermittlungshonorar."><input name="provisionVermittlung" defaultValue={editKs?.provisionVermittlung ?? 50} className="input num" inputMode="decimal" /></Field>
              </div>
              <Field label="Straße"><input name="strasse" defaultValue={editKs?.strasse ?? ""} className="input" /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="PLZ"><input name="plz" defaultValue={editKs?.plz ?? ""} className="input" /></Field><Field label="Ort"><input name="ort" defaultValue={editKs?.ort ?? ""} className="input" /></Field></div>
              <Field label="E-Mail (Absender)"><input name="email" defaultValue={editKs?.email ?? ""} className="input" /></Field>
              <Field label="Telefon"><input name="telefon" defaultValue={editKs?.telefon ?? ""} className="input" /></Field>
              {editKs && <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="aktiv" value="on" defaultChecked={editKs.aktiv} /><input type="hidden" name="aktiv" value="off" /> Aktiv</label>}
              <div className="flex gap-2"><button className="btn btn-primary flex-1 justify-center">{editKs ? "Speichern" : "Anlegen"}</button>{editKs && <Link href="/einstellungen?tab=kostenstellen" className="btn btn-secondary">Neu</Link>}</div>
              <p className="help">Neue Kostenstellen sind sofort nutzbar – Nutzer dann unter „Nutzer“ zuordnen. Kostenstellen-Nutzer sehen keinen DB1, sondern nur ihre Provision lt. Schlüssel; die Zentrale sieht DB1 und Provision.</p>
            </form>
          </Card>
        </div>
      )}

      {tab === "nutzer" && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          <Card title="Nutzer & Rollen" pad={false} className="reveal">
            <table className="table"><thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Kostenstelle</th><th>2FA</th><th>Letzter Login</th><th></th></tr></thead>
              <tbody>{nutzer.map((n) => <tr key={n.id}><td className="font-semibold">{n.name}{!n.aktiv && <Badge tone="grey">inaktiv</Badge>}</td><td>{n.email}</td><td><Badge tone={n.rolle === "SYSTEMADMIN" ? "fox" : n.rolle === "ZENTRALE" ? "violet" : "brand"}>{n.rolle.replace("_", " ")}</Badge></td><td>{n.kostenstelle?.name ?? <span className="text-muted">alle</span>}</td><td>{n.totpSecret ? <Badge tone="teal">aktiv</Badge> : <span className="text-muted">–</span>}</td><td className="text-muted">{n.letzterLogin ? datum(n.letzterLogin) : "–"}</td><td className="r"><Link href={`/einstellungen?tab=nutzer&edit=${n.id}`} className="btn btn-ghost btn-sm">Bearbeiten</Link></td></tr>)}</tbody></table>
          </Card>
          <Card title={editNutzer ? `${editNutzer.name} bearbeiten` : "Neuer Nutzer"} className="reveal reveal-2">
            <form action={nutzerSpeichern} className="space-y-3">
              {editNutzer && <input type="hidden" name="id" value={editNutzer.id} />}
              <Field label="Name" required><input name="name" required defaultValue={editNutzer?.name ?? ""} className="input" /></Field>
              <Field label="E-Mail (Login)" required><input name="email" type="email" required defaultValue={editNutzer?.email ?? ""} className="input" /></Field>
              <Field label="Rolle"><select name="rolle" defaultValue={editNutzer?.rolle ?? "KOSTENSTELLEN_LEITUNG"} className="select"><option value="SYSTEMADMIN">Systemadmin (alles, inkl. Einstellungen)</option><option value="ZENTRALE">Zentrale (alle Kostenstellen)</option><option value="KOSTENSTELLEN_LEITUNG">Kostenstellen-Leitung</option><option value="SACHBEARBEITUNG">Sachbearbeitung (ohne Lohn/Rechnungsfreigabe)</option></select></Field>
              <Field label="Kostenstelle (für Leitung/Sachbearbeitung)"><select name="kostenstelleId" defaultValue={editNutzer?.kostenstelleId ?? ""} className="select"><option value="">–</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
              <Field label={editNutzer ? "Neues Passwort (leer = unverändert)" : "Passwort"} help="Mind. 10 Zeichen; Nutzer sollte es nach dem ersten Login ändern."><input name="passwort" type="password" className="input" autoComplete="new-password" /></Field>
              {editNutzer && <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="aktiv" value="on" defaultChecked={editNutzer.aktiv} /><input type="hidden" name="aktiv" value="off" /> Aktiv</label>}
              {editNutzer?.totpSecret && <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="totpReset" /> 2FA zurücksetzen (bei Geräteverlust)</label>}
              <div className="flex gap-2"><button className="btn btn-primary flex-1 justify-center">{editNutzer ? "Speichern" : "Anlegen"}</button>{editNutzer && <Link href="/einstellungen?tab=nutzer" className="btn btn-secondary">Neu</Link>}</div>
            </form>
          </Card>
        </div>
      )}

      {tab === "saetze" && saetzeNow && a && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <Card title={`Abgabensätze – aktuell: ${saetzeNow.setName}`} className="reveal">
            <form action={saetzeSpeichern} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3"><Field label="Name des neuen Satz-Sets"><input name="name" className="input" placeholder="z. B. Sätze 2027" /></Field><Field label="Gültig ab"><input type="date" name="gultigAb" className="input" defaultValue={isoDate(new Date())} /></Field></div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{SATZ_LABELS.map(([k, l]) => <Field key={k} label={l + " %"}><input name={k} defaultValue={(saetzeNow.saetze[k] * 100).toFixed(4).replace(/\.?0+$/, "")} className="input num" inputMode="decimal" /></Field>)}</div>
              <div className="alert alert-brand text-[13px]">Abgeleitet: DG-Abgaben gesamt <b className="num">{pct(a.dgAbgabenGesamt, 2)}</b> · ohne WBF {pct(a.dgAbgabenOhneWbf, 2)} · Payroll-Faktor <b className="num">{a.payrollFaktor.toFixed(4)}</b> · Überlassungs-Faktor <b className="num">{a.ueberlassungsFaktor.toFixed(4)}</b> · DG auf Grundlohn {pct(a.dgAbgabenAufGrundlohn, 2)}</div>
              <button className="btn btn-primary">Als neues Satz-Set speichern</button>
              <p className="help">Alte Angebote behalten ihren Kalkulations-Snapshot; Monatsabrechnungen nutzen das zum Stichtag gültige Set. Bisherige Sets: {satzSets.map((x) => `${x.name} (ab ${datum(x.gultigAb)})`).join(", ")}</p>
            </form>
          </Card>
          <Card title="DZ-Zuschlag je Bundesland" className="reveal reveal-2">
            <form action={dzSpeichern} className="space-y-3">
              <Field label="Gültig ab"><input type="date" name="gultigAb" className="input" defaultValue={isoDate(new Date())} /></Field>
              {dzAktuell.map(({ bl, satz }) => <div key={bl} className="flex items-center gap-2"><span className="flex-1 text-[13.5px]">{bl}</span><input name={`dz_${bl}`} defaultValue={(satz * 100).toFixed(2)} className="input !w-24 num text-right" /><span className="text-muted text-[12px]">%</span></div>)}
              <button className="btn btn-secondary w-full justify-center">DZ-Sätze speichern</button>
            </form>
          </Card>
        </div>
      )}

      {tab === "kv" && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <div className="space-y-4">
            <div className="alert alert-amber">Der Mindestlohn-Check in Angeboten und Einsätzen rechnet immer mit dem <b>besseren KV</b>: max(KV AKÜ der Beschäftigungsgruppe, Referenzlohn des Beschäftiger-KV, Hausregel). Liegt der Beschäftiger-KV darüber, weist das Programm die Differenz als <b>Referenzzuschlag</b> aus (§ 10 AÜG, LSD-BG). Exakt gepflegt ist die metalltechnische Industrie; bei allen übrigen KV ist der Referenzlohn vor der Überlassung zu erfragen.</div>
            {kvs.map((kv) => {
              const tafeln = [...new Set(kv.lohntabelle.map((l) => (l.gultigAb ? l.gultigAb.toISOString().slice(0, 10) : "")))].sort();
              return (
              <Card key={kv.id} title={<span>{kv.name} ({kv.kuerzel})<span className="block text-[12px] font-normal text-muted">{kv.istReferenz ? `Beschäftiger-KV · ${kv.wochenstunden} h/Woche · Teiler ${kv.monatsteiler}${kv.quelle ? ` · ${kv.quelle}` : ""}` : `Eigener KV · gültig ab ${datum(kv.gultigAb)}`}</span></span>} pad={false} className="reveal">
                {kv.referenzzuschlagPruefen && <div className="px-5 pt-4"><div className="alert alert-amber">{kv.hinweis ?? "Lohntafel nicht hinterlegt – Referenzzuschlag vor dem Einsatz prüfen."}</div></div>}
                {kv.lohntabelle.length > 0 && tafeln.map((t) => (
                  <div key={t}>
                    {tafeln.length > 1 && <div className="px-5 pt-4 text-[12px] font-semibold uppercase tracking-wide text-muted">Lohntafel gültig ab {t ? datum(new Date(t)) : "–"}</div>}
                    <table className="table"><thead><tr><th>Gruppe</th><th>Bezeichnung</th><th className="r">Std.lohn</th><th className="r">Grundstufe</th><th className="r">nach 2 J.</th><th className="r">nach 4 J.</th><th className="r" title="Referenzzuschlag laut Lohnverrechnung – Spalte „Satz Ref. Z“">Ref. Z</th><th className="r">inkl. Zuschlag</th><th></th></tr></thead>
                      <tbody>{kv.lohntabelle.filter((l) => (l.gultigAb ? l.gultigAb.toISOString().slice(0, 10) : "") === t).map((l) => <tr key={l.id}><td className="font-semibold">{l.beschaeftigungsgruppe}</td><td>{l.bezeichnung}</td><td className="r num">{l.mindestStundenlohn?.toFixed(2) ?? "–"}</td><td className="r num">{l.mindestMonatsbrutto?.toFixed(2) ?? "–"}</td><td className="r num">{l.nach2Jahren?.toFixed(2) ?? "–"}</td><td className="r num">{l.nach4Jahren?.toFixed(2) ?? "–"}</td><td className="r num">{l.referenzzuschlagProzent != null ? `${l.referenzzuschlagProzent.toFixed(0)} %` : "–"}</td><td className="r num">{(() => { const std = l.mindestStundenlohn ?? (l.mindestMonatsbrutto != null ? l.mindestMonatsbrutto / (kv.monatsteiler || 167) : null); return std != null && l.referenzzuschlagProzent != null ? (std * (1 + l.referenzzuschlagProzent / 100)).toFixed(2) : "–"; })()}</td><td className="r"><form action={kvStufeLoeschen.bind(null, l.id)}><button className="btn btn-ghost btn-sm text-red">Entfernen</button></form></td></tr>)}</tbody></table>
                  </div>
                ))}
              </Card>
            ); })}
          </div>
          <Card title="Lohnstufe hinzufügen / KV anlegen" className="reveal reveal-2">
            <form action={kvSpeichern} className="space-y-3">
              <Field label="Bestehender KV"><select name="kvId" className="select"><option value="">– neuen KV anlegen –</option>{kvs.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
              <Field label="Name (bei neuem KV)"><input name="name" className="input" placeholder="z. B. KV Metallgewerbe" /></Field>
              <Field label="Kürzel"><input name="kuerzel" className="input" /></Field>
              <Field label="Gültig ab"><input type="date" name="gultigAb" className="input" defaultValue={isoDate(new Date())} /></Field>
              <Field label="Beschäftigungsgruppe"><input name="bg" className="input" placeholder="z. B. BG 3" /></Field>
              <Field label="Bezeichnung"><input name="bezeichnung" className="input" /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Mindest-Std.lohn €"><input name="mindestStundenlohn" className="input num" /></Field><Field label="Mindest-Monatsbrutto €"><input name="mindestMonatsbrutto" className="input num" /></Field></div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Referenzzuschlag %" help="Spalte „Satz Ref. Z“ aus der Lohnverrechnung – z. B. 9 für Gruppe A, 18 ab Gruppe D."><input name="referenzzuschlagProzent" className="input num" placeholder="18" /></Field>
                <Field label="Gilt für" help="Beschäftiger führen für Arbeiter und Angestellte getrennte Kollektivverträge."><select name="gruppe" className="select"><option value="ARBEITER">Arbeiter</option><option value="ANGESTELLTE">Angestellte</option><option value="BEIDE">beide</option></select></Field>
              </div>
              <button className="btn btn-primary w-full justify-center">Speichern</button>
            </form>
          </Card>
          <Card title="Allgemeine Geschäftsbedingungen" className="reveal reveal-3">
            <p className="text-[13.5px] text-muted mb-3">Fassung <b>{AGB_VERSION}</b> (Stand {AGB_STAND}). Die AGB gehen bei jedem Rahmen-, Überlassungs- und Vermittlungsvertrag automatisch als Anhang mit und werden beim Kunden mit Version, Datum und Unterzeichner dokumentiert.</p>
            <div className="flex gap-2"><a href="/agb/ueberlassung" target="_blank" className="btn btn-secondary btn-sm">AGB Arbeitskräfteüberlassung</a><a href="/agb/vermittlung" target="_blank" className="btn btn-secondary btn-sm">AGB Arbeitskräftevermittlung</a></div>
          </Card>
          <Card title="Referenzlöhne der Beschäftiger-KV" className="reveal reveal-3">
            <p className="text-[13.5px] text-muted mb-3">Legt die Beschäftiger-Kollektivverträge an bzw. bringt sie auf den aktuellen Stand: die <b>metalltechnische Industrie</b> mit den exakten Lohntafeln der WKO (gültig ab 1.11.2025 und 1.11.2026, Beschäftigungsgruppen A–K inkl. Vorrückung nach 2 und 4 Jahren), alle übrigen KV nur angelegt und mit dem Hinweis „Referenzzuschlag prüfen“. Bereits erfasste Werte werden überschrieben, eigene KV bleiben unberührt.</p>
            <p className="mb-3"><Link href="/kollektivvertraege" className="btn btn-secondary w-full justify-center">Übersicht der Kollektivverträge und ihrer Gültigkeit</Link></p>
            <p className="help mb-3">Der Abgleich läuft seit v2.16.4 bei jedem Start des Servers automatisch – dieser Knopf ist nur noch für den Fall gedacht, dass etwas nachgezogen werden soll, ohne neu zu starten.</p>
            <form action={referenzKvAktualisieren}><button className="btn btn-secondary w-full justify-center">Referenz-KV anlegen / aktualisieren</button></form>
          </Card>
          <Card title="Kollektivverträge ohne Referenzzuschlag" className="reveal reveal-4">
            <p className="text-[13.5px] text-muted mb-3">Nicht jeder Beschäftiger-KV kennt einen Referenzzuschlag nach § 10 AÜG – im Handel etwa gibt es keinen. Wird das bei einem Einsatz einmal festgehalten, verlangt die Software für Kunden dieses KV keine Bestätigung mehr. Die Feststellung steht hier mit Name und Zeitpunkt und lässt sich jederzeit aufheben.</p>
            {keinZuschlag.length === 0 ? (
              <p className="help">Noch nichts festgehalten. Beim Einsatz erscheint dafür ein Kästchen unter dem Referenzlohn.</p>
            ) : (
              <ul className="divide-y divide-line">
                {keinZuschlag.map((e) => (
                  <li key={e.schluessel} className="py-2 flex items-center justify-between gap-4 text-[13.5px]">
                    <span><b>{e.bezeichnung}</b><span className="text-muted"> · {e.von} · {new Date(e.am).toLocaleDateString("de-AT")}</span></span>
                    <form action={keinZuschlagAufheben.bind(null, e.schluessel)}><button className="btn btn-secondary btn-sm">Aufheben</button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "vorlagen" && (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <Card title="Vorlagen" pad={false} className="reveal"><ul className="divide-y divide-line">{vorlagen.map((v) => <li key={v.id}><Link href={`/einstellungen?tab=vorlagen&edit=${v.id}`} className={`block px-5 py-3 hover:bg-surface-2 ${editVorlage?.id === v.id ? "bg-brand-soft" : ""}`}><div className="font-semibold text-[13.5px]">{v.name}</div><div className="text-[12px] text-muted">{v.typ} · v{v.version}{!v.aktiv && " · inaktiv"}</div></Link></li>)}</ul><div className="px-5 py-3 border-t border-line"><Link href="/einstellungen?tab=vorlagen" className="btn btn-secondary btn-sm">Neue Vorlage</Link></div></Card>
          <Card title={editVorlage ? editVorlage.name : "Neue Vorlage"} className="reveal reveal-2">
            <form action={vorlageSpeichern} className="space-y-3">
              {editVorlage && <input type="hidden" name="id" value={editVorlage.id} />}
              <div className="grid sm:grid-cols-2 gap-3"><Field label="Name"><input name="name" defaultValue={editVorlage?.name ?? ""} required className="input" /></Field><Field label="Typ"><select name="typ" defaultValue={editVorlage?.typ ?? "DIENSTVERTRAG"} className="select">{["DIENSTVERTRAG", "UEBERLASSUNGSMITTEILUNG", "ZUSATZVEREINBARUNG", "UEBERLASSUNGSVERTRAG", "RAHMENVERTRAG", "VERMITTLUNGSVERTRAG"].map((t) => <option key={t}>{t}</option>)}</select></Field></div>
              <textarea name="inhalt" defaultValue={editVorlage?.inhalt ?? ""} rows={26} className="textarea font-mono text-[12.5px]" />
              {editVorlage && <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="aktiv" value="on" defaultChecked={editVorlage.aktiv} /><input type="hidden" name="aktiv" value="off" /> Aktiv</label>}
              <div className="flex gap-2"><button className="btn btn-primary">Speichern</button></div>
              <p className="help">Platzhalter: {"{{person.vorname}} {{person.nachname}} {{person.geburtsdatum}} {{person.strasse}} {{person.plz}} {{person.ort}} {{person.stundenlohn}} {{person.beschaeftigungsgruppe}} {{person.kv}} {{person.urlaubsanspruch}} {{kunde.firmenname}} {{kunde.strasse}} {{kunde.plz}} {{kunde.ort}} {{kunde.uid}} {{kunde.zahlungszielTage}} {{kunde.kuendigungsfrist}} {{kunde.rahmenvertragEnde}} {{kunde.konditionenTabelle}} {{kunde.ueberstundenZuschlag}} {{kunde.wochenendZuschlag}} {{einsatz.von}} {{einsatz.bis}} {{einsatz.rolle}} {{einsatz.ort}} {{einsatz.wochenstunden}} {{einsatz.schicht}} {{einsatz.verrechnungssatz}} {{einsatz.dauer}} {{firma.name}} {{firma.rechtstraeger}} {{firma.strasse}} {{firma.plz}} {{firma.ort}} {{firma.uid}} {{firma.firmenbuch}} {{firma.telefon}} {{datum}}"}</p>
            </form>
          </Card>
        </div>
      )}

      {tab === "import" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Excel-Import (Verrechnungstool)" className="reveal">
            <form action={excelImport} className="space-y-3" encType="multipart/form-data">
              <Field label="Datei (.xlsx)"><input type="file" name="datei" accept=".xlsx" required className="input" /></Field>
              <Field label="Ziel-Kostenstelle"><select name="kostenstelleId" className="select">{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
              <button className="btn btn-primary">Importieren</button>
              <p className="help">Blätter „Bewerber & Mitarbeiter“, „Stammdaten“, „Aktive Mitarbeiter“, „Monatsabrechnung“, „Kalkulation“. Idempotent: bestehende Personen (Name + Geburtsdatum) werden aktualisiert, nicht dupliziert.</p>
            </form>
            {letzterImport && <div className="mt-4 alert alert-brand text-[12.5px]"><span>Letzter Import: {letzterImport.datei} am {datum(letzterImport.zeitpunkt)} – {letzterImport.erg.personen.neu} neu, {letzterImport.erg.personen.aktualisiert} aktualisiert, {letzterImport.erg.kunden.neu} Kunden, {letzterImport.erg.monatswerte.gesetzt} Monatswerte.{letzterImport.erg.hinweise.length > 0 && ` Hinweise: ${letzterImport.erg.hinweise.join(" ")}`}</span></div>}
          </Card>
          <div className="space-y-4">
            <Card title="Demo-Daten" className="reveal reveal-2">
              <p className="text-[13.5px] mb-3">Musterkunden („Muster Logistik GmbH“, „Alpen Metallbau AG“, „Donau Office Services e.U.“) und Musterpersonen mit Einsätzen, Angeboten und Rechnungen. Vor dem Produktivbetrieb entfernen.</p>
              <form action={demoDatenLoeschen}><button className="btn btn-danger">Demo-Daten löschen</button></form>
              <form action={testmailSenden} className="mt-3"><button className="btn btn-secondary">Testmail an mich senden</button><p className="help mt-1">Modus: <b>{process.env.MAIL_MODE === "live" ? "live" : "test (Mails werden nur protokolliert)"}</b>{sp.testmail && <> · Ergebnis: <b>{sp.testmail}</b></>}</p></form>
            </Card>
            <Card title="Backups & Löschkonzept" className="reveal reveal-3">
              <p className="text-[13.5px]">Datenbank-Backup täglich per <code>pg_dump</code> (siehe README / docker-compose), Dateispeicher im Volume <code>storage/</code>. Ausgeschiedene Personen können vom Systemadmin anonymisiert werden (Name, Kontakt, SVNR, Dokumente werden entfernt; Kennzahlen bleiben aggregiert erhalten).</p>
            </Card>
          </div>
        </div>
      )}

      {tab === "loeschen" && (s.rolle === "SYSTEMADMIN" ? (
        <div className="max-w-3xl">
          {sp.geleert && <div className="alert alert-teal mb-4"><span>Gelöscht – {sp.geleert}.</span></div>}
          {sp.fehler === "bestaetigung" && <div className="alert alert-red mb-4">Zur Sicherheit muss unten das Wort LÖSCHEN eingetippt werden.</div>}
          {sp.fehler === "auswahl" && <div className="alert alert-red mb-4">Es war kein Bereich angehakt.</div>}
          <div className="alert alert-amber mb-4"><span><strong>Das ist endgültig.</strong> Was hier gelöscht wird, ist weg – es gibt kein Zurückholen in der Software. Die einzige Rettung ist die nächtliche Sicherung. Gedacht ist die Seite zum Aufräumen der Probedaten vor dem Echtbetrieb und für echte Fehleingaben.</span></div>
          <Card title="Bestand leeren" className="reveal">
            <form action={bestandLeeren} className="space-y-4">
              <div className="space-y-2">
                {BEREICHE.map((b) => (
                  <label key={b.key} className="flex items-start gap-2 text-[13.5px]">
                    <input type="checkbox" name={`b_${b.key}`} value="ja" className="mt-[4px]" />
                    <span><b>{b.label}</b> <span className="text-muted num">({bestand?.[b.key] ?? 0})</span>{b.hinweis && <span className="block text-[12px] text-muted">{b.hinweis}</span>}</span>
                  </label>
                ))}
              </div>
              <Field label="Nur eine Kostenstelle (leer = alle)">
                <select name="kostenstelleId" defaultValue="" className="select"><option value="">alle Kostenstellen</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
              </Field>
              <Field label="Sicherheitsabfrage" help="Tippe LÖSCHEN, damit der Knopf wirkt." required>
                <input name="bestaetigung" placeholder="LÖSCHEN" autoComplete="off" className="input max-w-[220px]" />
              </Field>
              <button className="btn btn-danger">Ausgewählte Bereiche endgültig löschen</button>
            </form>
            <p className="help mt-4">
              Firma, Kostenstellen, Nutzer, KV-Tabellen, Zulagen, Vertragsvorlagen und Nummernkreise bleiben immer erhalten.
              Die Reihenfolge spielt keine Rolle: Wer „Kunden“ anhakt, löscht deren Angebote, Einsätze und Rechnungen mit.
              Jeder Lauf steht mit Anzahl im Audit-Log.
            </p>
            <p className="help mt-2">
              Für die Buchhaltung: Ausgangsrechnungen sind sieben Jahre aufzubewahren (§ 132 BAO). Eine bereits versendete
              Rechnung gehört storniert, nicht gelöscht – das hier ist für Daten aus der Testphase.
            </p>
          </Card>
        </div>
      ) : <div className="alert alert-amber">Diese Seite ist dem Systemadmin vorbehalten.</div>)}

      {tab === "audit" && (
        <Card title="Audit-Log (letzte 200 Einträge)" pad={false} className="reveal">
          <div className="overflow-x-auto"><table className="table text-[12.5px]"><thead><tr><th>Zeitpunkt</th><th>Nutzer</th><th>Aktion</th><th>Entität</th><th>Beschreibung</th><th>IP</th></tr></thead>
            <tbody>{auditLog.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{new Date(l.zeitpunkt).toLocaleString("de-AT")}</td><td>{l.nutzerName}</td><td><Badge tone={l.aktion === "VIEW_SENSITIVE" ? "amber" : l.aktion === "DELETE" ? "red" : l.aktion.startsWith("LOGIN") ? "grey" : "brand"}>{l.aktion}</Badge></td><td>{l.entitaet}{l.datensatzId && <span className="text-muted"> #{l.datensatzId.slice(-6)}</span>}</td><td>{l.beschreibung}{l.diff ? <details className="text-[11.5px] text-muted"><summary>Diff</summary><pre className="whitespace-pre-wrap">{JSON.stringify(l.diff, null, 1)}</pre></details> : null}</td><td className="text-muted">{l.ip}</td></tr>)}</tbody></table></div>
        </Card>
      )}

      {tab === "zulagen" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="KV-Zulagen & Zuschläge" pad={false} className="lg:col-span-2 reveal" actions={!zulagen.length ? <form action={zulagenStandardAnlegen}><button className="btn btn-secondary btn-sm">Standard-Zulagen anlegen</button></form> : undefined}>
            {zulagen.length ? (
              <table className="table"><thead><tr><th>Zulage</th><th>Kürzel</th><th>Wert</th><th>Gilt für</th><th>Weiterverr.</th><th>Steuerfrei</th><th>Status</th><th></th></tr></thead>
                <tbody>{zulagen.map((z) => <tr key={z.id}><td className="font-semibold">{z.name}<div className="text-[11.5px] text-muted font-normal">{z.beschreibung}</div></td><td className="num">{z.kuerzel}</td><td className="num">{zulageText(z)}</td><td className="text-[12px]">{[kvs.find((k) => k.id === z.kvId)?.name, z.schichtmodelle.length ? z.schichtmodelle.map((x) => x === "ZWEI_SCHICHT" ? "2-Schicht" : x === "DREI_SCHICHT" ? "3-Schicht" : x === "TAG" ? "Tag" : "frei").join(", ") : null].filter(Boolean).join(" · ") || <span className="text-muted">alle</span>}</td><td>{z.weiterverrechnen ? <Badge tone="teal">ja</Badge> : <Badge tone="grey">nein</Badge>}</td><td>{z.steuerfrei ? <Badge tone="brand">§ 68 EStG</Badge> : "–"}</td><td>{z.aktiv ? <Badge tone="teal">aktiv</Badge> : <Badge tone="grey">inaktiv</Badge>}</td><td className="r whitespace-nowrap"><Link href={`/einstellungen?tab=zulagen&edit=${z.id}`} className="btn btn-ghost btn-sm">Bearbeiten</Link><form action={zulageLoeschen.bind(null, z.id)} className="inline"><button className="btn btn-ghost btn-sm text-red">Löschen</button></form></td></tr>)}</tbody></table>
            ) : <div className="p-5"><p className="text-[13.5px] text-muted">Noch keine Zulagen hinterlegt. Mit „Standard-Zulagen anlegen“ bekommst du Schmutz-/Erschwernis-/Gefahrenzulage, Nacht-, Schicht-, Sonntags- und Feiertagszuschlag, Taggeld und Kilometergeld als Referenzwerte – bitte mit KV und Lohnverrechnung abgleichen.</p></div>}
            <p className="help px-5 py-3">Zulagen werden je Einsatz ausgewählt, erhöhen die Selbstkosten (und bei „weiterverrechnen“ den Verrechnungssatz × Faktor) und stehen auf der Überlassungsmitteilung. Steuerfreie Zulagen (§ 68 EStG: SEG-Zulagen, Taggeld) sind für die Lohnverrechnung gekennzeichnet.</p>
          </Card>
          <Card title={editZulage ? `${editZulage.name} bearbeiten` : "Neue Zulage"} className="reveal reveal-2">
            <form action={zulageSpeichern} className="space-y-3">
              {editZulage && <input type="hidden" name="id" value={editZulage.id} />}
              <Field label="Bezeichnung" required><input name="name" required defaultValue={editZulage?.name ?? ""} className="input" /></Field>
              <Field label="Kürzel" required><input name="kuerzel" required defaultValue={editZulage?.kuerzel ?? ""} className="input num" maxLength={12} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Art"><select name="art" defaultValue={editZulage?.art ?? "EURO_STUNDE"} className="select"><option value="PROZENT_STUNDENLOHN">% vom Stundenlohn</option><option value="EURO_STUNDE">€ je Stunde</option><option value="EURO_TAG">€ je Tag</option><option value="EURO_MONAT">€ je Monat</option></select></Field>
                <Field label="Wert"><input name="wert" defaultValue={editZulage?.wert ?? ""} className="input num" inputMode="decimal" /></Field>
              </div>
              <Field label="Beschreibung / KV-Stelle"><input name="beschreibung" defaultValue={editZulage?.beschreibung ?? ""} className="input" /></Field>
              <Field label="Nur für diesen Beschäftiger-KV" help="Leer = für alle. Ist ein KV gewählt, schlägt die Software die Zulage beim Einsatz von selbst vor, sobald der Kunde diesen KV hat.">
                <select name="kvId" defaultValue={editZulage?.kvId ?? ""} className="select"><option value="">– für alle –</option>{kvs.filter((k) => k.istReferenz).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
              </Field>
              <Field label="Von selbst vorschlagen bei" help="Zum Beispiel Schichtzulagen: Sobald der Einsatz auf 2- oder 3-Schicht steht, ist die Zulage angehakt.">
                <div className="flex flex-wrap gap-4 mt-1">{[["ZWEI_SCHICHT", "2-Schicht"], ["DREI_SCHICHT", "3-Schicht"], ["TAG", "Tagschicht"], ["FREI", "Frei / nach Bedarf"]].map(([w, l]) => (
                  <label key={w} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="schichtmodelle" value={w} defaultChecked={editZulage?.schichtmodelle.includes(w)} /> {l}</label>
                ))}</div>
              </Field>
              <Field label="Reihenfolge"><input name="reihenfolge" defaultValue={editZulage?.reihenfolge ?? 0} className="input num" /></Field>
              <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="weiterverrechnen" defaultChecked={editZulage?.weiterverrechnen ?? true} /> An Kunden weiterverrechnen (× Faktor)</label>
              <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="steuerfrei" defaultChecked={editZulage?.steuerfrei ?? false} /> Steuerfrei (§ 68 EStG)</label>
              {editZulage && <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="aktiv" value="on" defaultChecked={editZulage.aktiv} /><input type="hidden" name="aktiv" value="off" /> Aktiv</label>}
              <div className="flex gap-2"><button className="btn btn-primary flex-1 justify-center">{editZulage ? "Speichern" : "Anlegen"}</button>{editZulage && <Link href="/einstellungen?tab=zulagen" className="btn btn-secondary">Neu</Link>}</div>
            </form>
          </Card>
        </div>
      )}

      {tab === "fristen" && (
        <Card title="Kündigungsfristen, Probezeit, Behaltefrist" className="max-w-5xl reveal">
          <form action={fristenSpeichern} className="space-y-6">
            <div className="alert alert-amber"><span>{fristen.hinweis}</span></div>
            {([["arbeiterDienstgeber", "Arbeiter/in – Kündigung durch Dienstgeber (KV AKÜ)"], ["arbeiterDienstnehmer", "Arbeiter/in – Kündigung durch Dienstnehmer"], ["angestellteDienstgeber", "Angestellte – Kündigung durch Dienstgeber (§ 20 AngG)"], ["angestellteDienstnehmer", "Angestellte – Kündigung durch Dienstnehmer"]] as const).map(([key, label]) => (
              <div key={key}>
                <div className="section-title mb-2">{label}</div>
                <div className="overflow-x-auto"><table className="table text-[13px]">
                  <thead><tr><th>ab Dienstjahr</th><th>Frist</th><th>Einheit</th><th>Kündigungstermin</th><th>aktuell</th></tr></thead>
                  <tbody>{Array.from({ length: 6 }, (_, i) => { const st: Fristenstufe | undefined = fristen[key][i]; return (
                    <tr key={i}>
                      <td><input name={`${key}_ab_${i}`} defaultValue={st?.abJahren ?? ""} className="input !w-20 num" inputMode="decimal" /></td>
                      <td><input name={`${key}_n_${i}`} defaultValue={st ? (st.frist.monate ?? st.frist.wochen ?? st.frist.tage) : ""} className="input !w-20 num" inputMode="numeric" /></td>
                      <td><select name={`${key}_e_${i}`} defaultValue={st?.frist.monate ? "monate" : st?.frist.wochen ? "wochen" : "tage"} className="select !w-28"><option value="tage">Tage</option><option value="wochen">Wochen</option><option value="monate">Monate</option></select></td>
                      <td><select name={`${key}_t_${i}`} defaultValue={st?.termin ?? "TAG"} className="select !w-44"><option value="TAG">zu jedem Tag</option><option value="FREITAG">zum Freitag</option><option value="MONATSENDE">zum Monatsletzten</option><option value="FUENFZEHNTER_ODER_LETZTER">zum 15. oder Letzten</option><option value="QUARTALSENDE">zum Quartalsende</option></select></td>
                      <td className="text-muted">{st ? `${fristText(st.frist)} ${terminText(st.termin)}` : ""}</td>
                    </tr>); })}</tbody>
                </table></div>
              </div>
            ))}
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Probezeit (Tage)"><input name="probezeitTage" defaultValue={fristen.probezeitTage} className="input num" /></Field>
              <Field label="Behaltefrist nach Lehre (Monate, § 18 BAG)"><input name="behaltefristMonate" defaultValue={fristen.behaltefristMonate} className="input num" /></Field>
              <Field label="Hinweistext" className="sm:col-span-3"><input name="hinweis" defaultValue={fristen.hinweis} className="input" /></Field>
            </div>
            <button className="btn btn-primary">Fristen speichern</button>
          </form>
        </Card>
      )}

      {tab === "konto" && me && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Zwei-Faktor-Authentifizierung" className="reveal">
            {me.totpSecret ? <><p className="text-[13.5px] mb-3"><Badge tone="teal">2FA aktiv</Badge> Beim Login wird zusätzlich ein Code aus deiner Authenticator-App abgefragt.</p><form action={totpDeaktivieren} className="space-y-2"><Field label="Zur Sicherheit: dein Passwort"><input name="passwort" type="password" required className="input" autoComplete="current-password" /></Field><button className="btn btn-secondary">2FA deaktivieren</button></form></> : <TotpSetup aktivieren={totpAktivieren} />}
          </Card>
          <Card title="Passwort ändern" className="reveal reveal-2">
            <form action={passwortAendern} className="space-y-3">
              <Field label="Bisheriges Passwort"><input name="altesPasswort" type="password" required className="input" autoComplete="current-password" /></Field>
              <Field label="Neues Passwort (mind. 10 Zeichen)"><input name="passwort" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
              <button className="btn btn-primary">Passwort speichern</button>
            </form>
            <p className="help mt-2">Nach dem Ändern werden alle anderen Anmeldungen beendet – auf anderen Geräten musst du dich neu anmelden.</p>
            <p className="help mt-3">Angemeldet als {me.email} · Rolle {me.rolle}</p>
          </Card>
        </div>
      )}
    </>
  );
}
