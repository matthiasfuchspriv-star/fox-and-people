import Link from "next/link";
import { requireSession, tenantWhere, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { PageHeader, Card, Empty, Badge } from "@/components/ui";
import { nachweisEntscheiden, stundenzettelHochladen, alleBestaetigen } from "./actions";
import { Field } from "@/components/ui";
import { isoWoche } from "@/lib/wochen";
import { ZeitRaster, ZeitKopf } from "./erfassung";

export const dynamic = "force-dynamic";
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Eingereichte Stundennachweise aus der App prüfen – bestätigt = Stunden landen in der Monatsabrechnung. */
export default async function StundennachweisePage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; fehler?: string; jahr?: string; kw?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const where = tenantWhere(s);
  const status = (sp.status ?? "EINGEREICHT") as "EINGEREICHT" | "BESTAETIGT" | "ABGELEHNT";
  const liste = await db.stundennachweis.findMany({ where: { status, person: where.kostenstelleId ? { kostenstelleId: where.kostenstelleId } : {} }, include: { person: { include: { kostenstelle: { select: { name: true } } } } }, orderBy: [{ eingereichtAm: "desc" }], take: 100 });
  const einsaetze = await db.einsatz.findMany({ where: { id: { in: liste.map((n) => n.einsatzId).filter((x): x is string => !!x) } }, include: { kunde: { select: { firmenname: true } } } });
  const sensibel = darfSensibel(s);
  const aktive = sensibel ? await db.person.findMany({ where: { ...where, status: "VERMITTELT" }, orderBy: [{ nachname: "asc" }], select: { id: true, vorname: true, nachname: true } }) : [];
  const kwHeute = isoWoche(new Date());
  // App-Nutzung: wer arbeitet noch mit Papier? Die Dispo sieht hier, bei wem sie nachfassen muss.
  const nutzung = sensibel ? await (async () => {
    const aktiveMa = await db.person.findMany({ where: { ...where, status: "VERMITTELT" }, select: { id: true, vorname: true, nachname: true, appZuletztAktiv: true, appGesperrtAm: true } });
    const nieAngemeldet = aktiveMa.filter((x) => !x.appZuletztAktiv && !x.appGesperrtAm);
    const quellen = await db.stundennachweis.groupBy({ by: ["quelle"], _count: { _all: true }, where: { jahr: kwHeute.jahr } });
    const gesamt = quellen.reduce((a, q) => a + q._count._all, 0);
    return { aktiv: aktiveMa.length, nieAngemeldet, ausApp: quellen.find((q) => q.quelle === "APP")?._count._all ?? 0, gesamt };
  })() : null;
  const erfassungJahr = Number(sp.jahr) || kwHeute.jahr;
  const erfassungKw = Number(sp.kw) || kwHeute.kw;
  return (
    <>
      <PageHeader title="Stundennachweise" sub="Aus der Mitarbeiter-App eingereichte Wochenstunden – prüfen, bestätigen oder zur Korrektur zurückgeben. Bestätigte Stunden fließen automatisch in die Monatsabrechnung." />
      <div className="flex gap-2 mb-4 reveal">{[["EINGEREICHT", "Offen"], ["BESTAETIGT", "Bestätigt"], ["ABGELEHNT", "Zur Korrektur"]].map(([k, l]) => <Link key={k} href={`/stundennachweise?status=${k}`} className={`chip-filter ${status === k ? "active" : ""}`}>{l}</Link>)}</div>
      {sp.ok && <div className="alert alert-teal mb-4">{Number(sp.ok) > 1 ? `${sp.ok} Stundennachweise bestätigt – die Stunden sind in der Monatsabrechnung.` : "Erledigt."}</div>}
      {status === "EINGEREICHT" && liste.length > 1 && sensibel && (
        <Card className="reveal mb-4">
          <form action={alleBestaetigen} className="flex flex-wrap items-end gap-3">
            <Field label="Nur Kalenderwoche (leer = alle offenen)"><div className="flex gap-2"><input name="jahr" defaultValue={kwHeute.jahr} className="input num !w-24" /><input name="kw" placeholder="KW" className="input num !w-20" /></div></Field>
            <button className="btn btn-secondary">Alle offenen bestätigen</button>
            <p className="help flex-1">Bestätigt jeden offenen Nachweis einzeln – Normal- und Überstunden landen wie gewohnt in der Monatsabrechnung. Nachweise mit Warnungen bitte vorher einzeln ansehen.</p>
          </form>
        </Card>
      )}
      {sp.fehler && <div className="alert alert-red mb-4">{sp.fehler === "stunden" ? "Bitte Stunden eintragen." : sp.fehler === "pflicht" ? "Bitte Mitarbeiter, Jahr und KW angeben." : "Keine Berechtigung."}</div>}
      {sensibel && (
        <Card title="Stundenzettel erfassen / hochladen (Arbeitszeitaufzeichnung § 26 AZG)" className="reveal mb-4">
          <form action={stundenzettelHochladen} encType="multipart/form-data" className="space-y-4">
            <ZeitKopf jahr={erfassungJahr} kw={erfassungKw} personen={aktive} />
            <ZeitRaster jahr={erfassungJahr} kw={erfassungKw} />
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <Field label="Scan / Foto des unterschriebenen Zettels"><input type="file" name="datei" accept=".pdf,image/*" className="input" /></Field>
              <Field label="Notiz"><input name="notiz" className="input" placeholder="z. B. vom Kunden unterschrieben" /></Field>
              <button className="btn btn-primary w-full justify-center">Übernehmen</button>
            </div>
          </form>
          <p className="help mt-2">Die Woche wird sofort als bestätigter Nachweis gespeichert, der Scan landet unter Dokumente des Mitarbeiters, Normal- und Überstunden fließen getrennt in die Monatsabrechnung und der Zettel geht als Beilage mit der Rechnung mit. Für eine andere Woche einfach Jahr und KW ändern und die Seite mit <code>?jahr=&amp;kw=</code> aufrufen.</p>
        </Card>
      )}
      {nutzung && nutzung.aktiv > 0 && (
        <Card title="App-Nutzung" className="reveal mb-4">
          <div className="grid sm:grid-cols-3 gap-4 text-[13.5px]">
            <div><div className="text-muted text-[12px]">Aktive Mitarbeiter</div><div className="font-display font-bold text-[20px]">{nutzung.aktiv}</div></div>
            <div><div className="text-muted text-[12px]">Nachweise über die App {kwHeute.jahr}</div><div className="font-display font-bold text-[20px]">{nutzung.gesamt ? Math.round((nutzung.ausApp / nutzung.gesamt) * 100) : 0} %</div><div className="text-[11.5px] text-muted">{nutzung.ausApp} von {nutzung.gesamt}</div></div>
            <div><div className="text-muted text-[12px]">Nie in der App angemeldet</div><div className="font-display font-bold text-[20px]">{nutzung.nieAngemeldet.length}</div></div>
          </div>
          {nutzung.nieAngemeldet.length > 0 && <p className="help mt-2">Noch nie angemeldet: {nutzung.nieAngemeldet.slice(0, 12).map((x) => <Link key={x.id} href={`/personen/${x.id}`} className="text-brand font-semibold mr-2">{x.vorname} {x.nachname}</Link>)}{nutzung.nieAngemeldet.length > 12 ? `und ${nutzung.nieAngemeldet.length - 12} weitere` : ""} – hier lohnt ein Anruf, dann spart ihr euch die Papierzettel.</p>}
        </Card>
      )}
      <Card pad={false} className="reveal reveal-2">
        {liste.length ? (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Mitarbeiter</th><th>Woche</th><th>Einsatz</th>{TAGE.map((t) => <th key={t} className="r">{t}</th>)}<th className="r">Summe</th><th className="r">Ü50</th><th className="r">Ü100</th><th>Nachweis</th><th>Notiz</th><th></th></tr></thead>
            <tbody>{liste.map((n) => { const t = (n.tage as number[]) ?? []; const e = einsaetze.find((x) => x.id === n.einsatzId); return (
              <tr key={n.id}>
                <td><Link href={`/personen/${n.personId}`} className="row-link">{n.person.nachname} {n.person.vorname}</Link><div className="text-[11.5px] text-muted">{n.person.kostenstelle.name}</div></td>
                <td className="whitespace-nowrap">KW {n.kw}/{n.jahr}<div className="text-[11.5px] text-muted">eingereicht {datum(n.eingereichtAm)}</div></td>
                <td>{e?.kunde.firmenname ?? <span className="text-muted">–</span>}</td>
                {TAGE.map((_, i) => <td key={i} className="r num">{t[i] || "·"}</td>)}
                <td className="r num font-bold">{n.summe}</td>
                <td className="r num">{n.summeUe50 || "·"}</td>
                <td className="r num">{n.summeUe100 || "·"}</td>
                <td className="whitespace-nowrap"><a href={`/stundennachweise/${n.id}/pdf`} target="_blank" className="btn btn-ghost btn-sm">PDF</a>{n.fotoDokumentId ? <a href={`/dokumente/${n.fotoDokumentId}`} target="_blank" className="btn btn-ghost btn-sm">Foto</a> : <Badge tone="amber">Foto fehlt</Badge>}</td>
                <td className="text-[12px] text-muted max-w-[200px]">{n.notiz ?? ""}{n.status === "ABGELEHNT" && n.rueckmeldung ? <div className="text-red">→ {n.rueckmeldung}</div> : null}</td>
                <td className="r whitespace-nowrap">
                  {n.status !== "BESTAETIGT" && sensibel && <form action={nachweisEntscheiden.bind(null, n.id)} className="flex items-center gap-1 justify-end">
                    <input name="rueckmeldung" placeholder="Rückmeldung bei Ablehnung" className="input !w-44 !py-1 text-[12px]" />
                    <button name="entscheidung" value="ABLEHNEN" className="btn btn-ghost btn-sm text-red">Zurück</button>
                    <button name="entscheidung" value="BESTAETIGEN" className="btn btn-primary btn-sm">Bestätigen</button>
                  </form>}
                  {n.status === "BESTAETIGT" && <span className="text-[12px] text-muted">{n.geprueftVon} · {datum(n.geprueftAm)}</span>}
                </td>
              </tr>); })}</tbody>
          </table></div>
        ) : <Empty title={status === "EINGEREICHT" ? "Keine offenen Stundennachweise" : "Nichts vorhanden"} text="Mitarbeiter reichen ihre Wochenstunden in der App ein." />}
      </Card>
    </>
  );
}
