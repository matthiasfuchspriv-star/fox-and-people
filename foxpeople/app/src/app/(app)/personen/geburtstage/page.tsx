import Link from "next/link";
import { requireSession, tenantWhere } from "@/lib/auth";
import { geburtstageDemnaechst } from "@/lib/geburtstage";
import { datum, MONATE_LANG } from "@/lib/format";
import { PageHeader, Card, personStatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GeburtstagePage() {
  const s = await requireSession();
  const alle = await geburtstageDemnaechst(tenantWhere(s).kostenstelleId, 366);
  const bald = alle.filter((g) => g.inTagen <= 30);
  const nachMonat = new Map<number, typeof alle>();
  for (const g of alle) { const m = g.datum.getMonth(); if (!nachMonat.has(m)) nachMonat.set(m, []); nachMonat.get(m)!.push(g); }
  return (
    <>
      <PageHeader title="Geburtstagsliste" sub="Bewerber und aktive Mitarbeiter – die nächsten 30 Tage oben, darunter das ganze Jahr." crumbs={[{ href: "/personen", label: "Bewerber & Mitarbeiter" }, { label: "Geburtstage" }]} />
      <Card title="Nächste 30 Tage" pad={false} className="mb-4 reveal">
        {bald.length ? <table className="table"><thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Status</th><th className="r">wird</th><th className="r">in Tagen</th></tr></thead><tbody>{bald.map((g) => <tr key={g.id} className={g.heute ? "!bg-fox-soft" : ""}><td className="font-semibold">{datum(g.datum)}{g.heute && <span className="badge badge-fox ml-2">heute</span>}</td><td><Link href={`/personen/${g.id}`} className="row-link">{g.name}</Link><div className="text-[12px] text-muted">{g.kostenstelle}</div></td><td>{personStatusBadge(g.status)}</td><td className="r num">{g.wird}</td><td className="r num">{g.inTagen}</td></tr>)}</tbody></table> : <p className="p-5 text-muted text-[13px]">Keine Geburtstage in den nächsten 30 Tagen.</p>}
      </Card>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...nachMonat.entries()].sort((a, b) => a[0] - b[0]).map(([m, list]) => (
          <Card key={m} title={MONATE_LANG[m]} className="reveal reveal-2"><ul className="divide-y divide-line">{list.sort((a, b) => a.datum.getDate() - b.datum.getDate()).map((g) => <li key={g.id} className="py-1.5 flex justify-between text-[13.5px]"><span><span className="num text-muted mr-2">{String(g.datum.getDate()).padStart(2, "0")}.</span><Link href={`/personen/${g.id}`} className="hover:text-brand">{g.name}</Link></span><span className="text-muted num">{g.wird}</span></li>)}</ul></Card>
        ))}
      </div>
    </>
  );
}
