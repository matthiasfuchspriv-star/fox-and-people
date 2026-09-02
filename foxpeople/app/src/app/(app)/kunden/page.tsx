import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { ergebnisSicht } from "@/lib/provision";
import { controlling } from "@/lib/controlling";
import { eur, pct, datum } from "@/lib/format";
import { PageHeader, Card, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function KundenPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; hinweis?: string; geloescht?: string }> }) {
  const s = await requireSession();
  const prov = ergebnisSicht(s) === "PROVISION";
  const { q = "", status = "AKTIV", hinweis, geloescht } = await searchParams;
  const where = { ...tenantWhere(s), ...(status ? { status: status as "AKTIV" | "INAKTIV" } : {}), ...(q ? { OR: [{ firmenname: { contains: q, mode: "insensitive" as const } }, { ort: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [kunden, c] = await Promise.all([
    db.kunde.findMany({ where, orderBy: { firmenname: "asc" }, include: { ansprechpartner: { where: { istHaupt: true }, take: 1 }, einsaetze: { where: { status: "AKTIV" } }, konditionen: true, kostenstelle: { select: { name: true } } } }),
    controlling(new Date().getFullYear(), tenantWhere(s).kostenstelleId),
  ]);
  const heute = new Date();
  return (
    <>
      <PageHeader title="Kunden" sub="Beschäftigerbetriebe mit Konditionen, Rahmenverträgen, Einsätzen und Deckungsbeitrag." actions={<Link href="/kunden/neu" className="btn btn-primary"><Plus size={16} />
      {hinweis === "angebot" && <div className="alert alert-brand mb-4"><span>Angebote werden beim Kunden erstellt: Kunde öffnen → Tab „Angebote“ → „Neues Angebot“.</span></div>}
      {geloescht && <div className="alert alert-teal mb-4">{geloescht} wurde endgültig gelöscht.</div>} Kunde anlegen</Link>} />
      <div className="flex flex-wrap items-center gap-2 mb-4 reveal">
        <Link href="/kunden?status=AKTIV" className={`chip-filter ${status === "AKTIV" ? "active" : ""}`}>Aktiv</Link>
        <Link href="/kunden?status=INAKTIV" className={`chip-filter ${status === "INAKTIV" ? "active" : ""}`}>Inaktiv</Link>
        <Link href="/kunden?status=" className={`chip-filter ${status === "" ? "active" : ""}`}>Alle</Link>
        <form className="ml-auto flex gap-2"><input type="hidden" name="status" value={status} /><input name="q" defaultValue={q} placeholder="Firma oder Ort…" className="input !w-64" /><button className="btn btn-secondary">Suchen</button></form>
      </div>
      <Card pad={false} className="reveal reveal-2">
        {kunden.length ? (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Kunde</th><th>Ansprechpartner</th><th>Einsätze</th><th>Konditionen</th><th>Rahmenvertrag</th><th className="r">Verrechnung {c.jahr}</th><th className="r">{prov ? "Provision" : "DB1"}</th>{!prov && <th className="r">Marge</th>}</tr></thead>
            <tbody>{kunden.map((k) => {
              const kc = c.kunden.find((x) => x.kundeId === k.id);
              const rvEnde = k.rahmenvertragEnde;
              const rv = !rvEnde ? <span className="text-muted">–</span> : rvEnde < heute ? <Badge tone="red">abgelaufen {datum(rvEnde)}</Badge> : rvEnde < new Date(heute.getTime() + k.erinnerungTageVorher * 86400000) ? <Badge tone="amber">bis {datum(rvEnde)}</Badge> : <Badge tone="teal">bis {datum(rvEnde)}</Badge>;
              return (
                <tr key={k.id}>
                  <td><Link href={`/kunden/${k.id}`} className="row-link">{k.firmenname}</Link><div className="text-[12px] text-muted">{[k.plz, k.ort].filter(Boolean).join(" ")}{!tenantWhere(s).kostenstelleId && ` · ${k.kostenstelle.name}`}</div></td>
                  <td>{k.ansprechpartner[0] ? <>{k.ansprechpartner[0].name}<div className="text-[12px] text-muted">{k.ansprechpartner[0].funktion}</div></> : <span className="text-muted">–</span>}</td>
                  <td className="num">{k.einsaetze.length}</td>
                  <td>{k.konditionen.length ? k.konditionen.slice(0, 2).map((x) => <div key={x.id} className="text-[12.5px]">{x.rolle} <span className="num text-muted">{eur(x.stundensatz)}</span></div>) : <span className="text-muted">–</span>}</td>
                  <td>{rv}</td>
                  <td className="r num">{eur(kc?.verrechnungJahr ?? 0, 0)}</td>
                  <td className={`r num font-semibold ${(prov ? kc?.provisionJahr ?? 0 : kc?.db1Jahr ?? 0) < 0 ? "text-red" : "text-teal"}`}>{prov && !c.kosten ? "–" : eur((prov ? kc?.provisionJahr : kc?.db1Jahr) ?? 0, 0)}</td>
                  {!prov && <td className="r num">{kc ? pct(kc.db1Marge) : "–"}</td>}
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty title="Keine Kunden" action={<Link href="/kunden/neu" className="btn btn-primary btn-sm">Kunde anlegen</Link>} />}
      </Card>
    </>
  );
}
