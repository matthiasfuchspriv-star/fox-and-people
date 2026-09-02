import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Send, BellRing, Ban, CheckCircle2, Trash2 } from "lucide-react";
import { requireSession, darfKostenstelle } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailFuer } from "@/lib/kontakte";
import { eur, datum, isoDate, MONATE_LANG } from "@/lib/format";
import { PageHeader, Card, Field, Stat, rechnungStatusBadge } from "@/components/ui";
import { MAHNTEXTE } from "@/lib/rechnung";
import { rechnungVersenden, zahlungErfassen, mahnungSenden, rechnungStornieren, rechnungNotiz, rechnungLoeschen } from "../actions";

export const dynamic = "force-dynamic";

export default async function RechnungDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gesendet?: string; fehler?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const r = await db.rechnung.findUnique({ where: { id }, include: { kunde: { include: { ansprechpartner: true } }, positionen: { include: { person: true } }, kostenstelle: true, dokumente: true } });
  if (!r || !darfKostenstelle(s, r.kostenstelleId)) notFound();
  const rest = r.brutto - r.bezahltBetrag;
  const heute = new Date();
  const offen = ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"].includes(r.status);
  const empf = mailFuer(r.kunde, "RECHNUNG"); // Ansprechpartner mit Rolle Rechnungsempfang → Rechnungs-E-Mail → Kunden-E-Mail
  const tageUeberfaellig = Math.floor((heute.getTime() - r.faelligAm.getTime()) / 86400000);
  const naechsteStufe = Math.min(3, r.mahnstufe + 1);
  return (
    <>
      <PageHeader crumbs={[{ href: "/rechnungen", label: "Rechnungen" }, { label: r.nummer }]}
        title={<span className="flex items-center gap-3 flex-wrap">{r.netto < 0 ? "Storno " : "Rechnung "}{r.nummer} {rechnungStatusBadge(r.status)}</span>}
        sub={<span><Link href={`/kunden/${r.kundeId}`} className="font-semibold text-ink hover:text-brand">{r.kunde.firmenname}</Link> · {MONATE_LANG[r.leistungMonat - 1]} {r.leistungJahr} · {r.kostenstelle.name}{r.versendetAm && ` · versendet ${datum(r.versendetAm)}`}</span>}
        actions={<a href={`/rechnungen/${id}/pdf`} target="_blank" className="btn btn-secondary"><FileDown size={15} /> PDF</a>} />
      {sp.gesendet && <div className={`alert ${sp.gesendet === "TEST" ? "alert-amber" : sp.gesendet === "FEHLER" ? "alert-red" : "alert-teal"} mb-4`}>{sp.gesendet === "TEST" ? "Testmodus: E-Mail protokolliert, nicht zugestellt (SMTP noch nicht konfiguriert)." : sp.gesendet === "FEHLER" ? "Versand fehlgeschlagen – SMTP prüfen." : "E-Mail versendet."}</div>}
      {sp.fehler === "email" && <div className="alert alert-red mb-4">Keine Rechnungs-E-Mail beim Kunden hinterlegt.</div>}
      {sp.fehler === "loeschen" && <div className="alert alert-red mb-4">Nur Entwürfe, stornierte Rechnungen und Gutschriften können gelöscht werden – versendete Rechnungen bitte stornieren.</div>}
      {sp.fehler === "berechtigung" && <div className="alert alert-red mb-4">Löschen ist dem Systemadmin vorbehalten.</div>}
      {offen && tageUeberfaellig > 0 && <div className="alert alert-red mb-4"><BellRing size={16} className="mt-0.5" /><span><strong>{tageUeberfaellig} Tage überfällig</strong> · offen {eur(rest)} · Mahnstufe {r.mahnstufe}/3{r.letzteErinnerungAm && ` · letzte Erinnerung ${datum(r.letzteErinnerungAm)}`}</span></div>}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4">
          <Card title="Positionen" pad={false} className="reveal">
            <table className="table"><thead><tr><th>Leistung</th><th className="r">Menge</th><th>Einheit</th><th className="r">Einzelpreis</th><th className="r">Betrag</th></tr></thead>
              <tbody>{r.positionen.map((p) => <tr key={p.id}><td>{p.person ? <Link href={`/personen/${p.personId}`} className="row-link">{p.beschreibung}</Link> : p.beschreibung}</td><td className="r num">{p.menge.toLocaleString("de-AT")}</td><td className="text-muted">{p.einheit}</td><td className="r num">{eur(p.einzelpreis)}</td><td className="r num font-semibold">{eur(p.betrag)}</td></tr>)}</tbody>
            </table>
            <div className="px-5 py-4 border-t border-line flex justify-end"><div className="w-64"><Stat label="Netto" value={eur(r.netto)} /><Stat label={`${r.ustProzent} % USt`} value={eur(r.ust || r.brutto - r.netto)} /><Stat label="Brutto" value={<span className="text-[17px]">{eur(r.brutto)}</span>} /><Stat label="Bezahlt" value={eur(r.bezahltBetrag)} /><Stat label="Offen" value={<span className={rest > 0.005 && r.status !== "ENTWURF" ? "text-amber" : ""}>{eur(rest)}</span>} /></div></div>
          </Card>
          <Card title="Fälligkeit & Notiz" className="reveal reveal-2">
            <form action={rechnungNotiz.bind(null, id)} className="grid sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
              <Field label="Fällig am"><input type="date" name="faelligAm" defaultValue={isoDate(r.faelligAm)} className="input" /></Field>
              <Field label="Notiz auf der Rechnung (z. B. Factoring-Hinweis)"><input name="notiz" defaultValue={r.notiz ?? ""} className="input" /></Field>
              <button className="btn btn-secondary">Speichern</button>
            </form>
          </Card>
        </div>
        <div className="space-y-4">
          {r.status !== "STORNIERT" && r.status !== "BEZAHLT" && (
            <Card title={<span className="flex items-center gap-2"><Send size={15} /> {r.status === "ENTWURF" ? "Rechnung versenden" : "Erneut senden"}</span>} className="reveal reveal-2">
              <form action={rechnungVersenden.bind(null, id)} className="space-y-3">
                <Field label="Rechnungs-E-Mail" required><input name="an" type="email" required defaultValue={empf} className="input" /></Field>
                <button className="btn btn-primary w-full justify-center">PDF erzeugen & senden</button>
                {r.status === "ENTWURF" && <p className="help">Beim ersten Versand wird das Rechnungsdatum auf heute gesetzt.</p>}
              </form>
            </Card>
          )}
          {offen && (
            <Card title={<span className="flex items-center gap-2"><CheckCircle2 size={15} /> Zahlung erfassen</span>} className="reveal reveal-3">
              <form action={zahlungErfassen.bind(null, id)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3"><Field label="Betrag €"><input name="betrag" defaultValue={rest.toFixed(2)} className="input num" inputMode="decimal" /></Field><Field label="Datum"><input type="date" name="datum" defaultValue={isoDate(heute)} className="input" /></Field></div>
                <button className="btn btn-primary w-full justify-center">Als bezahlt buchen</button>
              </form>
            </Card>
          )}
          {offen && r.mahnstufe < 3 && (
            <Card title={<span className="flex items-center gap-2"><BellRing size={15} /> {MAHNTEXTE[naechsteStufe - 1].titel} senden</span>} className="reveal reveal-4">
              <form action={mahnungSenden.bind(null, id)} className="space-y-3">
                <input type="hidden" name="stufe" value={naechsteStufe} />
                <Field label="Empfänger"><input name="an" type="email" defaultValue={empf} className="input" /></Field>
                <p className="help">{naechsteStufe === 1 ? "Freundlich, 3–5 Tage nach Fälligkeit, ohne Kosten." : naechsteStufe === 2 ? "Sachlich mit Frist – Verzugszinsen (§ 456 UGB) und 40 € Pauschale (§ 458 UGB)." : "Letzte Frist, Ankündigung Inkasso / Mahnklage."}</p>
                <button className="btn btn-danger w-full justify-center">{MAHNTEXTE[naechsteStufe - 1].titel} senden</button>
              </form>
            </Card>
          )}
          {r.status !== "STORNIERT" && r.netto > 0 && (
            <Card title="Storno" className="reveal reveal-4">
              <form action={rechnungStornieren.bind(null, id)}><button className="btn btn-secondary w-full justify-center"><Ban size={15} /> Stornorechnung erzeugen</button></form>
              <p className="help mt-2">Die Nummer bleibt vergeben, es wird eine Gegenrechnung mit eigener Nummer erzeugt; die Monatszeilen werden wieder offen.</p>
            </Card>
          )}
          {s.rolle === "SYSTEMADMIN" && (r.status === "ENTWURF" || r.status === "STORNIERT" || r.netto < 0) && (
            <Card title="Löschen (nur Systemadmin)" className="reveal reveal-4">
              <form action={rechnungLoeschen.bind(null, id)}><button className="btn btn-secondary w-full justify-center text-red"><Trash2 size={15} /> Rechnung endgültig löschen</button></form>
              <p className="help mt-2">Nur für Test-/Fehlbuchungen: Entwürfe, stornierte Rechnungen und Storno-Gutschriften. Monatszeilen werden wieder offen; war es die letzte vergebene Nummer, wird der Nummernkreis zurückgesetzt und die Nummer erneut vergeben. Wird im Audit-Log protokolliert.</p>
            </Card>
          )}
          {r.dokumente.length > 0 && <Card title="Versendete PDFs" className="reveal reveal-4"><ul className="divide-y divide-line">{r.dokumente.map((d) => <li key={d.id} className="py-2 flex justify-between text-[12.5px]"><span>{d.dateiname}<span className="text-muted"> · {datum(d.hochgeladenAm)}</span></span><a href={`/dokumente/${d.id}`} className="text-brand font-semibold">Öffnen</a></li>)}</ul></Card>}
        </div>
      </div>
    </>
  );
}
