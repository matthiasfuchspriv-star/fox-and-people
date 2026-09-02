import { Logo } from "@/components/login-shell";
import { BewertungFelder } from "@/components/bewertung-felder";
import { datum } from "@/lib/format";
import { kundenPortalLaden } from "@/lib/kundenportal";
import { berechneWoche, wochentage } from "@/lib/zeitaufzeichnung";
import { eintraegeAus } from "@/lib/nachweis-pdf";
import { stundenFreigeben, portalBewerten } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Kundenportal light – ohne Login, nur über den Link aus der E-Mail: Der Beschäftiger sieht die Wochenstunden
 * seiner überlassenen Mitarbeiter, gibt sie frei (ersetzt die Unterschrift, AGB Punkt 4.7) und kann bewerten.
 */
export default async function KundenPortal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; bewertet?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const d = await kundenPortalLaden(token);
  if (!d) return (
    <main className="min-h-screen bg-bg">
      <header className="text-white px-6 py-4" style={{ background: "#10222a" }}><div className="flex items-center gap-3"><Logo size={32} /><span className="ml-auto text-white/60 text-[12px]">Kundenportal</span></div></header>
      <div className="max-w-xl mx-auto p-6"><div className="card card-pad text-center"><h1 className="font-display font-bold text-xl mb-2">Link ungültig oder abgelaufen</h1><p className="text-muted text-[13.5px]">Bitte fordern Sie bei Fox &amp; People einen neuen Link an.</p></div></div>
    </main>
  );
  const { t, jahr, kw, montag, einsaetze, nachweise } = d;
  const sonntag = new Date(montag.getTime() + 6 * 86400000);
  const tage = wochentage(jahr, kw);
  const personen = [...new Map(einsaetze.map((e) => [e.personId, e])).values()];
  const zeigStunden = t.zweck !== "BEWERTUNG";
  const zeigBewertung = t.zweck !== "STUNDEN";
  return (
    <main className="min-h-screen bg-bg">
      <header className="text-white px-6 py-4" style={{ background: "#10222a" }}><div className="flex items-center gap-3"><Logo size={32} /><span className="ml-auto text-white/60 text-[12px]">Kundenportal · {t.kunde.firmenname}</span></div></header>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        {sp.ok && <div className="alert alert-teal"><span>Danke! {sp.ok} Stundennachweis{sp.ok === "1" ? "" : "e"} freigegeben – die Abrechnung läuft damit automatisch weiter.</span></div>}
        {sp.bewertet && <div className="alert alert-teal"><span>Danke für die Rückmeldung!</span></div>}

        {zeigStunden && (
          <form action={stundenFreigeben.bind(null, token)} className="card card-pad space-y-4">
            <input type="hidden" name="jahr" value={jahr} /><input type="hidden" name="kw" value={kw} />
            <div>
              <div className="section-title mb-1">Stundenfreigabe</div>
              <h1 className="font-display font-bold text-2xl">KW {kw} / {jahr}</h1>
              <p className="text-muted text-[13.5px] mt-1">{datum(montag)} – {datum(sonntag)} · Bitte prüfen Sie die gemeldeten Stunden und geben Sie sie frei. Ihre Freigabe ersetzt die Unterschrift auf dem Stundenzettel.</p>
            </div>
            {nachweise.length ? (
              <div className="space-y-3">
                {nachweise.map((n) => {
                  const w = berechneWoche(eintraegeAus(n), { daten: tage.map((x) => x.datum) });
                  const eintr = eintraegeAus(n);
                  return (
                    <div key={n.id} className="rounded-lg border border-line p-3">
                      <input type="hidden" name="nachweisId" value={n.id} />
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="font-semibold">{n.person.vorname} {n.person.nachname}</div>
                        {n.bestaetigtAm
                          ? <span className="badge badge-teal">freigegeben {datum(n.bestaetigtAm)}</span>
                          : <label className="flex items-center gap-2 text-[13.5px] font-semibold"><input type="checkbox" name={`ok_${n.id}`} defaultChecked className="w-4 h-4" /> freigeben</label>}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table text-[12.5px]">
                          <thead><tr><th>Tag</th><th>Datum</th><th>Beginn</th><th>Ende</th><th className="r">Pause</th><th className="r">Gesamt</th><th className="r">Ü 50 %</th><th className="r">Ü 100 %</th><th>Anmerkung</th></tr></thead>
                          <tbody>{tage.map((x, i) => (
                            <tr key={i}>
                              <td className="font-semibold">{x.kurz}</td><td className="whitespace-nowrap">{datum(x.datum)}</td>
                              <td>{eintr[i]?.beginn ?? "–"}</td><td>{eintr[i]?.ende ?? "–"}</td>
                              <td className="r num">{eintr[i]?.pauseMin ? `${eintr[i]!.pauseMin} min` : "–"}</td>
                              <td className="r num font-semibold">{w.tage[i].gesamt || "·"}</td>
                              <td className="r num">{w.tage[i].ue50 || "·"}</td>
                              <td className="r num">{w.tage[i].ue100 || "·"}</td>
                              <td className="text-muted">{eintr[i]?.fehlzeit ?? ""} {eintr[i]?.anmerkung ?? ""}</td>
                            </tr>
                          ))}</tbody>
                          <tfoot><tr><td colSpan={5} className="r font-semibold">Summe</td><td className="r num font-bold">{w.summe}</td><td className="r num font-bold">{w.ue50}</td><td className="r num font-bold">{w.ue100}</td><td /></tr></tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="field"><label className="label">Ihr Name</label><input name="name" defaultValue={t.name ?? ""} className="input" placeholder="Vor- und Nachname" /></div>
                  <div className="field"><label className="label">Anmerkung (optional)</label><input name="anmerkung" className="input" placeholder="z. B. Mittwoch 2 Stunden früher gegangen" /></div>
                </div>
                <button className="btn btn-primary w-full justify-center !h-12">Stunden freigeben</button>
                <p className="text-[12px] text-muted">Stimmen die Stunden nicht, tragen Sie es bitte in die Anmerkung ein – wir melden uns, bevor abgerechnet wird.</p>
              </div>
            ) : <p className="text-muted text-[13.5px]">Für diese Woche liegen noch keine Stundenmeldungen vor. Sobald die Mitarbeiter ihre Stunden eingereicht haben, erscheinen sie hier.</p>}
          </form>
        )}

        {zeigBewertung && personen.length > 0 && (
          <form action={portalBewerten.bind(null, token)} className="card card-pad space-y-4">
            <div><div className="section-title mb-1">Rückmeldung</div><h2 className="font-display font-bold text-xl">Wie zufrieden sind Sie mit unseren Mitarbeitern?</h2><p className="text-muted text-[13.5px] mt-1">Zwei Klicks genügen – Ihre Rückmeldung hilft uns, Ihnen passende Leute zu stellen.</p></div>
            <div className="field"><label className="label">Mitarbeiter</label><select name="personId" required className="select">{personen.map((e) => <option key={e.personId} value={e.personId}>{e.person.vorname} {e.person.nachname}</option>)}</select></div>
            <BewertungFelder ziel="MITARBEITER" />
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="wiedereinsatz" defaultChecked /> Wir würden diesen Mitarbeiter wieder einsetzen.</label>
            <div className="field"><label className="label">Ihr Name</label><input name="name" defaultValue={t.name ?? ""} className="input" /></div>
            <button className="btn btn-secondary w-full justify-center">Rückmeldung senden</button>
          </form>
        )}
        <p className="text-[12px] text-muted text-center">Ihre Angaben werden intern bei Fox &amp; People gespeichert und nicht veröffentlicht. Der Link gilt bis {datum(t.gultigBis)} und nach dem ersten Öffnen noch 24 Stunden.</p>
      </div>
    </main>
  );
}
