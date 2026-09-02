import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { BewertungFelder } from "@/components/bewertung-felder";
import { Fuechse } from "@/components/fuechse";
import { beschaeftigerBewerten } from "../actions";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/** Der Mitarbeiter bewertet seine Beschäftiger – ehrliche Rückmeldung, die niemand beim Kunden sieht. */
export default async function AppBewerten({ searchParams }: { searchParams: Promise<{ ok?: string; einsatz?: string }> }) {
  const s = await requireApp();
  const sp = await searchParams;
  const einsaetze = await db.einsatz.findMany({
    where: { personId: s.personId },
    include: { kunde: { select: { id: true, firmenname: true } } },
    orderBy: { von: "desc" }, take: 12,
  });
  const bisher = await db.kundenBewertung.findMany({ where: { personId: s.personId }, include: { kunde: { select: { firmenname: true } } }, orderBy: { datum: "desc" } });
  const kunden = [...new Map(einsaetze.map((e) => [e.kundeId, e])).values()];
  return (
    <AppShell>
      <AppKopf titel="Beschäftiger bewerten" zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        {sp.ok && <div className="alert alert-teal"><span>Danke für deine Rückmeldung! Sie hilft uns, dich das nächste Mal besser einzusetzen.</span></div>}
        {kunden.length ? (
          <form action={beschaeftigerBewerten} className="card card-pad space-y-4">
            <div>
              <h1 className="font-display font-bold text-[22px]">Wie war es bei deinem Beschäftiger?</h1>
              <p className="text-muted text-[14px] mt-1">Deine Bewertung sehen nur wir bei Fox &amp; People – nicht der Kunde. Sie hilft uns bei der Frage, wen wir wohin schicken.</p>
            </div>
            <div className="field"><label className="label">Beschäftiger</label>
              <select name="kundeId" required defaultValue={sp.einsatz ? einsaetze.find((e) => e.id === sp.einsatz)?.kundeId ?? "" : kunden[0]?.kundeId} className="select">
                {kunden.map((e) => <option key={e.kundeId} value={e.kundeId}>{e.kunde.firmenname}</option>)}
              </select>
            </div>
            <BewertungFelder ziel="BESCHAEFTIGER" />
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="wiederArbeiten" defaultChecked /> Ich würde dort wieder arbeiten.</label>
            <button className="btn btn-primary w-full justify-center !h-12">Bewertung abgeben</button>
          </form>
        ) : (
          <section className="card card-pad text-[14px] text-muted">Du hattest noch keinen Einsatz – sobald der erste läuft, kannst du hier eine Rückmeldung geben.</section>
        )}

        {bisher.length > 0 && (
          <section className="card">
            <div className="px-5 pt-4 pb-1 section-title">Deine bisherigen Bewertungen</div>
            <ul className="divide-y divide-line">{bisher.map((b) => (
              <li key={b.id} className="px-5 py-3 text-[14px]">
                <div className="flex items-center gap-2"><Fuechse n={b.sterne} /><span className="font-semibold">{b.kunde.firmenname}</span><span className="text-muted text-[12.5px] ml-auto">{datum(b.datum)}</span></div>
                {b.kommentar && <p className="text-muted mt-1">{b.kommentar}</p>}
              </li>
            ))}</ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
