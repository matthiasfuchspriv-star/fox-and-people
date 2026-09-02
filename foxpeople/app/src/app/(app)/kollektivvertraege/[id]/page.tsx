import { notFound, redirect } from "next/navigation";
import { requireSession, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { eur, isoDate, datum } from "@/lib/format";
import { PageHeader, Card, Field, Empty } from "@/components/ui";
import { kvSpeichern, kvLoeschen, lohnstufeSpeichern, lohnstufeLoeschen } from "../actions";

export const dynamic = "force-dynamic";

export default async function KvBearbeiten({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  const { id } = await params;
  const sp = await searchParams;
  const kv = await db.kollektivvertrag.findUnique({ where: { id }, include: { lohntabelle: { orderBy: [{ gultigAb: "desc" }, { beschaeftigungsgruppe: "asc" }] }, _count: { select: { personen: true } } } });
  if (!kv) notFound();

  return (
    <>
      <PageHeader title={kv.name} sub={`${kv.kuerzel} · Kollektivvertrag bearbeiten`} crumbs={[{ href: "/kollektivvertraege", label: "Kollektivverträge" }, { label: kv.name }]} />
      {sp.ok && <div className="alert alert-teal mb-4">Gespeichert.</div>}
      {sp.fehler && <div className="alert alert-red mb-4">{sp.fehler === "pflicht" ? "Name und Kürzel sind Pflicht." : sp.fehler === "gruppe" ? "Bitte die Beschäftigungsgruppe angeben." : sp.fehler}</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Stammdaten" className="lg:col-span-1 reveal">
          <form action={kvSpeichern.bind(null, id)} className="space-y-3">
            <Field label="Name" required><input name="name" defaultValue={kv.name} required className="input" /></Field>
            <Field label="Kürzel" required help="Kurzzeichen, z. B. METALL, HANDEL."><input name="kuerzel" defaultValue={kv.kuerzel} required className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wochenstunden"><input name="wochenstunden" defaultValue={kv.wochenstunden} className="input num" inputMode="decimal" /></Field>
              <Field label="Monatsteiler" help="Monatslohn ÷ Teiler = Stundenlohn."><input name="monatsteiler" defaultValue={kv.monatsteiler} className="input num" inputMode="decimal" /></Field>
            </div>
            <Field label="Gilt ab"><input type="date" name="gultigAb" defaultValue={isoDate(kv.gultigAb)} className="input" /></Field>
            <Field label="Gilt für"><select name="gruppe" defaultValue={kv.gruppe} className="select"><option value="ARBEITER">Arbeiter</option><option value="ANGESTELLTE">Angestellte</option><option value="BEIDE">Beide</option></select></Field>
            <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="istReferenz" defaultChecked={kv.istReferenz} /> Beschäftiger-KV (Referenzlohn § 10 AÜG)</label>
            <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="referenzzuschlagPruefen" defaultChecked={kv.referenzzuschlagPruefen} /> Lohntafel nicht exakt gepflegt – Referenzzuschlag beim Einsatz manuell prüfen</label>
            <Field label="Hinweis"><textarea name="hinweis" defaultValue={kv.hinweis ?? ""} rows={2} className="textarea" /></Field>
            <button className="btn btn-primary w-full justify-center">Speichern</button>
          </form>
          {kv._count.personen === 0 && (
            <form action={kvLoeschen.bind(null, id)} className="mt-3 border-t border-line pt-3">
              <button className="btn btn-ghost btn-sm text-red w-full justify-center">Kollektivvertrag löschen</button>
            </form>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card title={`Lohntafel (${kv.lohntabelle.length} Stufen)`} pad={false} className="reveal reveal-2">
            {kv.lohntabelle.length ? (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>Gruppe</th><th>Bezeichnung</th><th className="r">€/Std</th><th className="r">Monatsbrutto</th><th className="r">Ref.-Zuschlag %</th><th>Gilt ab</th><th></th></tr></thead>
                <tbody>{kv.lohntabelle.map((l) => (
                  <tr key={l.id}>
                    <td className="font-semibold">{l.beschaeftigungsgruppe}</td>
                    <td className="text-[13px] text-muted">{l.bezeichnung ?? "–"}</td>
                    <td className="r num">{l.mindestStundenlohn != null ? eur(l.mindestStundenlohn) : "–"}</td>
                    <td className="r num">{l.mindestMonatsbrutto != null ? eur(l.mindestMonatsbrutto) : "–"}</td>
                    <td className="r num">{l.referenzzuschlagProzent != null ? `${l.referenzzuschlagProzent} %` : "–"}</td>
                    <td className="text-[13px]">{l.gultigAb ? datum(l.gultigAb) : "–"}</td>
                    <td className="r whitespace-nowrap">
                      <details className="inline-block text-left">
                        <summary className="btn btn-ghost btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">Bearbeiten</summary>
                        <div className="mt-2 p-3 card card-pad w-72">
                          <form action={lohnstufeSpeichern.bind(null, id)} className="space-y-2">
                            <input type="hidden" name="stufeId" value={l.id} />
                            <Field label="Gruppe" required><input name="beschaeftigungsgruppe" defaultValue={l.beschaeftigungsgruppe} required className="input" /></Field>
                            <Field label="Bezeichnung"><input name="bezeichnung" defaultValue={l.bezeichnung ?? ""} className="input" /></Field>
                            <Field label="€/Std"><input name="mindestStundenlohn" defaultValue={l.mindestStundenlohn ?? ""} className="input num" inputMode="decimal" /></Field>
                            <Field label="Monatsbrutto"><input name="mindestMonatsbrutto" defaultValue={l.mindestMonatsbrutto ?? ""} className="input num" inputMode="decimal" /></Field>
                            <Field label="Ref.-Zuschlag %"><input name="referenzzuschlagProzent" defaultValue={l.referenzzuschlagProzent ?? ""} className="input num" inputMode="decimal" /></Field>
                            <Field label="Gilt ab"><input type="date" name="gultigAb" defaultValue={l.gultigAb ? isoDate(l.gultigAb) : ""} className="input" /></Field>
                            <button className="btn btn-primary btn-sm w-full justify-center">Speichern</button>
                          </form>
                          <form action={lohnstufeLoeschen.bind(null, id, l.id)} className="mt-1"><button className="btn btn-ghost btn-sm text-red w-full justify-center">Löschen</button></form>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <Empty title="Noch keine Lohnstufen" text="Unten die erste Stufe der Lohntafel anlegen." />}
          </Card>

          <Card title="Lohnstufe hinzufügen" className="reveal reveal-3">
            <form action={lohnstufeSpeichern.bind(null, id)} className="grid sm:grid-cols-3 gap-3">
              <Field label="Gruppe" required><input name="beschaeftigungsgruppe" required className="input" placeholder="z. B. A, B, C" /></Field>
              <Field label="Bezeichnung"><input name="bezeichnung" className="input" placeholder="z. B. Facharbeiter" /></Field>
              <Field label="Gilt ab"><input type="date" name="gultigAb" className="input" /></Field>
              <Field label="€/Std"><input name="mindestStundenlohn" className="input num" inputMode="decimal" /></Field>
              <Field label="Monatsbrutto"><input name="mindestMonatsbrutto" className="input num" inputMode="decimal" /></Field>
              <Field label="Ref.-Zuschlag %" help="Zuschlag auf den AKÜ-Grundlohn (§ 10 AÜG)."><input name="referenzzuschlagProzent" className="input num" inputMode="decimal" /></Field>
              <div className="sm:col-span-3"><button className="btn btn-primary">Stufe hinzufügen</button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
