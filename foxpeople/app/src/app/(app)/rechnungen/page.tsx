import { redirect } from "next/navigation";
import Link from "next/link";
import { istZentrale, requireSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { eur, datum, MONATE } from "@/lib/format";
import { PageHeader, Card, Empty, Kpi, rechnungStatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
const ST = [["", "Alle"], ["offen", "Offen"], ["UEBERFAELLIG", "Überfällig"], ["ENTWURF", "Entwürfe"], ["BEZAHLT", "Bezahlt"]];

export default async function RechnungenPage({ searchParams }: { searchParams: Promise<{ status?: string; erzeugt?: string; fehler?: string; geloescht?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung"); // Rechnungen und Monatsabrechnung laufen über Fox & People (Zentrale)
  const sp = await searchParams;
  const status = sp.status ?? "";
  const where = { ...tenantWhere(s), ...(status === "offen" ? { status: { in: ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"] as ("VERSENDET" | "UEBERFAELLIG" | "TEILBEZAHLT")[] } } : status ? { status: status as "BEZAHLT" } : {}) };
  const [rechnungen, offen, ueberf, jahr] = await Promise.all([
    db.rechnung.findMany({ where, orderBy: [{ rechnungsdatum: "desc" }, { nummer: "desc" }], include: { kunde: true, kostenstelle: true } }),
    db.rechnung.aggregate({ where: { ...tenantWhere(s), status: { in: ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"] } }, _sum: { brutto: true, bezahltBetrag: true }, _count: true }),
    db.rechnung.aggregate({ where: { ...tenantWhere(s), status: "UEBERFAELLIG" }, _sum: { brutto: true, bezahltBetrag: true }, _count: true }),
    db.rechnung.aggregate({ where: { ...tenantWhere(s), status: { not: "STORNIERT" }, rechnungsdatum: { gte: new Date(new Date().getFullYear(), 0, 1) } }, _sum: { netto: true } }),
  ]);
  const heute = new Date();
  return (
    <>
      <PageHeader title="Rechnungen" sub="Aus der Monatsabrechnung verdichtet oder frei erfasst (Direktvermittlung, Nachverrechnung, Pauschale) – lückenlos nummeriert, mit Fälligkeit, Zahlungsstatus und dreistufigem Mahnwesen." actions={<><Link href="/rechnungen/neu" className="btn btn-secondary">Freie Rechnung</Link><Link href="/abrechnung" className="btn btn-primary">Monat abrechnen</Link></>} />
      {sp.erzeugt && <div className="alert alert-teal mb-4">{sp.erzeugt} Rechnung(en) als Entwurf erzeugt – bitte prüfen und versenden.</div>}
      {sp.fehler && <div className="alert alert-red mb-4">Keine Berechtigung für Rechnungsfreigabe.</div>}
      {sp.geloescht && <div className="alert alert-teal mb-4">Rechnung {sp.geloescht} gelöscht – die Nummer wird bei der nächsten Rechnung wieder vergeben.</div>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Kpi label="Offene Forderungen" value={eur((offen._sum.brutto ?? 0) - (offen._sum.bezahltBetrag ?? 0), 0)} sub={`${offen._count} Rechnungen`} />
        <Kpi label="Überfällig" value={eur((ueberf._sum.brutto ?? 0) - (ueberf._sum.bezahltBetrag ?? 0), 0)} tone={ueberf._count ? "red" : undefined} sub={`${ueberf._count} Rechnungen`} className="reveal-2" />
        <Kpi label={`Fakturiert ${heute.getFullYear()} (netto)`} value={eur(jahr._sum.netto ?? 0, 0)} className="reveal-3" />
        <Kpi label="Zahlungsziel Standard" value="sofort" sub="je Kunde einstellbar" className="reveal-4" />
      </div>
      <div className="flex flex-wrap gap-2 mb-4 reveal">{ST.map(([k, l]) => <Link key={k} href={`/rechnungen?status=${k}`} className={`chip-filter ${status === k ? "active" : ""}`}>{l}</Link>)}</div>
      <Card pad={false} className="reveal reveal-2">
        {rechnungen.length ? (
          <table className="table"><thead><tr><th>Nummer</th><th>Kunde</th><th>Leistung</th><th>Datum</th><th>Fällig</th><th className="r">Netto</th><th className="r">Brutto</th><th className="r">Offen</th><th>Status</th></tr></thead>
            <tbody>{rechnungen.map((r) => { const rest = r.brutto - r.bezahltBetrag; return (
              <tr key={r.id}><td><Link href={`/rechnungen/${r.id}`} className="row-link">{r.nummer}</Link>{!tenantWhere(s).kostenstelleId && <div className="text-[12px] text-muted">{r.kostenstelle.name}</div>}</td><td><Link href={`/kunden/${r.kundeId}`} className="hover:text-brand">{r.kunde.firmenname}</Link></td><td>{MONATE[r.leistungMonat - 1]} {r.leistungJahr}</td><td>{datum(r.rechnungsdatum)}</td><td className={r.faelligAm < heute && ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"].includes(r.status) ? "text-red font-semibold" : ""}>{datum(r.faelligAm)}{r.mahnstufe > 0 && <div className="text-[11.5px] text-red">Mahnstufe {r.mahnstufe}</div>}</td><td className="r num">{eur(r.netto)}</td><td className="r num font-semibold">{eur(r.brutto)}</td><td className={`r num ${rest > 0 && r.status !== "ENTWURF" ? "text-amber font-semibold" : "text-muted"}`}>{r.status === "BEZAHLT" || r.status === "STORNIERT" ? "–" : eur(rest)}</td><td>{rechnungStatusBadge(r.status)}</td></tr>
            ); })}</tbody></table>
        ) : <Empty title="Keine Rechnungen" text="Erfasse die Monatsabrechnung und erzeuge daraus Rechnungen je Kunde." action={<Link href="/abrechnung" className="btn btn-primary btn-sm">Zur Monatsabrechnung</Link>} />}
      </Card>
    </>
  );
}
