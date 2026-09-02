import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession, tenantWhere, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { ergebnisSicht, provisionPct, ladeControllingkosten } from "@/lib/provision";
import { eur, pct, datum } from "@/lib/format";
import { PageHeader, Card, Empty, angebotStatusBadge } from "@/components/ui";
import type { PositionKalkulation } from "@/lib/angebot-kalkulation";

export const dynamic = "force-dynamic";
const ST = [["", "Alle"], ["ENTWURF", "Entwürfe"], ["VERSENDET", "Versendet"], ["ANGENOMMEN", "Angenommen"], ["ABGELEHNT", "Abgelehnt"]];

export default async function AngebotePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await requireSession();
  const { status = "" } = await searchParams;
  const angebote = await db.angebot.findMany({ where: { ...tenantWhere(s), ...(status ? { status: status as "ENTWURF" } : {}) }, orderBy: { datum: "desc" }, include: { kunde: true, positionen: true, kostenstelle: true } });
  const sensibel = darfSensibel(s);
  const prov = ergebnisSicht(s) === "PROVISION";
  const kostenMa = (await ladeControllingkosten(new Date().getFullYear()))?.kostenProMitarbeiterMonat ?? null;
  // Kostenstellen sehen statt DB1 ihre Provision (Anteil je Kalkulationsart)
  const sum = (a: (typeof angebote)[number]) => a.positionen.reduce((acc, p) => { const k = p.kalkulation as unknown as PositionKalkulation | null; const d = k?.db1Monat ?? 0; const db2 = d - (kostenMa ?? 0) * (k?.kalkulationsart === "VERMITTLUNG" ? 1 : (p.anzahlPersonen ?? 1)); return { u: acc.u + (k?.umsatzMonat ?? 0), d: acc.d + (prov ? (db2 * provisionPct(a.kostenstelle, k?.kalkulationsart === "VERMITTLUNG" ? "DIREKTVERMITTLUNG" : "UEBERLASSUNG")) / 100 : d) }; }, { u: 0, d: 0 });
  return (
    <>
      <PageHeader title="Angebote" sub={prov ? "Kalkuliert nach dem WIFI-NÖ-Schema – deine Provision in Echtzeit, bevor das Angebot rausgeht." : "Kalkuliert nach dem WIFI-NÖ-Schema – DB1 und Marge in Echtzeit, bevor das Angebot rausgeht."} actions={<Link href="/angebote/neu" className="btn btn-primary"><Plus size={16} /> Neues Angebot</Link>} />
      <div className="flex flex-wrap gap-2 mb-4 reveal">{ST.map(([k, l]) => <Link key={k} href={`/angebote?status=${k}`} className={`chip-filter ${status === k ? "active" : ""}`}>{l}</Link>)}</div>
      <Card pad={false} className="reveal reveal-2">
        {angebote.length ? (
          <table className="table"><thead><tr><th>Nummer</th><th>Kunde</th><th>Betreff</th><th>Datum</th><th>Status</th><th className="r">Volumen/Monat</th>{sensibel && <><th className="r">{prov ? "Provision" : "DB1"}/Monat</th>{!prov && <th className="r">Marge</th>}</>}</tr></thead>
            <tbody>{angebote.map((a) => { const t = sum(a); return (
              <tr key={a.id}><td><Link href={`/angebote/${a.id}`} className="row-link">{a.nummer}</Link>{!tenantWhere(s).kostenstelleId && <div className="text-[12px] text-muted">{a.kostenstelle.name}</div>}</td><td><Link href={`/kunden/${a.kundeId}`} className="hover:text-brand">{a.kunde.firmenname}</Link></td><td>{a.betreff}<div className="text-[12px] text-muted">{a.positionen.length} Position{a.positionen.length !== 1 && "en"}</div></td><td>{datum(a.datum)}<div className="text-[12px] text-muted">gültig bis {datum(a.gultigBis)}</div></td><td>{angebotStatusBadge(a.status)}</td><td className="r num">{eur(t.u, 0)}</td>{sensibel && <><td className={`r num font-semibold ${t.d < 0 ? "text-red" : "text-teal"}`}>{prov && kostenMa == null ? "–" : eur(t.d, 0)}</td>{!prov && <td className="r num">{t.u ? pct(t.d / t.u) : "–"}</td>}</>}</tr>
            ); })}</tbody></table>
        ) : <Empty title="Noch keine Angebote" action={<Link href="/angebote/neu" className="btn btn-primary btn-sm">Neues Angebot</Link>} />}
      </Card>
    </>
  );
}
