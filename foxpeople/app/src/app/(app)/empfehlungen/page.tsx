import Link from "next/link";
import { requireSession, tenantWhere, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { einstellung } from "@/lib/einstellungen";
import { eur, datum } from "@/lib/format";
import { PageHeader, Card, Empty, Badge, Field } from "@/components/ui";
import { empfehlungStatus, empfehlungKonfig } from "./actions";
import { EMPFEHLUNG_DEFAULT, type EmpfehlungConfig } from "@/lib/empfehlung";

export const dynamic = "force-dynamic";
const STATUS: Record<string, [string, "grey" | "brand" | "teal" | "fox" | "red" | "amber"]> = { NEU: ["neu", "grey"], KONTAKTIERT: ["kontaktiert", "brand"], EINGESTELLT: ["eingestellt", "teal"], PRAEMIE_FAELLIG: ["Prämie fällig", "fox"], AUSBEZAHLT: ["ausbezahlt", "teal"], ABGELEHNT: ["abgelehnt", "grey"] };

/** Freunde werben Freunde – Empfehlungen bearbeiten, Prämien auslösen, Programm konfigurieren. */
export default async function EmpfehlungenPage({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const where = tenantWhere(s);
  const heute = new Date();
  const cfg = { ...EMPFEHLUNG_DEFAULT, ...(await einstellung<Partial<EmpfehlungConfig>>("empfehlung", {})) };
  const liste = await db.empfehlung.findMany({ where: { werber: where.kostenstelleId ? { kostenstelleId: where.kostenstelleId } : {} }, include: { werber: { select: { id: true, vorname: true, nachname: true } }, empfohlenePerson: { select: { id: true, vorname: true, nachname: true, status: true } } }, orderBy: { erstelltAm: "desc" } });
  const pool = await db.person.findMany({ where: { ...where, status: { in: ["SUCHT", "VERMITTELT"] }, aufnahmedatum: { gte: new Date(heute.getTime() - 180 * 86400000) } }, orderBy: { nachname: "asc" }, select: { id: true, vorname: true, nachname: true }, take: 300 });
  const faellig = liste.filter((e) => e.status === "EINGESTELLT" && e.faelligAm && e.faelligAm <= heute);
  return (
    <>
      <PageHeader title="Freunde werben Freunde" sub={`Empfehlungen aus der Mitarbeiter-App. Prämie ${eur(cfg.praemieWerber, 0)} nach ${cfg.praemieNachMonaten} Monaten Einsatz${cfg.praemieGeworbener ? `, Startbonus ${eur(cfg.praemieGeworbener, 0)} für den Geworbenen` : ""}${cfg.bonusJeAnzahl ? `, zusätzlich ${eur(cfg.bonusBetrag, 0)} Bonus je ${cfg.bonusJeAnzahl} erfolgreichen Empfehlungen` : ""}.`} />
      {sp.ok && <div className="alert alert-teal mb-4">Gespeichert.</div>}
      {sp.fehler && <div className="alert alert-red mb-4">Keine Berechtigung.</div>}
      {faellig.length > 0 && <div className="alert alert-amber mb-4"><span><strong>{faellig.length} Prämie(n) fällig:</strong> {faellig.map((e) => `${e.werber.vorname} ${e.werber.nachname} für ${e.name}`).join(", ")} – Einsatzdauer prüfen und auf „Prämie fällig“ setzen (geht dann an die Lohnverrechnung).</span></div>}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Empfehlungen" pad={false} className="lg:col-span-2 reveal">
          {liste.length ? (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Empfohlen</th><th>Von</th><th>Kontakt</th><th>Status</th><th>Prämie</th><th></th></tr></thead>
              <tbody>{liste.map((e) => (
                <tr key={e.id}>
                  <td className="font-semibold">{e.name}<div className="text-[12.5px] text-muted font-normal">{datum(e.erstelltAm)}{e.notiz ? ` · ${e.notiz}` : ""}</div>{e.empfohlenePerson && <Link href={`/personen/${e.empfohlenePerson.id}`} className="text-[12.5px] text-brand">→ {e.empfohlenePerson.vorname} {e.empfohlenePerson.nachname}</Link>}</td>
                  <td><Link href={`/personen/${e.werber.id}`} className="row-link">{e.werber.vorname} {e.werber.nachname}</Link></td>
                  <td className="text-[12.5px]">{e.telefon}<br />{e.email}</td>
                  <td><Badge tone={STATUS[e.status][1]}>{STATUS[e.status][0]}</Badge></td>
                  <td className="text-[12.5px] num">{e.praemieBetrag ? eur(e.praemieBetrag, 0) : "–"}{e.faelligAm && e.status === "EINGESTELLT" ? <div className="text-muted">fällig {datum(e.faelligAm)}</div> : null}{e.ausbezahltAm ? <div className="text-muted">bezahlt {datum(e.ausbezahltAm)}</div> : null}</td>
                  <td className="r">
                    <form action={empfehlungStatus.bind(null, e.id)} className="flex items-center gap-1 justify-end flex-wrap">
                      {e.status === "NEU" && <button name="status" value="KONTAKTIERT" className="btn btn-secondary btn-sm">Kontaktiert</button>}
                      {(e.status === "NEU" || e.status === "KONTAKTIERT") && <><select name="empfohlenePersonId" className="select !w-44 !py-1 text-[12.5px]"><option value="">Person im Pool wählen …</option>{pool.map((p) => <option key={p.id} value={p.id}>{p.nachname} {p.vorname}</option>)}</select><button name="status" value="EINGESTELLT" className="btn btn-primary btn-sm">Eingestellt</button><button name="status" value="ABGELEHNT" className="btn btn-ghost btn-sm">Ablehnen</button></>}
                      {e.status === "EINGESTELLT" && <button name="status" value="PRAEMIE_FAELLIG" className="btn btn-primary btn-sm">Prämie fällig</button>}
                      {e.status === "PRAEMIE_FAELLIG" && <button name="status" value="AUSBEZAHLT" className="btn btn-primary btn-sm">Ausbezahlt</button>}
                    </form>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title="Noch keine Empfehlungen" text="Mitarbeiter empfehlen Bekannte über die App – sie erscheinen hier mit Wiedervorlage." />}
        </Card>
        {istZentrale(s) && (
          <>
          <Card title="Bewerbungs-QR-Code" className="reveal reveal-2">
            <p className="text-[14px] text-muted mb-3">Der Code führt auf die 30-Sekunden-Kurzbewerbung. Auf Flyer, Aushang, Fahrzeug, Visitenkarte und auf jede Einsatzbestätigung drucken. Mit einem Kanalnamen im Feld unten kommt jede Bewerbung mit ihrer Quelle herein – dann steht im Controlling unter „Recruiting &amp; Bindung“, welcher Aushang wirklich Leute bringt.</p>
            <form className="flex gap-2 items-end mb-3" action="/empfehlungen/qr" target="_blank">
              <Field label="Kanal (optional)" className="flex-1"><input name="q" className="input" placeholder="z. B. Aushang Werk Kilb" /></Field>
              <button className="btn btn-secondary">QR-Code öffnen</button>
            </form>
            <img src="/empfehlungen/qr" alt="QR-Code zur Kurzbewerbung" className="w-40 h-40 rounded-lg border border-line" />
          </Card>
          <Card title="Programm-Einstellungen" className="reveal reveal-2">
            <form action={empfehlungKonfig} className="space-y-3">
              <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="aktiv" defaultChecked={cfg.aktiv} /> Programm aktiv (in der App sichtbar)</label>
              <Field label="Prämie für den Werber €"><input name="praemieWerber" defaultValue={cfg.praemieWerber} className="input num" /></Field>
              <Field label="Startbonus für den Geworbenen € (0 = keiner)"><input name="praemieGeworbener" defaultValue={cfg.praemieGeworbener} className="input num" /></Field>
              <Field label="Fällig nach Monaten im Einsatz"><input name="praemieNachMonaten" defaultValue={cfg.praemieNachMonaten} className="input num" /></Field>
              <Field label="Bonus je … Empfehlungen" help="Zusatzbonus für Vielwerber – 0 schaltet ihn ab."><input name="bonusJeAnzahl" defaultValue={cfg.bonusJeAnzahl} className="input num" /></Field>
              <Field label="Bonusbetrag €"><input name="bonusBetrag" defaultValue={cfg.bonusBetrag} className="input num" /></Field>
              <Field label="Bedingungen (Text in der App)"><textarea name="bedingungen" rows={7} defaultValue={cfg.bedingungen} className="textarea text-[12.5px]" /></Field>
              <button className="btn btn-primary w-full justify-center">Speichern</button>
              <p className="help">Die Prämie ist ein steuer- und SV-pflichtiger Bezug – über die Lohnverrechnung auszahlen. Die Prämie trägt die Zentrale; sie mindert deren DB1 im Monat der Auszahlung und erscheint im Controlling unter „Kosten &amp; DB2“. Vorgabe: 100 € für den Werber, 100 € für den Geworbenen, dazu 100 € Bonus je 5 erfolgreichen Empfehlungen – zusammen weit unter den Kosten einer Stellenanzeige plus Sichtung.</p>
            </form>
          </Card>
          </>
        )}
      </div>
    </>
  );
}
