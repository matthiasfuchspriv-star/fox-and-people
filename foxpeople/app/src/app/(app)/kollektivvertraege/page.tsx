import Link from "next/link";
import { requireSession, istZentrale } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { PageHeader, Card, Badge, Kpi } from "@/components/ui";
import { KV_WKO, naechsterTermin, VORWARNUNG_KV_TAGE } from "@/lib/kv-wko";
import { keinZuschlagListe, zuschlagSchluessel } from "@/lib/referenz-entscheidung";
import { Field } from "@/components/ui";
import { kvAnlegen } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Übersicht der verwendeten Kollektivverträge.
 *
 * Ein Kollektivvertrag ist keine Konstante. Er wird jedes Jahr erhöht, meist zu einem festen
 * Stichtag – die metalltechnische Industrie am 1.11., der Handel am 1.1., die chemische Industrie
 * am 1.5. Läuft so ein Termin durch, ohne dass die Lohntafel nachgezogen wird, rechnet die Software
 * am nächsten Tag mit einem Lohn, den es nicht mehr gibt. Beim Referenzlohn nach § 10 AÜG ist das
 * keine veraltete Zahl, sondern Unterzahlung mit Strafdrohung nach dem LSD-BG.
 *
 * Deshalb steht hier nicht nur, welcher KV bei welchem Kunden gilt, sondern auch, auf welchem Stand
 * unsere Tafel ist, wann der nächste Termin fällt und wo bei der WKO nachzusehen ist.
 */
export default async function Kollektivvertraege({ searchParams }: { searchParams: Promise<{ geloescht?: string; fehler?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  const sp = await searchParams;

  const [kvs, kunden, ohneZuschlag] = await Promise.all([
    db.kollektivvertrag.findMany({ include: { lohntabelle: true }, orderBy: { name: "asc" } }),
    db.kunde.findMany({ where: { status: "AKTIV" }, select: { id: true, firmenname: true, kollektivvertrag: true, referenzKvId: true } }),
    keinZuschlagListe(),
  ]);
  const heute = new Date();

  const zeilen = kvs.map((kv) => {
    const info = KV_WKO[kv.kuerzel];
    const tafeln = [...new Set(kv.lohntabelle.map((l) => l.gultigAb?.toISOString().slice(0, 10) ?? ""))].filter(Boolean).sort();
    const neuesteTafel = tafeln.length ? tafeln[tafeln.length - 1] : null;
    const mitZuschlag = kv.lohntabelle.filter((l) => l.referenzzuschlagProzent != null).length;
    const termin = naechsterTermin(info, heute);
    const tageBis = termin ? Math.round((termin.getTime() - heute.getTime()) / 86400000) : null;
    // Veraltet ist die Tafel, wenn die WKO bereits einen späteren Stichtag ausweist als unsere jüngste Tafel.
    const veraltet = Boolean(info?.stand && neuesteTafel && info.stand > neuesteTafel);
    const meine = kunden.filter((k) => k.referenzKvId === kv.id || (k.kollektivvertrag && zuschlagSchluessel(k.kollektivvertrag) === kv.kuerzel));
    const entschieden = ohneZuschlag.find((e) => e.schluessel === kv.kuerzel);
    return { kv, info, tafeln, neuesteTafel, mitZuschlag, termin, tageBis, veraltet, meine, entschieden };
  });

  // Zuerst, was Kunden hat; darin zuerst, was Aufmerksamkeit braucht.
  const rang = (z: (typeof zeilen)[number]) => (z.meine.length ? 0 : 1) * 10 + (z.veraltet ? 0 : z.tafeln.length === 0 && !z.entschieden ? 1 : 2);
  zeilen.sort((a, b) => rang(a) - rang(b) || a.kv.name.localeCompare(b.kv.name, "de"));

  const inVerwendung = zeilen.filter((z) => z.meine.length);
  const baldFaellig = zeilen.filter((z) => z.meine.length && z.tageBis != null && z.tageBis <= VORWARNUNG_KV_TAGE);
  const zuPruefen = zeilen.filter((z) => z.meine.length && (z.veraltet || (!z.tafeln.length && !z.entschieden)));
  // Kunden, deren KV-Text zu keiner Tafel passt – die fallen sonst durch jedes Raster.
  const ohneTafel = kunden.filter((k) => k.kollektivvertrag && !kvs.some((kv) => zuschlagSchluessel(k.kollektivvertrag) === kv.kuerzel || k.referenzKvId === kv.id));
  const ohneKv = kunden.filter((k) => !k.kollektivvertrag && !k.referenzKvId);

  return (
    <>
      <PageHeader
        title="Kollektivverträge"
        sub="Welche Beschäftiger-KV bei unseren Kunden gelten, auf welchem Stand unsere Lohntafeln sind und wann der nächste KV-Termin fällt. Auf einen KV-Namen klicken, um ihn samt Lohntafel zu bearbeiten."
        crumbs={[{ href: "/einstellungen?tab=kv", label: "Einstellungen" }, { label: "Kollektivverträge" }]}
      />

      <Card title="Neuen Kollektivvertrag anlegen" className="mb-4 reveal">
        <form action={kvAnlegen} className="grid sm:grid-cols-3 gap-3">
          <Field label="Name" required><input name="name" required className="input" placeholder="z. B. Handel" /></Field>
          <Field label="Kürzel" required><input name="kuerzel" required className="input" placeholder="z. B. HANDEL" /></Field>
          <Field label="Gilt ab"><input type="date" name="gultigAb" className="input" /></Field>
          <Field label="Wochenstunden"><input name="wochenstunden" defaultValue="38.5" className="input num" inputMode="decimal" /></Field>
          <Field label="Monatsteiler"><input name="monatsteiler" defaultValue="167" className="input num" inputMode="decimal" /></Field>
          <Field label="Gilt für"><select name="gruppe" className="select" defaultValue="ARBEITER"><option value="ARBEITER">Arbeiter</option><option value="ANGESTELLTE">Angestellte</option><option value="BEIDE">Beide</option></select></Field>
          <label className="flex items-center gap-2 text-[14px] sm:col-span-2"><input type="checkbox" name="istReferenz" /> Beschäftiger-KV (Referenzlohn § 10 AÜG)</label>
          <div className="sm:col-span-3"><button className="btn btn-primary">Anlegen und Lohntafel pflegen</button></div>
        </form>
      </Card>
      {sp.geloescht && <div className="alert alert-teal mb-4">Kollektivvertrag gelöscht.</div>}
      {sp.fehler === "pflicht" && <div className="alert alert-red mb-4">Name und Kürzel sind Pflicht.</div>}

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Kpi label="In Verwendung" value={inVerwendung.length} sub={`von ${kvs.length} hinterlegten KV`} />
        <Kpi label="Nächster KV-Termin" value={baldFaellig.length} sub={`in den nächsten ${VORWARNUNG_KV_TAGE} Tagen`} tone={baldFaellig.length ? "amber" : undefined} />
        <Kpi label="Zu klären" value={zuPruefen.length} sub="veraltete oder fehlende Lohntafel" tone={zuPruefen.length ? "red" : "teal"} />
      </div>

      {(ohneTafel.length > 0 || ohneKv.length > 0) && (
        <div className="alert alert-amber mb-4">
          <span>
            {ohneKv.length > 0 && <><b>{ohneKv.length} Kunde{ohneKv.length === 1 ? "" : "n"} ohne Kollektivvertrag:</b> {ohneKv.map((k) => k.firmenname).join(", ")}. Ohne KV des Beschäftigers lässt sich kein Referenzlohn ermitteln. </>}
            {ohneTafel.length > 0 && <><b>{ohneTafel.length} Kunde{ohneTafel.length === 1 ? "" : "n"} mit unbekanntem KV-Text:</b> {ohneTafel.map((k) => `${k.firmenname} („${k.kollektivvertrag}“)`).join(", ")}. Im Kundenstamm die Referenzlohn-Tafel verknüpfen.</>}
          </span>
        </div>
      )}

      <Card pad={false} className="reveal">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Kollektivvertrag</th>
                <th>Kunden</th>
                <th>Lohntafel bei uns</th>
                <th>Referenzzuschlag</th>
                <th>Stand lt. WKO</th>
                <th>Nächster Termin</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.kv.id} className={z.meine.length ? "" : "opacity-60"}>
                  <td>
                    <Link href={`/kollektivvertraege/${z.kv.id}`} className="font-semibold hover:text-brand">{z.kv.name}</Link>
                    <div className="text-[12.5px] text-muted">{z.kv.kuerzel} · {z.kv.wochenstunden ?? "–"} h/Woche · Teiler {z.kv.monatsteiler ?? "–"}</div>
                  </td>
                  <td className="text-[12.5px]">
                    {z.meine.length === 0 ? <span className="text-muted">–</span> : (
                      <div>{z.meine.slice(0, 3).map((k) => <div key={k.id}><Link href={`/kunden/${k.id}`} className="hover:text-brand">{k.firmenname}</Link></div>)}{z.meine.length > 3 && <div className="text-muted">+{z.meine.length - 3} weitere</div>}</div>
                    )}
                  </td>
                  <td className="text-[12.5px]">
                    {z.tafeln.length === 0
                      ? <Badge tone="grey">nicht hinterlegt</Badge>
                      : <>{z.tafeln.map((t) => <div key={t}>{datum(new Date(t))}</div>)}<div className="text-[12.5px] text-muted">{z.kv.lohntabelle.length} Stufen</div></>}
                  </td>
                  <td className="text-[12.5px]">
                    {z.mitZuschlag > 0
                      ? <Badge tone="teal">Sätze hinterlegt</Badge>
                      : z.entschieden
                        ? <><Badge tone="brand">kein Zuschlag</Badge><div className="text-[12.5px] text-muted">{z.entschieden.von} · {datum(new Date(z.entschieden.am))}</div></>
                        : <Badge tone="amber">offen</Badge>}
                  </td>
                  <td className="text-[12.5px]">
                    {z.info?.stand ? datum(new Date(z.info.stand)) : <span className="text-muted">bei der WKO prüfen</span>}
                    {z.veraltet && <div className="text-[12.5px] text-red font-semibold">neuer als unsere Tafel</div>}
                  </td>
                  <td className="text-[12.5px]">
                    {z.termin
                      ? <><div className={z.tageBis != null && z.tageBis <= VORWARNUNG_KV_TAGE && z.meine.length ? "text-amber font-semibold" : ""}>{datum(z.termin)}</div><div className="text-[12.5px] text-muted">in {z.tageBis} Tagen{z.info?.bestaetigt ? "" : " · Termin unbestätigt"}</div></>
                      : <span className="text-muted">Termin bei der WKO prüfen</span>}
                  </td>
                  <td className="text-[12.5px]">
                    {z.info ? <a href={z.info.url} target="_blank" rel="noopener noreferrer" className="text-brand font-semibold hover:underline">WKO</a> : <span className="text-muted">–</span>}
                    {z.info && <div className="text-[12.5px] text-muted max-w-[220px]">{z.info.titel}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="help mt-4">
        Stand der WKO-Angaben: 1.9.2026, recherchiert in der Kollektivvertragsdatenbank der WKO. „Termin unbestätigt“ heißt, dass sich der
        jährliche Erhöhungstermin bei der Recherche nicht eindeutig belegen ließ – dort bitte vor dem nächsten Angebot bei der WKO nachsehen.
        Exakt gepflegt ist derzeit die metalltechnische Industrie; bei den übrigen KV verlangt die Einsatzplanung eine dokumentierte
        Entscheidung zum Referenzlohn, solange keine Tafel hinterlegt ist.
      </p>
    </>
  );
}
