import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { requireSession, tenantWhere, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { datum, eur, MONATE_LANG } from "@/lib/format";
import { PageHeader, Card, Empty, einsatzStatusBadge } from "@/components/ui";
import { wochenImMonat, arbeitstageKw } from "@/lib/wochen";
import { wochenSpeichern } from "./actions";
import { tagesstatus, tageDerKw, feiertageAT } from "@/lib/wochen";
const TAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
import { sollstundenMonat } from "@/lib/soll";
import { WocheFuellen } from "@/components/wochen-fuellen";

/** Indizes 0–6 der Feiertage einer Kalenderwoche – der Sammelklick lässt sie aus. */
function feiertagIndizes(jahr: number, kw: number): number[] {
  return tageDerKw(jahr, kw).flatMap((d, i) => (feiertageAT(d.getUTCFullYear()).has(d.toISOString().slice(0, 10)) ? [i] : []));
}

export const dynamic = "force-dynamic";

export default async function EinsaetzePage({ searchParams }: { searchParams: Promise<{ monat?: string; ansicht?: string; kundeId?: string; status?: string; gespeichert?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const heute = new Date();
  const [jahr, monat] = (sp.monat ?? `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);
  const ansicht = sp.ansicht ?? "monat";
  const start = new Date(Date.UTC(jahr, monat - 1, 1));
  const ende = new Date(Date.UTC(jahr, monat, 0));
  const tage = ende.getUTCDate();
  const where = { ...tenantWhere(s), ...(sp.kundeId ? { kundeId: sp.kundeId } : {}), ...(sp.status ? { status: sp.status as "AKTIV" } : {}) };
  const wochen = wochenImMonat(jahr, monat);
  const [personenMonat, wochenstatus, soll] = await Promise.all([
    db.person.findMany({ where: { ...tenantWhere(s), OR: [{ status: "VERMITTELT" }, { einsaetze: { some: { von: { lte: ende }, OR: [{ bis: null }, { bis: { gte: start } }] } } }] }, orderBy: [{ nachname: "asc" }], include: { einsaetze: { where: { status: { in: ["AKTIV", "GEPLANT"] }, von: { lte: ende }, OR: [{ bis: null }, { bis: { gte: start } }] }, include: { kunde: { select: { kurzname: true, firmenname: true } } } } } }),
    db.wochenstatus.findMany({ where: { OR: wochen.map((w) => ({ jahr: w.jahr, kw: w.kw })) } }),
    sollstundenMonat(jahr, monat, tenantWhere(s).kostenstelleId),
  ]);
  const [einsaetze, kunden] = await Promise.all([
    db.einsatz.findMany({ where: { ...where, von: { lte: ende }, OR: [{ bis: null }, { bis: { gte: start } }] }, include: { person: { include: { qualifikationen: true } }, kunde: true }, orderBy: [{ kunde: { firmenname: "asc" } }, { von: "asc" }] }),
    db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, select: { id: true, firmenname: true } }),
  ]);
  const prev = new Date(Date.UTC(jahr, monat - 2, 1)); const next = new Date(Date.UTC(jahr, monat, 1));
  const mk = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const q = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.fromEntries(Object.entries({ monat: `${jahr}-${String(monat).padStart(2, "0")}`, ansicht, kundeId: sp.kundeId, status: sp.status, ...o }).filter(([, v]) => v)) as Record<string, string>).toString();
  const sensibel = darfSensibel(s);
  const byKunde = new Map<string, typeof einsaetze>();
  for (const e of einsaetze) { if (!byKunde.has(e.kundeId)) byKunde.set(e.kundeId, []); byKunde.get(e.kundeId)!.push(e); }
  // Konflikte: Doppelbuchungen im Monat
  const perPerson = new Map<string, typeof einsaetze>();
  for (const e of einsaetze) { if (!perPerson.has(e.personId)) perPerson.set(e.personId, []); perPerson.get(e.personId)!.push(e); }
  const doppelt = new Set<string>();
  for (const [, list] of perPerson) if (list.filter((e) => e.status !== "BEENDET" && e.status !== "ABGEBROCHEN").length > 1) list.forEach((e) => doppelt.add(e.id));
  const abgelaufeneQuali = (e: (typeof einsaetze)[number]) => e.person.qualifikationen.some((qu) => qu.gultigBis && qu.gultigBis < heute);

  return (
    <>
      <PageHeader title="Einsatzplanung" sub="Wer ist wann bei welchem Kunden – mit Konfliktprüfung für Doppelbuchungen, abgelaufene Nachweise und Verfügbarkeit." actions={<Link href="/einsaetze/neu" className="btn btn-primary"><Plus size={16} /> Einsatz planen</Link>} />
      <div className="flex flex-wrap items-center gap-2 mb-4 reveal">
        <div className="flex items-center gap-1 bg-surface border border-line rounded-[10px] p-0.5 shadow-[var(--shadow-sm)]">
          <Link href={q({ monat: mk(prev) })} className="btn btn-ghost btn-sm"><ChevronLeft size={16} /></Link>
          <span className="font-display font-bold px-2 min-w-[150px] text-center">{MONATE_LANG[monat - 1]} {jahr}</span>
          <Link href={q({ monat: mk(next) })} className="btn btn-ghost btn-sm"><ChevronRight size={16} /></Link>
        </div>
        <div className="seg">
          <Link href={q({ ansicht: "monat" })} className={`chip-filter ${ansicht === "monat" ? "active" : ""}`}>Monatsübersicht</Link>
          <Link href={q({ ansicht: "board" })} className={`chip-filter ${ansicht === "board" ? "active" : ""}`}>Board</Link>
          <Link href={q({ ansicht: "timeline" })} className={`chip-filter ${ansicht === "timeline" ? "active" : ""}`}>Kalender</Link>
          <Link href={q({ ansicht: "liste" })} className={`chip-filter ${ansicht === "liste" ? "active" : ""}`}>Liste</Link>
        </div>
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="monat" value={`${jahr}-${String(monat).padStart(2, "0")}`} /><input type="hidden" name="ansicht" value={ansicht} />
          <select name="kundeId" defaultValue={sp.kundeId ?? ""} className="select !w-56 !py-1.5"><option value="">Alle Kunden</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? ""} className="select !w-36 !py-1.5"><option value="">Alle Status</option><option value="GEPLANT">Geplant</option><option value="AKTIV">Aktiv</option><option value="BEENDET">Beendet</option></select>
          <button className="btn btn-secondary btn-sm">Filtern</button>
        </form>
      </div>

      {ansicht === "monat" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <div className="kpi reveal"><div className="label">Sollstunden {MONATE_LANG[monat - 1]}</div><div className="value">{soll.soll.toLocaleString("de-AT")} h</div><div className="sub">aus {soll.arbeitsWochen} Arbeitswochen (X) · Mo–Fr ohne Feiertage</div></div>
            <div className="kpi reveal reveal-2"><div className="label">Mitarbeiter im Raster</div><div className="value">{personenMonat.length}</div><div className="sub">{wochen.length} Kalenderwochen</div></div>
            <div className="kpi reveal reveal-3"><div className="label">Krank (K)</div><div className={`value ${soll.krankTage > 0 ? "text-red" : ""}`}>{soll.krankTage} <span className="text-[17px] text-muted">Tage</span></div></div>
            <div className="kpi reveal reveal-4"><div className="label">Urlaub (U)</div><div className="value">{soll.urlaubTage} <span className="text-[17px] text-muted">Tage</span></div></div>
          </div>
          {sp.gespeichert && <div className="alert alert-teal mb-4">{sp.gespeichert} Wochen gespeichert – K/U-Wochen wurden als Abwesenheit übernommen.</div>}
          <Card pad={false} className="reveal reveal-2">
            {personenMonat.length === 0 ? <Empty title="Keine aktiven Mitarbeiter" /> : (
              <form action={wochenSpeichern.bind(null, jahr, monat)}>
                <div className="overflow-x-auto"><table className="table">
                  <thead><tr><th>Mitarbeiter</th><th>Kunde</th>{wochen.map((w) => <th key={`${w.jahr}-${w.kw}`} className="text-center">KW {w.kw}<div className="font-normal normal-case tracking-normal text-[11px]">{w.von.getUTCDate()}.–{w.bis.getUTCDate()}. · {arbeitstageKw(w.jahr, w.kw, { jahr, monat })} AT</div><div className="mt-1"><WocheFuellen praefix={`wt_`} spalte={`_${w.jahr}_${w.kw}_`} feiertage={feiertagIndizes(w.jahr, w.kw)} titel={`KW ${w.kw}: alle Mitarbeiter Mo–Fr auf X setzen`} /></div></th>)}<th className="r">Soll h</th></tr></thead>
                  <tbody>{personenMonat.map((p) => {
                    const sollP = soll.jePerson.find((x) => x.personId === p.id);
                    return (
                      <tr key={p.id}>
                        <td><Link href={`/personen/${p.id}`} className="row-link">{p.nachname} {p.vorname}</Link><div className="text-[12.5px] text-muted">{p.standardrolle} · {p.wochenstunden ?? 38.5} h/Wo</div></td>
                        <td className="text-[12.5px]">{[...new Set(p.einsaetze.map((e) => e.kunde.kurzname ?? e.kunde.firmenname))].join(", ") || <span className="text-muted">kein Einsatz</span>}</td>
                        {wochen.map((w) => {
                          const ws = wochenstatus.find((x) => x.personId === p.id && x.jahr === w.jahr && x.kw === w.kw);
                          const tg = tagesstatus(ws); const daten = tageDerKw(w.jahr, w.kw);
                          const farbe = (v: string) => v === "X" ? "!bg-teal-soft !text-teal" : v === "K" ? "!bg-red-soft !text-red" : v === "U" ? "!bg-brand-soft" : v === "Z" ? "!bg-amber-soft" : "";
                          return <td key={`${w.jahr}-${w.kw}`} className="text-center"><div className="flex gap-0.5 justify-center">{daten.map((d, i) => { const imMonat = d.getUTCFullYear() === jahr && d.getUTCMonth() + 1 === monat; const ft = feiertageAT(d.getUTCFullYear()).has(d.toISOString().slice(0, 10)); return (
                            <label key={i} className={`flex flex-col items-center ${imMonat ? "" : "opacity-35"}`} title={`${TAGE_KURZ[i]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.${ft ? " (Feiertag)" : ""}`}>
                              <span className={`text-[11px] leading-none mb-0.5 ${ft ? "text-red font-bold" : "text-muted"}`}>{TAGE_KURZ[i]}</span>
                              <select name={`wt_${p.id}_${w.jahr}_${w.kw}_${i}`} defaultValue={tg[i] === "-" ? "" : tg[i]} className={`select !w-9 !px-0 !py-0.5 text-center font-display font-bold text-[12.5px] ${farbe(tg[i])}`}><option value="">–</option><option value="X">X</option><option value="K">K</option><option value="U">U</option><option value="Z">Z</option><option value="F">F</option></select>
                            </label>); })}</div><div className="mt-0.5"><WocheFuellen praefix={`wt_${p.id}_${w.jahr}_${w.kw}_`} feiertage={feiertagIndizes(w.jahr, w.kw)} /></div></td>;
                        })}
                        <td className="r num font-semibold">{sollP ? Math.round(sollP.soll) : 0}</td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
                <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-line"><button className="btn btn-primary">Monat speichern</button><span className="help">Je Tag: <b>X</b> arbeitet · <b>K</b> krank · <b>U</b> Urlaub · <b>Z</b> Zeitausgleich · <b>F</b> frei. Soll = X-Tage im Monat × Tagesstunden (Wochenstunden ÷ 5), Feiertage (rot) zählen nicht. K/U/Z-Tage werden als Abwesenheit übernommen; die Sollstunden fließen als Vorschlag in die Monatsabrechnung.</span></div>
              </form>
            )}
          </Card>
        </>
      )}

      {ansicht !== "monat" && einsaetze.length === 0 && <Card><Empty title="Keine Einsätze in diesem Monat" action={<Link href="/einsaetze/neu" className="btn btn-primary btn-sm">Einsatz planen</Link>} /></Card>}

      {ansicht === "board" && einsaetze.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4 reveal reveal-2">
          {[...byKunde.entries()].map(([kid, list]) => (
            <div key={kid} className="min-w-[300px] w-[300px] shrink-0">
              <div className="flex items-center justify-between mb-2 px-1"><Link href={`/kunden/${kid}`} className="font-display font-bold hover:text-brand truncate">{list[0].kunde.firmenname}</Link><span className="badge badge-grey">{list.length}</span></div>
              <div className="space-y-2">
                {list.map((e) => {
                  const warn = doppelt.has(e.id) || abgelaufeneQuali(e);
                  return (
                    <Link key={e.id} href={`/einsaetze/${e.id}`} className={`block card p-3 hover:shadow transition-shadow border-l-4 ${e.status === "AKTIV" ? "border-l-teal" : e.status === "GEPLANT" ? "border-l-brand" : "border-l-line-2"} ${warn ? "!border-l-red" : ""}`}>
                      <div className="flex items-start justify-between gap-2"><div className="font-semibold text-[14px]">{e.person.vorname} {e.person.nachname}</div>{einsatzStatusBadge(e.status)}</div>
                      <div className="text-[12.5px] text-muted mt-0.5">{e.rolleImEinsatz} · {e.schichtmodell === "TAG" ? "Tag" : e.schichtmodell.replace("_SCHICHT", "-Schicht")} · {e.wochenstunden} h</div>
                      <div className="text-[12.5px] text-muted mt-1">{datum(e.von)} – {e.bis ? datum(e.bis) : "offen"}</div>
                      {sensibel && e.verrechnungssatz && <div className="text-[12.5px] mt-1 num"><span className="text-muted">Satz</span> <b>{eur(e.verrechnungssatz)}</b>{e.stundenlohn && <> · <span className="text-muted">Lohn</span> <b>{eur(e.stundenlohn)}</b></>}</div>}
                      {doppelt.has(e.id) && <div className="text-[12.5px] text-red font-semibold mt-1">⚠ Doppelbuchung</div>}
                      {abgelaufeneQuali(e) && <div className="text-[12.5px] text-red font-semibold mt-1">⚠ Nachweis abgelaufen</div>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {ansicht === "timeline" && einsaetze.length > 0 && (
        <Card pad={false} className="reveal reveal-2 overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid" style={{ gridTemplateColumns: `240px repeat(${tage}, 1fr)` }}>
              <div className="px-4 py-2 text-[12.5px] text-muted font-medium border-b border-line bg-surface sticky left-0">Mitarbeiter</div>
              {Array.from({ length: tage }, (_, i) => { const d = new Date(Date.UTC(jahr, monat - 1, i + 1)); const we = [0, 6].includes(d.getUTCDay()); const ist = d.toDateString() === new Date(Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate())).toDateString(); return <div key={i} className={`text-center text-[11px] py-2 border-b border-line ${we ? "bg-surface-2 text-muted" : ""} ${ist ? "text-fox font-bold" : ""}`}>{i + 1}</div>; })}
              {[...perPerson.entries()].map(([pid, list]) => (
                <div key={pid} className="contents">
                  <div className="px-4 py-2.5 border-b border-line text-[12.5px] font-semibold sticky left-0 bg-surface"><Link href={`/personen/${pid}`} className="hover:text-brand">{list[0].person.vorname} {list[0].person.nachname}</Link><div className="text-[12.5px] text-muted font-normal">{list[0].person.standardrolle}</div></div>
                  <div className="border-b border-line relative h-[52px]" style={{ gridColumn: `span ${tage}` }}>
                    {list.map((e, idx) => {
                      const a = Math.max(1, e.von < start ? 1 : e.von.getUTCDate());
                      const b = !e.bis || e.bis > ende ? tage : e.bis.getUTCDate();
                      const left = ((a - 1) / tage) * 100; const w = ((b - a + 1) / tage) * 100;
                      return <Link key={e.id} href={`/einsaetze/${e.id}`} title={`${e.kunde.firmenname} · ${e.rolleImEinsatz}`} className={`absolute h-[22px] rounded-md text-[12.5px] font-semibold text-white px-2 truncate leading-[22px] ${doppelt.has(e.id) ? "bg-red" : e.status === "AKTIV" ? "bg-teal" : e.status === "GEPLANT" ? "bg-brand" : "bg-line-2 !text-ink"}`} style={{ left: `${left}%`, width: `${w}%`, top: 6 + (idx % 2) * 22 }}>{e.kunde.kurzname ?? e.kunde.firmenname}</Link>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {ansicht === "liste" && einsaetze.length > 0 && (
        <Card pad={false} className="reveal reveal-2">
          <table className="table"><thead><tr><th>Mitarbeiter</th><th>Kunde</th><th>Rolle</th><th>Zeitraum</th><th>Schicht / Std</th><th>Status</th>{sensibel && <th className="r">Satz / Lohn</th>}<th>Hinweise</th></tr></thead>
            <tbody>{einsaetze.map((e) => <tr key={e.id}><td><Link href={`/einsaetze/${e.id}`} className="row-link">{e.person.vorname} {e.person.nachname}</Link></td><td><Link href={`/kunden/${e.kundeId}`} className="hover:text-brand">{e.kunde.firmenname}</Link></td><td>{e.rolleImEinsatz}</td><td>{datum(e.von)} – {e.bis ? datum(e.bis) : "offen"}</td><td className="text-muted">{e.schichtmodell.replace("_", "-")} · {e.wochenstunden} h</td><td>{einsatzStatusBadge(e.status)}</td>{sensibel && <td className="r num">{eur(e.verrechnungssatz)} / {eur(e.stundenlohn)}</td>}<td className="text-red text-[12.5px] font-semibold">{doppelt.has(e.id) && "Doppelbuchung "}{abgelaufeneQuali(e) && "Nachweis abgelaufen"}</td></tr>)}</tbody></table>
        </Card>
      )}
    </>
  );
}
