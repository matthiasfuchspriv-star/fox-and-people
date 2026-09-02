import Link from "next/link";
import { Fuechse } from "@/components/fuechse";
import { notFound } from "next/navigation";
import { Pencil, Phone, Mail, MapPin, FileDown } from "lucide-react";
import { istZentrale, requireSession, darfKostenstelle, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailFuer, AP_ROLLEN, apRolleLabel } from "@/lib/kontakte";
import { ergebnisSicht } from "@/lib/provision";
import { controlling } from "@/lib/controlling";
import { eur, pct, datum, MONATE } from "@/lib/format";
import { PageHeader, Card, Field, Stat, Badge, Empty, einsatzStatusBadge, angebotStatusBadge, rechnungStatusBadge, Kpi } from "@/components/ui";
import { anredeZeile } from "@/lib/anrede";
import { ansprechpartnerAnlegen, ansprechpartnerAnrede, ansprechpartnerLoeschen, kundeNotiz, kundeDokument, kundenBewertungAnlegen, bewertungAnfragen, kundeLoeschen, kundeDokumentLoeschen, uebernahmeAnlegen, uebernahmeStatus, portalLinkSenden } from "../actions";
import { AGB_VERSION, AGB_STAND, uebernahmeHonorar, volleMonate } from "@/lib/agb";
import { passendeMitarbeiter } from "@/lib/matching";
import { MapPin as Pin, Sparkles } from "lucide-react";
import { BewertungFelder, MerkmalChips } from "@/components/bewertung-felder";

export const dynamic = "force-dynamic";
const TABS = [["uebersicht", "Übersicht"], ["matching", "Passende Mitarbeiter"], ["bewertungen", "Bewertungen"], ["kontakte", "Ansprechpartner"], ["konditionen", "Angebote"], ["einsaetze", "Einsätze & bisherige Mitarbeiter"], ["angebote", "Rechnungen"], ["uebernahmen", "Portal, Übernahmen & AGB"], ["dokumente", "Dokumente"], ["historie", "Historie"]] as const;

export default async function KundeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; rolle?: string; gesendet?: string; fehler?: string; mail?: string }> }) {
  const s = await requireSession();
  const prov = ergebnisSicht(s) === "PROVISION";
  const zentraleSicht = istZentrale(s);
  const EL = prov ? "Provision" : "DB1";
  const { id } = await params;
  const sp = await searchParams;
  const { tab = "uebersicht", rolle, gesendet, fehler } = sp;
  const k = await db.kunde.findUnique({ where: { id }, include: { ansprechpartner: true, konditionen: true, einsaetze: { orderBy: { von: "desc" }, include: { person: true } }, angebote: { orderBy: { datum: "desc" } }, rechnungen: { orderBy: { rechnungsdatum: "desc" } }, dokumente: { orderBy: { hochgeladenAm: "desc" } }, aktivitaeten: { orderBy: { zeitpunkt: "desc" }, take: 50 }, bewertungen: { include: { person: true }, orderBy: { datum: "desc" } }, kundenBewertungen: { include: { person: true }, orderBy: { datum: "desc" } }, bewertungsAnfragen: { include: { person: true }, orderBy: { erstelltAm: "desc" }, take: 10 }, vertraege: true, kostenstelle: true } });
  if (!k || !darfKostenstelle(s, k.kostenstelleId)) notFound();
  const sensibel = darfSensibel(s);
  const jahr = new Date().getFullYear();
  const c = await controlling(jahr, k.kostenstelleId);
  const kc = c.kunden.find((x) => x.kundeId === id);
  const ma = c.mitarbeiter.filter((m) => m.kundeId === id);
  const heute = new Date();
  const haupt = k.ansprechpartner.find((a) => a.istHaupt) ?? k.ansprechpartner[0];
  const offen = k.rechnungen.filter((r) => ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"].includes(r.status)).reduce((x, r) => x + r.brutto - r.bezahltBetrag, 0);
  const rvEnde = k.rahmenvertragEnde;
  const vorschlaege = tab === "matching" ? await passendeMitarbeiter(id, { rolle: rolle ?? null, kostenstelleId: k.kostenstelleId, von: new Date() }) : [];
  const uebernahmen = tab === "uebernahmen" ? await db.uebernahme.findMany({ where: { kundeId: id }, include: { person: { select: { vorname: true, nachname: true } } }, orderBy: { uebernahmeAm: "desc" } }) : [];
  const avgVonMa = k.kundenBewertungen.length ? k.kundenBewertungen.reduce((x, b) => x + b.sterne, 0) / k.kundenBewertungen.length : null;
  const avgAnMa = k.bewertungen.length ? k.bewertungen.reduce((x, b) => x + b.sterne, 0) / k.bewertungen.length : null;
  const kvBald = k.kvGueltigBis && k.kvGueltigBis < new Date(heute.getTime() + 62 * 86400000);

  return (
    <>
      <PageHeader crumbs={[{ href: "/kunden", label: "Kunden" }, { label: k.firmenname }]}
        title={<span className="flex items-center gap-3 flex-wrap">{k.firmenname} {k.status === "INAKTIV" && <Badge tone="grey">inaktiv</Badge>}</span>}
        sub={<span className="flex flex-wrap gap-x-4 gap-y-1 items-center">{k.ort && <span className="flex items-center gap-1"><MapPin size={13} />{k.strasse}, {k.plz} {k.ort}</span>}{k.telefon && <span className="flex items-center gap-1"><Phone size={13} />{k.telefon}</span>}{k.email && <span className="flex items-center gap-1"><Mail size={13} />{k.email}</span>}<span className="badge badge-grey">{k.kostenstelle.name}</span></span>}
        actions={<><Link href={`/mail/neu?kundeId=${id}`} className="btn btn-secondary">E-Mail</Link><Link href={`/angebote/neu?kundeId=${id}`} className="btn btn-secondary">Angebot erstellen</Link><Link href={`/einsaetze/neu?kundeId=${id}`} className="btn btn-secondary">Einsatz planen</Link><Link href={`/kunden/${id}/bearbeiten`} className="btn btn-primary"><Pencil size={15} /> Bearbeiten</Link>{s.rolle === "SYSTEMADMIN" && <form action={kundeLoeschen.bind(null, id)} className="flex flex-col items-start"><button className="btn btn-ghost text-red" title="Nur Systemadmin">Löschen</button><label className="flex items-center gap-1 text-[11.5px] text-muted mt-1 whitespace-nowrap" title="Löscht auch alle Rechnungen dieses Kunden – nur für Testdaten und Fehleingaben."><input type="checkbox" name="erzwingen" value="ja" /> samt Rechnungen</label></form>}</>} />
      {(!k.arbeitszeitmodell || !k.kollektivvertrag || !k.kvGueltigBis) && <div className="alert alert-amber mb-4"><span><strong>Pflichtangaben fehlen:</strong> Arbeitszeitmodell, WKO-Kollektivvertrag und KV-Gültigkeit bitte unter „Bearbeiten“ ergänzen.</span></div>}
      {kvBald && <div className={`alert ${k.kvGueltigBis! < heute ? "alert-red" : "alert-amber"} mb-4`}><span><strong>{k.kollektivvertrag?.startsWith("KV") ? "" : "KV "}{k.kollektivvertrag} {k.kvGueltigBis! < heute ? "abgelaufen" : "läuft aus"}:</strong> {datum(k.kvGueltigBis)} – Angebot und Verrechnungssätze anpassen (neuer Referenzlohn).</span></div>}
      {sp.mail && <div className={`alert ${sp.mail === "FEHLER" ? "alert-red" : "alert-teal"} mb-4`}>{sp.mail === "TEST" ? "E-Mail im Testmodus protokolliert (SMTP noch nicht hinterlegt)." : sp.mail === "GESENDET" ? "E-Mail gesendet." : "E-Mail-Versand fehlgeschlagen – siehe Mail-Protokoll."}</div>}
      {gesendet && <div className={`alert ${gesendet === "TEST" ? "alert-amber" : "alert-teal"} mb-4`}>{gesendet === "TEST" ? "Bewertungslink protokolliert (Testmodus, SMTP fehlt)." : "Bewertungslink versendet."}</div>}
      {fehler === "ap" ? <div className="alert alert-red mb-4">Ansprechpartner bitte vollständig ausfüllen (Name, Funktion, Telefon, E-Mail).</div> : fehler === "pflicht" ? <div className="alert alert-red mb-4">Bitte Mitarbeiter und E-Mail angeben.</div> : fehler === "berechtigung" ? <div className="alert alert-red mb-4">Nur der Systemadmin darf löschen.</div> : fehler && <div className="alert alert-red mb-4">{fehler}</div>}
      {rvEnde && rvEnde < new Date(heute.getTime() + k.erinnerungTageVorher * 86400000) && <div className={`alert ${rvEnde < heute ? "alert-red" : "alert-amber"} mb-4`}><span><strong>Rahmenvertrag {rvEnde < heute ? "abgelaufen" : "läuft aus"}:</strong> {datum(rvEnde)}{k.kuendigungsfrist && ` · Kündigungsfrist ${k.kuendigungsfrist}`} – Verlängerung klären.</span></div>}
      <div className="tabs mb-5 overflow-x-auto reveal">{TABS.map(([key, l]) => <Link key={key} href={`/kunden/${id}?tab=${key}`} className={`tab whitespace-nowrap ${tab === key ? "active" : ""}`}>{l}</Link>)}</div>

      {tab === "uebersicht" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <Kpi label={`Verrechnung ${jahr}`} value={eur(kc?.verrechnungJahr ?? 0, 0)} sub={`${ma.length} Mitarbeiter im Einsatz`} />
            <Kpi label={`${EL} ${jahr}`} value={prov && !c.kosten ? "–" : eur((prov ? kc?.provisionJahr : kc?.db1Jahr) ?? 0, 0)} tone={((prov ? kc?.provisionJahr : kc?.db1Jahr) ?? 0) < 0 ? "red" : "teal"} sub={prov ? "Deine Provision aus diesem Kunden" : `Marge ${pct(kc?.db1Marge ?? 0)}`} className="reveal-2" />
            <Kpi label="Offene Forderungen" value={eur(offen, 0)} tone={offen > 0 ? "amber" : undefined} sub={`Zahlungsziel ${k.zahlungszielTage} Tage`} className="reveal-3" />
            <Kpi label="Aktive Einsätze" value={k.einsaetze.filter((e) => e.status === "AKTIV").length} sub={`${k.angebote.filter((a) => a.status === "VERSENDET").length} offene Angebote`} className="reveal-4" />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Stammdaten" className="reveal">
              <Stat label="Kundennummer" value={k.kundennummer ?? "–"} /><Stat label="UID" value={k.uid ?? <span className="text-red">fehlt (Pflicht auf Rechnungen ab 10.000 €)</span>} />
              <Stat label="Rechnungs-E-Mail" value={k.rechnungsemail ?? k.email ?? "–"} />
              <Stat label="Hauptansprechpartner" value={haupt ? `${haupt.name}${haupt.funktion ? ` (${haupt.funktion})` : ""}` : "–"} />
              <Stat label="Rahmenvertrag" value={k.rahmenvertragBeginn || rvEnde ? `${datum(k.rahmenvertragBeginn)} – ${datum(rvEnde)}` : "–"} />
              <Stat label="Kündigungsfrist" value={k.kuendigungsfrist ?? "–"} />
              <Stat label="Skonto" value={k.skontoProzent ? `${k.skontoProzent} %` : "–"} />
              <Stat label="Kunde seit" value={datum(k.erstelltAm)} />
              <Stat label="Arbeitszeitmodell" value={k.arbeitszeitmodell ?? <span className="text-red">fehlt</span>} />
              <Stat label="WKO-Kollektivvertrag" value={k.kollektivvertrag ? `${k.kollektivvertrag} · bis ${datum(k.kvGueltigBis)}` : <span className="text-red">fehlt</span>} />
              {Array.isArray(k.erforderlicheQualifikationen) && (k.erforderlicheQualifikationen as string[]).length > 0 && <Stat label="Erforderliche Nachweise" value={(k.erforderlicheQualifikationen as string[]).join(", ")} />}
              <Stat label="Bewertung durch Mitarbeiter" value={avgVonMa ? <Fuechse n={avgVonMa} zahl /> : "–"} />
            </Card>
            <Card title="Bisherige und aktuelle Mitarbeiter" pad={false} className="reveal reveal-2">
              {k.einsaetze.length ? <table className="table"><thead><tr><th>Mitarbeiter</th><th>Rolle</th><th>Zeitraum</th><th>Status</th></tr></thead><tbody>{k.einsaetze.map((e) => <tr key={e.id}><td><Link href={`/personen/${e.personId}`} className="row-link">{e.person.vorname} {e.person.nachname}</Link></td><td>{e.rolleImEinsatz}</td><td>{datum(e.von)} – {e.bis ? datum(e.bis) : "laufend"}</td><td>{einsatzStatusBadge(e.status)}</td></tr>)}</tbody></table> : <Empty title="Noch kein Mitarbeiter im Einsatz" />}
            </Card>
            <Card title={`Verrechnung je Mitarbeiter (${jahr})`} pad={false} className="reveal reveal-2">
              {ma.length ? <table className="table"><thead><tr><th>Mitarbeiter</th><th className="r">Verrechnung</th><th className="r">{EL}</th></tr></thead><tbody>{ma.map((m) => <tr key={m.personId}><td><Link href={`/personen/${m.personId}`} className="row-link">{m.name}</Link></td><td className="r num">{eur(m.verrechnungJahr, 0)}</td><td className={`r num font-semibold ${(prov ? m.provisionJahr : m.db1Jahr) < 0 ? "text-red" : "text-teal"}`}>{prov && !c.kosten ? "–" : eur(prov ? m.provisionJahr : m.db1Jahr, 0)}</td></tr>)}</tbody></table> : <p className="text-muted text-[13px] p-5">Noch keine Verrechnung in {jahr}.</p>}
            </Card>
            <div className="space-y-4">
              {k.notizen && <Card title="Notizen" className="reveal reveal-3"><p className="whitespace-pre-wrap text-[13.5px]">{k.notizen}</p></Card>}
              <Card title="Letzte Bewertungen" className="reveal reveal-4">
                {k.bewertungen.length ? <ul className="divide-y divide-line">{k.bewertungen.slice(0, 4).map((b) => <li key={b.id} className="py-2 flex items-center gap-2 text-[13px]"><Fuechse n={b.sterne} size="text-[12px]" /><Link href={`/personen/${b.personId}`} className="font-semibold hover:text-brand">{b.person.vorname} {b.person.nachname}</Link><span className="text-muted ml-auto">{datum(b.datum)}</span></li>)}</ul> : <p className="text-muted text-[13px]">Noch keine Bewertungen.</p>}
              </Card>
            </div>
          </div>
          {sensibel && ma.length > 0 && (
            <Card title={`Monatsverlauf ${jahr}`} pad={false} className="mt-4 reveal">
              <div className="overflow-x-auto"><table className="table"><thead><tr><th>Mitarbeiter</th>{MONATE.map((m) => <th key={m} className="r">{m}</th>)}<th className="r">Jahr</th></tr></thead>
                <tbody>{ma.map((m) => <tr key={m.personId}><td className="font-semibold">{m.name}<div className="text-[11px] text-muted font-normal">{EL}</div></td>{m.monate.map((x) => <td key={x.monat} className={`r num text-[12.5px] ${x.db1 < 0 ? "text-red" : x.db1 > 0 ? "text-teal" : "text-muted"}`}>{x.verrechnung || x.grundlohn ? (prov && !c.kosten ? "–" : eur(prov ? x.provision : x.db1, 0)) : "·"}</td>)}<td className={`r num font-bold ${m.db1Jahr < 0 ? "text-red" : "text-teal"}`}>{prov && !c.kosten ? "–" : eur(prov ? m.provisionJahr : m.db1Jahr, 0)}</td></tr>)}</tbody></table></div>
            </Card>
          )}
        </>
      )}

      {tab === "matching" && (
        <>
          <Card className="mb-4 reveal">
            <form className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tab" value="matching" />
              <Field label="Gesuchte Rolle"><input name="rolle" defaultValue={rolle ?? k.konditionen[0]?.rolle ?? ""} className="input !w-64" list="kond-rollen" /><datalist id="kond-rollen">{k.konditionen.map((x) => <option key={x.id} value={x.rolle} />)}</datalist></Field>
              <button className="btn btn-primary"><Sparkles size={15} /> Vorschläge berechnen</button>
              <span className="help max-w-md">Bewertet Entfernung Wohnsitz → {k.ort ?? "Kunde"}, Rolle, geforderte Nachweise ({Array.isArray(k.erforderlicheQualifikationen) && (k.erforderlicheQualifikationen as string[]).length ? (k.erforderlicheQualifikationen as string[]).join(", ") : "keine hinterlegt"}), Bewertungen, Verfügbarkeit und Kranktage. Bewerber-Pool aller Kostenstellen + eigene Mitarbeiter mit auslaufendem Einsatz.</span>
            </form>
          </Card>
          <Card pad={false} className="reveal reveal-2">
            {vorschlaege.length ? (
              <table className="table"><thead><tr><th>#</th><th>Mitarbeiter</th><th>Wohnort</th><th className="r">Entfernung</th><th>Verfügbar</th><th>Bewertung</th><th>Passt, weil</th><th>Hinweise</th><th className="r">Score</th><th></th></tr></thead>
                <tbody>{vorschlaege.map((v, i) => <tr key={v.personId}><td className="text-muted">{i + 1}</td><td><Link href={`/personen/${v.personId}`} className="row-link">{v.name}</Link><div className="text-[12px] text-muted">{v.rolle ?? "–"} · {v.status === "SUCHT" ? "Pool" : "aktiv"}</div></td><td><span className="flex items-center gap-1 text-[13px]"><Pin size={12} className="text-muted" />{v.ort ?? "–"}</span></td><td className={`r num ${v.km != null && v.km > 60 ? "text-red" : ""}`}>{v.km != null ? `${v.kmGenau ? "" : "≈ "}${v.km} km` : "–"}</td><td>{v.verfuegbar}</td><td>{v.bewertung != null ? <span className="inline-flex items-center gap-1"><Fuechse n={v.bewertung} zahl /><span className="text-muted text-[12px]">({v.anzahlBewertungen})</span></span> : <span className="text-muted">–</span>}</td><td className="text-[12.5px]">{v.gruende.join(" · ")}</td><td className="text-[12.5px] text-red">{v.warnungen.join(" · ")}</td><td className="r"><span className={`badge ${v.score >= 60 ? "badge-teal" : v.score >= 30 ? "badge-brand" : "badge-grey"}`}>{v.score}</span></td><td className="r whitespace-nowrap"><Link href={`/mail/neu?personId=${v.personId}&kundeId=${id}&profil=1&vorlage=profil`} className="btn btn-ghost btn-sm">Profil senden</Link> <Link href={`/einsaetze/neu?personId=${v.personId}&kundeId=${id}&rolle=${encodeURIComponent(rolle ?? v.rolle ?? "")}`} className="btn btn-secondary btn-sm">Einsatz planen</Link></td></tr>)}</tbody></table>
            ) : <Empty title="Keine passenden Kandidaten" text="Bewerber-Pool ist leer oder alle Mitarbeiter sind gebunden. Entfernung wird über Wohnort/PLZ berechnet – bitte Adressen pflegen." />}
          </Card>
        </>
      )}

      {tab === "bewertungen" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Card title={<span>Kunde bewertet Mitarbeiter {avgAnMa && <span className="ml-2"><Fuechse n={avgAnMa} zahl /></span>}</span>} className="reveal">
              {k.bewertungen.length ? <ul className="divide-y divide-line">{k.bewertungen.map((b) => <li key={b.id} className="py-3 flex gap-3"><Fuechse n={b.sterne} /><div className="flex-1 min-w-0"><Link href={`/personen/${b.personId}`} className="font-semibold text-[13.5px] hover:text-brand">{b.person.vorname} {b.person.nachname}</Link><span className="text-muted text-[12px]"> · {datum(b.datum)} · {b.erfasstVon}</span>{b.kommentar && <p className="text-[13px] mt-0.5">{b.kommentar}</p>}</div>{b.wiedereinsatzEmpfohlen ? <Badge tone="teal">Wiedereinsatz</Badge> : <Badge tone="red">kein Wiedereinsatz</Badge>}</li>)}</ul> : <p className="text-muted text-[13px]">Noch keine Bewertungen vom Kunden.</p>}
            </Card>
            <Card title="Kunden um Bewertung bitten (Link per E-Mail)" className="reveal reveal-2">
              <form action={bewertungAnfragen.bind(null, id)} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <Field label="Mitarbeiter"><select name="personId" className="select">{[...new Map(k.einsaetze.map((e) => [e.personId, e.person])).values()].map((p) => <option key={p.id} value={p.id}>{p.vorname} {p.nachname}</option>)}</select></Field>
                <Field label="E-Mail des Ansprechpartners"><input name="an" type="email" defaultValue={mailFuer(k, "BEWERTUNG")} className="input" /></Field>
                <button className="btn btn-primary">Link senden</button>
              </form>
              {k.bewertungsAnfragen.length > 0 && <p className="help mt-3">Zuletzt: {k.bewertungsAnfragen.slice(0, 3).map((a) => `${a.person.vorname} ${a.person.nachname} an ${a.an} (${a.erledigtAm ? "beantwortet" : "offen"})`).join(" · ")}</p>}
            </Card>
          </div>
          <div className="space-y-4">
            <Card title={<span>Mitarbeiter bewerten den Kunden {avgVonMa && <span className="ml-2"><Fuechse n={avgVonMa} zahl /></span>}</span>} className="reveal">
              {k.kundenBewertungen.length ? <ul className="divide-y divide-line">{k.kundenBewertungen.map((b) => <li key={b.id} className="py-3 flex gap-3"><Fuechse n={b.sterne} /><div className="flex-1 min-w-0"><Link href={`/personen/${b.personId}`} className="font-semibold text-[13.5px] hover:text-brand">{b.person.vorname} {b.person.nachname}</Link><span className="text-muted text-[12px]"> · {datum(b.datum)} · {b.quelle === "PORTAL" ? "über Portal" : "intern erfasst"}</span><MerkmalChips merkmale={b.merkmale} />{b.kommentar && <p className="text-[13px] mt-0.5">{b.kommentar}</p>}</div>{b.wiederArbeiten ? <Badge tone="teal">würde wieder</Badge> : <Badge tone="red">nicht wieder</Badge>}</li>)}</ul> : <p className="text-muted text-[13px]">Noch keine Rückmeldungen von Mitarbeitern. Mitarbeiter können den Kunden auch selbst im Portal bewerten.</p>}
            </Card>
            <Card title="Rückmeldung eines Mitarbeiters erfassen" className="reveal reveal-2">
              <form action={kundenBewertungAnlegen.bind(null, id)} className="space-y-3">
                <Field label="Mitarbeiter"><select name="personId" className="select">{[...new Map(k.einsaetze.map((e) => [e.personId, e.person])).values()].map((p) => <option key={p.id} value={p.id}>{p.vorname} {p.nachname}</option>)}</select></Field>
                <BewertungFelder ziel="BESCHAEFTIGER" kompakt kommentarPlaceholder="Arbeitsklima, Einschulung, Sicherheit, Pünktlichkeit der Stundenbestätigung …" />
                <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="wieder" defaultChecked /> Würde dort wieder arbeiten</label>
                <button className="btn btn-primary w-full justify-center">Speichern</button>
              </form>
            </Card>
          </div>
        </div>
      )}

      {tab === "kontakte" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Ansprechpartner" pad={false} className="lg:col-span-2 reveal">
            {k.ansprechpartner.length ? <table className="table"><thead><tr><th>Name</th><th>Funktion</th><th>Anrede in Mails</th><th>Rollen</th><th>Telefon</th><th>E-Mail</th><th></th></tr></thead><tbody>{k.ansprechpartner.map((a) => <tr key={a.id}><td className="font-semibold">{a.name} {a.istHaupt && <Badge tone="fox">Haupt</Badge>}</td><td>{a.funktion}</td><td><form action={ansprechpartnerAnrede.bind(null, id, a.id)} className="flex gap-1 items-center"><select name="anrede" defaultValue={a.anrede ?? ""} className="select !w-[74px] !py-1 !px-1.5 text-[12px]"><option value="">–</option><option value="Herr">Herr</option><option value="Frau">Frau</option></select><select name="anredeDu" defaultValue={a.anredeDu == null ? "" : a.anredeDu ? "DU" : "SIE"} className="select !w-[104px] !py-1 !px-1.5 text-[12px]"><option value="">wie Kunde</option><option value="SIE">Sie</option><option value="DU">Du</option></select><button className="btn btn-ghost btn-sm !px-1.5" title="Anrede speichern">✓</button></form><div className="text-[11px] text-muted mt-0.5">{anredeZeile(a, k.anredeDu)}</div></td><td className="text-[12px]">{a.rollen.length ? a.rollen.map((r) => <span key={r} className="badge badge-brand mr-1 mb-1">{apRolleLabel(r)}</span>) : <span className="text-muted">–</span>}</td><td>{a.telefon}</td><td>{a.email}</td><td className="r whitespace-nowrap">{a.email && <Link href={`/mail/neu?kundeId=${id}&an=${encodeURIComponent(a.email)}&name=${encodeURIComponent(a.name)}`} className="btn btn-ghost btn-sm">E-Mail</Link>}<form action={ansprechpartnerLoeschen.bind(null, id, a.id)} className="inline"><button className="btn btn-ghost btn-sm text-red">Entfernen</button></form></td></tr>)}</tbody></table> : <Empty title="Keine Ansprechpartner" />}
          </Card>
          <Card title="Ansprechpartner hinzufügen" className="reveal reveal-2">
            <form id="ap-neu" action={ansprechpartnerAnlegen.bind(null, id)} className="space-y-3">
              <Field label="Name" required><input name="name" required className="input" /></Field>
              <Field label="Funktion" required><input name="funktion" required className="input" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Anrede"><select name="anrede" className="select"><option value="">–</option><option value="Herr">Herr</option><option value="Frau">Frau</option></select></Field>
                <Field label="Du oder Sie" help="leer = wie beim Kunden"><select name="anredeDu" className="select"><option value="">wie Kunde</option><option value="SIE">Sie</option><option value="DU">Du</option></select></Field>
              </div>
              <Field label="Telefon" required><input name="telefon" required className="input" /></Field>
              <Field label="E-Mail" required><input type="email" name="email" required className="input" /></Field>
              <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="istHaupt" /> Hauptansprechpartner</label>
              <Field label="Rollen" help="Steuert, wer Rechnungen, Stundennachweise, Dispo-Mails und Bewertungsanfragen bekommt."><div className="space-y-1 mt-1">{AP_ROLLEN.map(([r, l]) => <label key={r} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="rollen" value={r} /> {l}</label>)}</div></Field>
              <button className="btn btn-primary w-full justify-center">Speichern</button>
            </form>
          </Card>
        </div>
      )}

      {tab === "konditionen" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Angebote" pad={false} className="lg:col-span-2 reveal" actions={<Link href={`/angebote/neu?kundeId=${id}`} className="btn btn-primary btn-sm">Neues Angebot</Link>}>
            {k.angebote.length ? <table className="table"><thead><tr><th>Nummer</th><th>Datum</th><th>Betreff</th><th>Status</th></tr></thead><tbody>{k.angebote.map((a) => <tr key={a.id}><td><Link href={`/angebote/${a.id}`} className="row-link">{a.nummer}</Link></td><td>{datum(a.datum)}</td><td>{a.betreff}</td><td>{angebotStatusBadge(a.status)}</td></tr>)}</tbody></table> : <Empty title="Noch kein Angebot" text="Angebote werden immer beim Kunden erstellt. Wird ein Angebot angenommen, gelten seine Verrechnungssätze automatisch für Einsätze und Rechnungen." />}
          </Card>
          <Card title="Verrechnungssätze lt. angenommenen Angeboten" pad={false} className="reveal reveal-2">
            {k.konditionen.length ? <table className="table"><thead><tr><th>Rolle</th><th className="r">Satz €/Std</th><th className="r">Ü50 %</th><th className="r">Ü100 %</th></tr></thead><tbody>{k.konditionen.map((x) => <tr key={x.id}><td className="font-semibold">{x.rolle}</td><td className="r num">{eur(x.stundensatz)}</td><td className="r num">+{Math.round(x.ueberstundenZuschlag * 100)} %</td><td className="r num">+{Math.round(x.wochenendZuschlag * 100)} %</td></tr>)}</tbody></table> : <p className="p-5 text-[13px] text-muted">Noch kein angenommenes Angebot – Sätze erscheinen automatisch, sobald ein Angebot auf „Angenommen“ steht.</p>}
            <p className="help px-5 py-3">Überstundenzuschläge: 50 % → +35 %, 100 % → +70 % auf den Verrechnungssatz (lt. Angebotsvorlage).</p>
          </Card>
        </div>
      )}

      {tab === "einsaetze" && (
        <Card title="Einsätze" pad={false} className="reveal" actions={<Link href={`/einsaetze/neu?kundeId=${id}`} className="btn btn-secondary btn-sm">Einsatz planen</Link>}>
          {k.einsaetze.length ? <table className="table"><thead><tr><th>Mitarbeiter</th><th>Rolle</th><th>Zeitraum</th><th>Schicht</th><th>Status</th>{sensibel && <th className="r">Satz / Lohn</th>}</tr></thead><tbody>{k.einsaetze.map((e) => <tr key={e.id}><td><Link href={`/personen/${e.personId}`} className="row-link">{e.person.vorname} {e.person.nachname}</Link></td><td>{e.rolleImEinsatz}</td><td>{datum(e.von)} – {e.bis ? datum(e.bis) : "offen"}</td><td className="text-muted">{e.schichtmodell.replace("_", "-")} · {e.wochenstunden} h</td><td>{einsatzStatusBadge(e.status)}</td>{sensibel && <td className="r num">{eur(e.verrechnungssatz)} / {eur(e.stundenlohn)}</td>}</tr>)}</tbody></table> : <Empty title="Noch keine Einsätze" />}
        </Card>
      )}

      {tab === "angebote" && (
        <Card title="Rechnungen" pad={false} className="reveal">
          {!zentraleSicht ? <p className="p-5 text-[13px] text-muted">Rechnungen werden von Fox & People (Zentrale) erstellt und sind nur dort sichtbar.</p> : k.rechnungen.length ? <table className="table"><thead><tr><th>Nummer</th><th>Leistung</th><th>Fällig</th><th className="r">Brutto</th><th>Status</th></tr></thead><tbody>{k.rechnungen.map((r) => <tr key={r.id}><td><Link href={`/rechnungen/${r.id}`} className="row-link">{r.nummer}</Link></td><td>{MONATE[r.leistungMonat - 1]} {r.leistungJahr}</td><td>{datum(r.faelligAm)}</td><td className="r num">{eur(r.brutto)}</td><td>{rechnungStatusBadge(r.status)}</td></tr>)}</tbody></table> : <Empty title="Noch keine Rechnung" />}
        </Card>
      )}

      {tab === "uebernahmen" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Übernahmen ins Stammpersonal" pad={false} className="lg:col-span-2 reveal">
            {uebernahmen.length ? (
              <table className="table"><thead><tr><th>Mitarbeiter</th><th>Übernahme</th><th className="r">Monate</th><th className="r">Bruttojahresentgelt</th><th className="r">Honorar</th><th>Status</th><th></th></tr></thead>
                <tbody>{uebernahmen.map((u) => (
                  <tr key={u.id}>
                    <td><Link href={`/personen/${u.personId}`} className="row-link">{u.person.vorname} {u.person.nachname}</Link></td>
                    <td className="whitespace-nowrap">{datum(u.uebernahmeAm)}</td>
                    <td className="r num">{u.monateUeberlassen}</td>
                    <td className="r num">{eur(u.bruttojahresentgelt)}</td>
                    <td className="r num font-bold">{eur(u.honorar)}</td>
                    <td><Badge tone={u.status === "VERRECHNET" ? "teal" : u.status === "VERZICHTET" ? "grey" : "amber"}>{u.status === "VERRECHNET" ? "verrechnet" : u.status === "VERZICHTET" ? "kostenlos / Verzicht" : "offen"}</Badge></td>
                    <td className="r">{sensibel && <form action={uebernahmeStatus.bind(null, id, u.id)} className="flex gap-1 justify-end"><select name="status" defaultValue={u.status} className="select !py-1 !w-auto text-[12px]"><option value="OFFEN">offen</option><option value="VERRECHNET">verrechnet</option><option value="VERZICHTET">Verzicht</option></select><button className="btn btn-ghost btn-sm">Setzen</button></form>}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <Empty title="Keine Übernahme erfasst" text="Wenn der Beschäftiger einen überlassenen Mitarbeiter fix anstellt, wird hier der Aufwandsersatz nach AGB Punkt 6.1 berechnet." />}
            <div className="px-5 py-3 border-t border-line text-[12.5px] text-muted">Rechenregel: {(k.uebernahmeProzent * 100).toLocaleString("de-AT")} % des Bruttojahresentgelts, je vollem Überlassungsmonat −1/12, mindestens {eur(k.uebernahmeMindest)}; nach zwölf vollen Monaten kostenlos. Der Beschäftiger muss die Übernahme binnen zwei Wochen anzeigen – sonst das doppelte Honorar (AGB Punkt 6.2).</div>
          </Card>
          <div className="space-y-4">
            <Card title="Übernahme erfassen" className="reveal reveal-2">
              <form action={uebernahmeAnlegen.bind(null, id)} className="space-y-3">
                <Field label="Mitarbeiter" required><select name="personId" required className="select"><option value="">– wählen –</option>{[...new Map(k.einsaetze.map((e) => [e.personId, e])).values()].map((e) => <option key={e.personId} value={e.personId}>{e.person.nachname} {e.person.vorname}</option>)}</select></Field>
                <Field label="Übernahme mit" required><input type="date" name="uebernahmeAm" className="input" /></Field>
                <Field label="Bruttojahresentgelt (Vollzeit)" required help="Fixum + Überstundenpauschale + anteilige Sonderzahlungen + Durchschnitt Provisionen/Zulagen im ersten Jahr."><input name="bruttojahresentgelt" required className="input num" inputMode="decimal" placeholder="42000" /></Field>
                <Field label="Volle Überlassungsmonate" help="Leer = automatisch aus dem ersten Einsatz bei diesem Kunden."><input name="monateUeberlassen" className="input num" inputMode="numeric" /></Field>
                <Field label="Notiz"><input name="notiz" className="input" /></Field>
                <button className="btn btn-primary w-full justify-center">Honorar berechnen und erfassen</button>
              </form>
            </Card>
            <Card title="Kundenportal-Link senden" className="reveal reveal-3">
              <form action={portalLinkSenden.bind(null, id)} className="space-y-3">
                <Field label="An (E-Mail)" required><select name="an" required className="select">{k.ansprechpartner.map((a) => <option key={a.id} value={a.email ?? ""}>{a.name}{a.email ? ` · ${a.email}` : " · keine E-Mail"}</option>)}</select></Field>
                <Field label="Name des Empfängers"><input name="name" className="input" /></Field>
                <Field label="Wofür"><select name="zweck" defaultValue="BEIDES" className="select"><option value="BEIDES">Stundenfreigabe und Bewertung</option><option value="STUNDEN">nur Stundenfreigabe</option><option value="BEWERTUNG">nur Bewertung</option></select></Field>
                <div className="grid grid-cols-2 gap-3"><Field label="Jahr"><input name="jahr" className="input num" placeholder={String(new Date().getFullYear())} /></Field><Field label="KW"><input name="kw" className="input num" placeholder="letzte Woche" /></Field></div>
                <button className="btn btn-secondary w-full justify-center">Link senden</button>
              </form>
              <p className="help mt-2">Der Beschäftiger sieht ohne Login die gemeldeten Stunden seiner Mitarbeiter, gibt sie frei und kann eine Rückmeldung abgeben. Die Freigabe ersetzt die Unterschrift auf dem Stundenzettel (AGB Punkt 4.7).</p>
            </Card>
            <Card title="AGB" className="reveal reveal-3">
              <Stat label="Fassung" value={`${AGB_VERSION} (Stand ${AGB_STAND})`} />
              <Stat label="Beim Kunden akzeptiert" value={k.agbAkzeptiertAm ? `${datum(k.agbAkzeptiertAm)}${k.agbAkzeptiertVon ? ` · ${k.agbAkzeptiertVon}` : ""}${k.agbVersion ? ` · Fassung ${k.agbVersion}` : ""}` : <span className="text-red">nicht dokumentiert</span>} />
              <Stat label="Rahmenvertrag Pflicht" value={k.rahmenvertragPflicht ? "ja – vor dem ersten Einsatz" : "nein (Ausnahme)"} />
              <Stat label="Vermittlungshonorar" value={`${(k.vermittlungProzent * 100).toLocaleString("de-AT")} % des Bruttojahresentgelts`} />
              <div className="flex gap-2 mt-3">
                <a href={`/agb/ueberlassung?kunde=${id}`} target="_blank" className="btn btn-secondary btn-sm">AGB Überlassung</a>
                <a href={`/agb/vermittlung?kunde=${id}`} target="_blank" className="btn btn-secondary btn-sm">AGB Vermittlung</a>
              </div>
              <p className="help mt-2">Die AGB gehen bei jedem Rahmen-, Überlassungs- und Vermittlungsvertrag automatisch als Anhang mit.</p>
            </Card>
          </div>
        </div>
      )}

      {tab === "dokumente" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Dokumente" pad={false} className="lg:col-span-2 reveal">
            {k.dokumente.length ? <table className="table"><thead><tr><th>Dokument</th><th>Kategorie</th><th>Hochgeladen</th><th></th></tr></thead><tbody>{k.dokumente.map((d) => <tr key={d.id}><td className="font-semibold">{d.dateiname}</td><td><Badge tone="grey">{d.kategorie}</Badge></td><td className="text-muted">{datum(d.hochgeladenAm)} · {d.hochgeladenVon}</td><td className="r"><a href={`/dokumente/${d.id}`} className="btn btn-ghost btn-sm"><FileDown size={14} /> Öffnen</a>{s.rolle === "SYSTEMADMIN" && <form action={kundeDokumentLoeschen.bind(null, id, d.id)} className="inline ml-2"><button className="btn btn-ghost btn-sm text-red">Löschen</button></form>}</td></tr>)}</tbody></table> : <Empty title="Keine Dokumente" text="Rahmenverträge, AGB-Bestätigungen, Überlassungsverträge." />}
            {k.vertraege.length > 0 && <div className="px-5 py-3 border-t border-line text-[13px]">Verträge: {k.vertraege.map((v) => <Link key={v.id} href={`/vertraege/${v.id}`} className="text-brand font-semibold mr-3">{v.nummer}</Link>)}</div>}
          </Card>
          <Card title="Dokument hochladen" className="reveal reveal-2">
            <form action={kundeDokument.bind(null, id)} className="space-y-3" encType="multipart/form-data">
              <Field label="Datei" required><input type="file" name="datei" required className="input" /></Field>
              <Field label="Kategorie"><select name="kategorie" className="select">{["Rahmenvertrag", "AGB-Bestätigung", "Überlassungsvertrag", "Angebot", "Sonstiges"].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <button className="btn btn-primary w-full justify-center">Hochladen</button>
            </form>
          </Card>
        </div>
      )}

      {tab === "historie" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Kunden-Historie" className="lg:col-span-2 reveal">
            {k.aktivitaeten.length ? <ol className="relative border-l border-line ml-2">{k.aktivitaeten.map((a) => <li key={a.id} className="ml-5 pb-5 last:pb-0"><span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-brand border-2 border-surface" /><div className="text-[12px] text-muted">{datum(a.zeitpunkt)} · {a.nutzerName} · {a.typ}</div><div className="text-[13.5px]">{a.text}</div></li>)}</ol> : <Empty title="Noch keine Einträge" />}
          </Card>
          <Card title="Notiz / Kontakt festhalten" className="reveal reveal-2">
            <form action={kundeNotiz.bind(null, id)} className="space-y-3">
              <Field label="Typ"><select name="typ" className="select"><option value="NOTIZ">Notiz</option><option value="ANRUF">Telefonat</option><option value="EMAIL">E-Mail</option><option value="BESUCH">Besuch vor Ort</option></select></Field>
              <Field label="Text" required><textarea name="text" rows={4} required className="textarea" /></Field>
              <button className="btn btn-primary w-full justify-center">Speichern</button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
