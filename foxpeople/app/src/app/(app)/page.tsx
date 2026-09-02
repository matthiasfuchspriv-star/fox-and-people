import Link from "next/link";
import { requireSession, tenantWhere, istZentrale, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { controlling } from "@/lib/controlling";
import { erzeugeAufgabenGedrosselt } from "@/lib/aufgaben";
import { eur, pct, datum } from "@/lib/format";
import { Kpi, Card, Empty } from "@/components/ui";
import { MonatsChart } from "@/components/charts";
import { sollstundenMonat } from "@/lib/soll";
import { geburtstageDemnaechst } from "@/lib/geburtstage";
import { ergebnisSicht } from "@/lib/provision";
import { Cake } from "lucide-react";
import { ArrowUpRight, AlertTriangle, Trophy, TrendingDown } from "lucide-react";
import { after } from "next/server";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const jahr = Number(sp.jahr) || new Date().getFullYear();
  const where = tenantWhere(s);
  const prov = ergebnisSicht(s) === "PROVISION"; // Kostenstellen sehen Provision statt DB1
  const eigeneKst = where.kostenstelleId ? await db.kostenstelle.findUnique({ where: { id: where.kostenstelleId }, select: { name: true, provisionUeberlassung: true, provisionVermittlung: true } }) : null;
  const wert = (m: { db1Jahr: number; provisionJahr: number }) => (prov ? m.provisionJahr : m.db1Jahr);
  const EL = prov ? "Provision" : "DB1";
  // Erst ausliefern, dann nachziehen: der Lauf darf die Seite nicht aufhalten.
  after(() => erzeugeAufgabenGedrosselt());
  const heute0 = new Date();
  const [c, aufgaben, counts, offeneRechnungen, offeneAngebote, kostenstellen] = await Promise.all([
    controlling(jahr, where.kostenstelleId),
    db.aufgabe.findMany({ where: { ...where, erledigt: false }, orderBy: { faelligAm: "asc" }, take: 8, include: { person: true, kunde: true } }),
    Promise.all([
      db.person.count({ where: { ...where, status: "SUCHT" } }),
      db.person.count({ where: { ...where, status: "VERMITTELT" } }),
      db.person.count({ where: { ...where, status: "GESPERRT" } }),
      db.einsatz.count({ where: { ...where, status: "AKTIV" } }),
    ]),
    db.rechnung.aggregate({ where: { ...where, status: { in: ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"] } }, _sum: { brutto: true, bezahltBetrag: true }, _count: true }),
    db.angebot.count({ where: { ...where, status: "VERSENDET" } }),
    istZentrale(s) && !where.kostenstelleId ? db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: { isZentrale: "desc" } }) : Promise.resolve([]),
  ]);
  const [pool, aktiv, gesperrt, einsaetze] = counts;
  const [soll, istStunden, geburtstage, ams] = await Promise.all([
    sollstundenMonat(heute0.getFullYear(), heute0.getMonth() + 1, where.kostenstelleId),
    db.monatsabrechnung.aggregate({ where: { ...where, jahr: heute0.getFullYear(), monat: heute0.getMonth() + 1 }, _sum: { stunden: true } }),
    geburtstageDemnaechst(where.kostenstelleId, 14),
    db.person.aggregate({ where: { ...where, status: "VERMITTELT", amsGefoerdert: true }, _sum: { amsFoerderungBetrag: true }, _count: true }),
  ]);
  const belege = prov && where.kostenstelleId ? await db.provisionsabrechnung.findMany({ where: { kostenstelleId: where.kostenstelleId, status: { in: ["FREIGEGEBEN", "AUSBEZAHLT"] } }, orderBy: [{ jahr: "desc" }, { monat: "desc" }], take: 6 }) : [];
  const ohneKosten = prov && !c.kosten; // Zentrale hat noch keine Controlling-Kosten hinterlegt → keine Provision anzeigen
  const eurP = (v: number, d = 0) => (ohneKosten ? "–" : eur(v, d));
  const top = [...c.mitarbeiter].sort((a, b) => wert(b) - wert(a)).slice(0, 5);
  const verlust = c.mitarbeiter.filter((m) => wert(m) < 0).sort((a, b) => wert(a) - wert(b)).slice(0, 5);
  const heute = new Date();
  const offenSumme = (offeneRechnungen._sum.brutto ?? 0) - (offeneRechnungen._sum.bezahltBetrag ?? 0);

  // Kostenstellen-Vergleich (nur Zentrale, alle KSt)
  const kstVergleich = kostenstellen.length ? await Promise.all(kostenstellen.map(async (k) => ({ k, c: await controlling(jahr, k.id) }))) : [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6 reveal">
        <div>
          <p className="section-title mb-1">Personalcontrolling · Geschäftsjahr {jahr}</p>
          <h1 className="page-title">Guten Tag, {s.name.split(" ")[0]}.</h1>
          <p className="page-sub">{prov ? `${eigeneKst?.name ?? "Kostenstelle"}: Verrechnung und Provision – automatisch aus der Monatsabrechnung.` : `${where.kostenstelleId ? "Kennzahlen der gewählten Kostenstelle" : "Kennzahlen über alle Kostenstellen"} – Verrechnung, Rückstellungen und DB1 automatisch aus der Monatsabrechnung.`}</p>
        </div>
        <form className="flex items-center gap-2">
          <select name="jahr" defaultValue={jahr} className="select !w-auto !py-1.5">
            {[jahr - 2, jahr - 1, jahr, jahr + 1].map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm">Anzeigen</button>
        </form>
      </div>

      {ohneKosten && <div className="alert alert-amber mb-4"><span><strong>Provision noch nicht verfügbar:</strong> Die Zentrale hat die Controlling-Kosten für {jahr} noch nicht hinterlegt. Sobald das erledigt ist, erscheint hier deine Provision.</span></div>}
      {prov ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <Kpi label="Verrechnung (Jahr)" value={eur(c.gesamt.umsatz, 0)} sub={`${c.gesamt.anzahlMitarbeiter} Mitarbeiter in Abrechnung`} />
          <Kpi label="Provision Überlassung" value={eurP(c.gesamt.provisionUeberlassung)} tone={ohneKosten ? undefined : c.gesamt.provisionUeberlassung >= 0 ? "teal" : "red"} sub="Anteil je überlassenem Mitarbeiter" className="reveal-2" />
          <Kpi label="Provision Vermittlung" value={eurP(c.gesamt.provisionVermittlung)} tone={ohneKosten ? undefined : "teal"} sub="Anteil am Vermittlungshonorar" className="reveal-3" />
          <Kpi label="Provision gesamt (Jahr)" value={eurP(c.gesamt.provision)} tone={ohneKosten ? undefined : c.gesamt.provision >= 0 ? "fox" : "red"} sub={ohneKosten ? "wartet auf Controlling-Kosten" : `Ø ${eur(c.gesamt.anzahlMitarbeiter ? c.gesamt.provision / c.gesamt.anzahlMitarbeiter : 0, 0)} je Mitarbeiter`} className="reveal-4" />
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
          <Kpi label="Gesamtumsatz (Jahr)" value={eur(c.gesamt.umsatz, 0)} sub={`Ø ${eur(c.gesamt.anzahlMitarbeiter ? c.gesamt.umsatz / c.gesamt.anzahlMitarbeiter : 0, 0)} je Mitarbeiter`} />
          <Kpi label="Selbstkosten (Jahr)" value={eur(c.gesamt.selbstkosten, 0)} sub={`Personalkostenquote ${pct(c.gesamt.personalkostenquote)}`} className="reveal-2" />
          <Kpi label="DG-Abgaben" value={eur(c.gesamt.abgaben, 0)} sub={`Quote ${pct(c.gesamt.abgabenquote)}`} className="reveal-3" />
          <Kpi label="DB1 gesamt (Jahr)" value={eur(c.gesamt.db1, 0)} tone={c.gesamt.db1 >= 0 ? "teal" : "red"} sub={`Ø ${eur(c.gesamt.anzahlMitarbeiter ? c.gesamt.db1 / c.gesamt.anzahlMitarbeiter : 0, 0)} je Mitarbeiter`} className="reveal-4" />
          <Kpi label="DB2 (nach Kostenumlage)" value={c.kosten ? eur(c.gesamt.db2, 0) : "–"} tone={c.kosten ? (c.gesamt.db2 >= 0 ? "teal" : "red") : undefined} sub={c.kosten ? <span>Umlage {eur(c.gesamt.kostenUmlage, 0)} · <Link href="/controlling" className="text-brand">Controlling</Link></span> : <Link href="/controlling" className="text-brand font-semibold">Kosten hinterlegen</Link>} className="reveal-4" />
          <Kpi label="Ø DB1-Marge" value={pct(c.gesamt.marge)} tone={c.gesamt.marge >= 0 ? "teal" : "red"} sub={c.gesamt.imMinus ? <span className="text-red font-semibold">{c.gesamt.imMinus} Mitarbeiter im Minus</span> : "Kein Mitarbeiter im Minus"} className="reveal-4" />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card title={`Monatsentwicklung ${jahr}`} className="lg:col-span-2 reveal">
          {c.gesamt.umsatz ? <MonatsChart provision={prov} data={c.monatsreihe.filter((m, i) => i <= Math.max(...c.monatsreihe.map((x, j) => (x.umsatz || x.selbstkosten ? j : -1))))} /> : <Empty title="Noch keine Monatswerte" text={prov ? "Erfasse Verrechnung und Bruttolohn in der Monatsabrechnung – deine Provision wird automatisch berechnet." : "Erfasse Verrechnung und Bruttolohn in der Monatsabrechnung – Rückstellungen und DB1 werden automatisch berechnet."} action={<Link href="/abrechnung" className="btn btn-primary btn-sm">Zur Monatsabrechnung</Link>} />}
        </Card>
        <Card title="Heute im Blick" className="reveal reveal-2">
          <div className="grid grid-cols-2 gap-3">
            <Mini href="/personen?status=SUCHT" label="Bewerber-Pool" value={pool} />
            <Mini href="/personen?status=VERMITTELT" label="Aktive Mitarbeiter" value={aktiv} />
            <Mini href="/einsaetze" label="Laufende Einsätze" value={einsaetze} />
            <Mini href="/personen?status=GESPERRT" label="Sperrliste" value={gesperrt} tone="red" />
            <Mini href="/angebote?status=VERSENDET" label="Offene Angebote" value={offeneAngebote} />
            <Mini href="/rechnungen?status=offen" label="Offene Forderungen" value={eur(offenSumme, 0)} tone={offenSumme > 0 ? "amber" : undefined} small />
            <Mini href="/einsaetze?ansicht=monat" label="Sollstunden Monat" value={`${soll.soll.toLocaleString("de-AT")} h`} small />
            {darfSensibel(s) && <Mini href="/personen?status=VERMITTELT" label={`AMS-Förderungen (${ams._count} MA)`} value={`${eur(ams._sum.amsFoerderungBetrag ?? 0, 0)}/Mon.`} tone={ams._count ? "teal" : undefined} small />}
            <Mini href="/abrechnung" label="Ist-Stunden erfasst" value={`${Math.round(istStunden._sum.stunden ?? 0).toLocaleString("de-AT")} h`} small />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card title={<span className="flex items-center gap-2"><Trophy size={15} className="text-fox" /> Top-Performer nach {EL}</span>} className="reveal">
          <Ranking rows={top} prov={prov} ohneKosten={ohneKosten} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><TrendingDown size={15} className="text-red" /> Verlustbringer (negativ{prov ? "e Provision" : "er DB1"})</span>} className="reveal reveal-2">
          {verlust.length ? <Ranking rows={verlust} neg prov={prov} ohneKosten={ohneKosten} /> : <p className="text-muted text-[13px] py-4">Kein Mitarbeiter mit negativ{prov ? "er Provision" : "em DB1"} in {jahr}. 👍</p>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><AlertTriangle size={15} className="text-amber" /> Wiedervorlagen</span>} actions={<Link href="/aufgaben" className="text-[12.5px] font-semibold text-brand flex items-center gap-1">Alle <ArrowUpRight size={13} /></Link>} className="reveal reveal-3">
          {aufgaben.length ? (
            <ul className="divide-y divide-line">
              {aufgaben.map((a) => {
                const ueberfaellig = a.faelligAm < heute;
                return (
                  <li key={a.id} className="py-2.5 flex items-start gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${ueberfaellig ? "bg-red" : "bg-amber"}`} />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium leading-snug truncate">{a.titel}</div>
                      <div className="text-[12px] text-muted">{ueberfaellig ? "überfällig seit" : "fällig am"} {datum(a.faelligAm)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-muted text-[13px] py-4">Nichts offen – alle Nachweise, Verträge und Rechnungen sind im grünen Bereich.</p>}
        </Card>
      </div>

      {prov && (
        <Card title="Provisionsbelege (freigegeben)" pad={false} className="mb-6 reveal">
          {belege.length ? <table className="table"><thead><tr><th>Monat</th><th className="r">Verrechnung</th><th className="r">Provision</th><th>Status</th><th></th></tr></thead><tbody>{belege.map((b) => <tr key={b.id}><td className="font-semibold">{String(b.monat).padStart(2, "0")}/{b.jahr}</td><td className="r num">{eur(b.verrechnung, 0)}</td><td className="r num font-bold text-teal">{eur(b.betrag)}</td><td>{b.status === "AUSBEZAHLT" ? <span className="badge badge-brand">ausbezahlt {datum(b.ausbezahltAm)}</span> : <span className="badge badge-teal">freigegeben {datum(b.freigegebenAm)}</span>}</td><td className="r"><a href={`/controlling/provision/${b.id}/pdf`} className="btn btn-ghost btn-sm">PDF</a></td></tr>)}</tbody></table> : <p className="text-muted text-[13px] p-5">Noch kein freigegebener Provisionsbeleg – die Zentrale gibt die Belege monatlich frei.</p>}
        </Card>
      )}
      {geburtstage.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><Cake size={15} className="text-fox" /> Geburtstage in den nächsten 14 Tagen</span>} actions={<Link href="/personen/geburtstage" className="text-[12.5px] font-semibold text-brand flex items-center gap-1">Liste <ArrowUpRight size={13} /></Link>} className="mb-6 reveal">
          <div className="flex flex-wrap gap-2">{geburtstage.map((g) => <Link key={g.id} href={`/personen/${g.id}`} className="badge badge-fox !py-1.5">{g.name} · {g.datumText}{g.heute ? " · heute!" : ""} · wird {g.wird}</Link>)}</div>
        </Card>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={`Kunden-Ranking nach ${EL}`} pad={false} className="reveal">
          {c.kunden.length ? (
            <table className="table">
              <thead><tr><th>#</th><th>Kunde</th><th className="r">Verrechnung</th><th className="r">{EL}</th>{!prov && <th className="r">Marge</th>}</tr></thead>
              <tbody>
                {[...c.kunden].sort((a, b) => wert(b) - wert(a)).map((k, i) => (
                  <tr key={k.kundeId}>
                    <td className="text-muted">{i + 1}</td>
                    <td><Link href={`/kunden/${k.kundeId}`} className="row-link">{k.kunde}</Link><div className="text-[12px] text-muted">{k.anzahlMitarbeiter} Mitarbeiter</div></td>
                    <td className="r num">{eur(k.verrechnungJahr, 0)}</td>
                    <td className={`r num font-semibold ${wert(k) < 0 ? "text-red" : "text-teal"}`}>{eurP(wert(k))}</td>
                    {!prov && <td className="r num">{pct(k.db1Marge)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty title="Noch keine Kundenauswertung" />}
        </Card>
        {kstVergleich.length > 0 ? (
          <Card title="Kostenstellen im Vergleich" pad={false} className="reveal reveal-2">
            <table className="table">
              <thead><tr><th>Kostenstelle</th><th className="r">Umsatz</th><th className="r">DB1</th><th className="r">Marge</th><th className="r">DB2</th><th className="r">Provision KSt</th><th className="r">MA</th></tr></thead>
              <tbody>
                {kstVergleich.map(({ k, c: kc }) => (
                  <tr key={k.id}>
                    <td className="font-semibold">{k.name} {k.isZentrale && <span className="badge badge-fox ml-1">Zentrale</span>}</td>
                    <td className="r num">{eur(kc.gesamt.umsatz, 0)}</td>
                    <td className={`r num font-semibold ${kc.gesamt.db1 < 0 ? "text-red" : "text-teal"}`}>{eur(kc.gesamt.db1, 0)}</td>
                    <td className="r num">{pct(kc.gesamt.marge)}</td>
                    <td className={`r num ${kc.gesamt.db2 < 0 ? "text-red" : ""}`}>{kc.kosten ? eur(kc.gesamt.db2, 0) : "–"}</td>
                    <td className="r num">{k.isZentrale || !kc.kosten ? <span className="text-muted">–</span> : <span title={`${k.provisionUeberlassung} % Überlassung · ${k.provisionVermittlung} % Vermittlung – vom DB2`}>{eur(kc.gesamt.provision, 0)}</span>}</td>
                    <td className="r num">{kc.gesamt.anzahlMitarbeiter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card title="Mitarbeiter-Auswertung" pad={false} className="reveal reveal-2">
            <table className="table">
              <thead><tr><th>Mitarbeiter</th><th>Kunde</th><th className="r">Verrechnung</th><th className="r">{EL}</th>{!prov && <th className="r">Marge</th>}</tr></thead>
              <tbody>
                {[...c.mitarbeiter].sort((a, b) => wert(b) - wert(a)).slice(0, 8).map((m) => (
                  <tr key={m.personId + m.kundeId}>
                    <td><Link href={`/personen/${m.personId}`} className="row-link">{m.name}</Link></td>
                    <td className="text-muted">{m.kunde}</td>
                    <td className="r num">{eur(m.verrechnungJahr, 0)}</td>
                    <td className={`r num font-semibold ${wert(m) < 0 ? "text-red" : "text-teal"}`}>{eurP(wert(m))}{m.art === "DIREKTVERMITTLUNG" && <span className="badge badge-fox ml-1">Vermittlung</span>}</td>
                    {!prov && <td className="r num">{pct(m.db1Marge)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}

function Mini({ href, label, value, tone, small }: { href: string; label: string; value: React.ReactNode; tone?: "red" | "amber" | "teal"; small?: boolean }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-surface-2 p-3 hover:border-brand/40 transition-colors">
      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</div>
      <div className={`num font-extrabold ${small ? "text-[18px]" : "text-[24px]"} mt-0.5 ${tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : tone === "teal" ? "text-teal" : ""}`}>{value}</div>
    </Link>
  );
}

function Ranking({ rows, neg, prov, ohneKosten }: { rows: { personId: string; name: string; kunde: string; db1Jahr: number; db1Marge: number; provisionJahr: number; provisionPct: number; art: string }[]; neg?: boolean; prov?: boolean; ohneKosten?: boolean }) {
  if (!rows.length) return <p className="text-muted text-[13px] py-4">Noch keine Werte.</p>;
  return (
    <ol className="divide-y divide-line">
      {rows.map((m, i) => (
        <li key={m.personId + m.kunde} className="py-2.5 flex items-center gap-3">
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[12px] font-bold ${neg ? "bg-red-soft text-red" : i === 0 ? "bg-fox-soft text-fox" : "bg-brand-soft text-brand"}`}>{i + 1}</span>
          <div className="min-w-0 flex-1">
            <Link href={`/personen/${m.personId}`} className="font-semibold text-[13.5px] hover:text-brand truncate block">{m.name}</Link>
            <div className="text-[12px] text-muted truncate">{m.kunde}</div>
          </div>
          <div className="text-right">
            <div className={`num font-bold ${(prov ? m.provisionJahr : m.db1Jahr) < 0 ? "text-red" : "text-teal"}`}>{ohneKosten ? "–" : eur(prov ? m.provisionJahr : m.db1Jahr, 0)}</div>
            <div className="text-[11.5px] text-muted num">{prov ? (m.art === "DIREKTVERMITTLUNG" ? "Vermittlung" : "Überlassung") : pct(m.db1Marge)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
