import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { PageHeader, Card, Empty, vertragStatusBadge } from "@/components/ui";
import { titel } from "./titel";

export const dynamic = "force-dynamic";

export default async function VertraegePage() {
  const s = await requireSession();
  const vertraege = await db.vertrag.findMany({ where: tenantWhere(s), orderBy: { erstelltAm: "desc" }, include: { person: true, kunde: true, kostenstelle: true } });
  return (
    <>
      <PageHeader title="Verträge" sub="Arbeitsverträge, Überlassungsmitteilungen (§ 12 AÜG), Überlassungs- und Rahmenverträge – aus Vorlagen mit automatisch eingesetzten Stamm- und Einsatzdaten." actions={<Link href="/vertraege/neu" className="btn btn-primary"><Plus size={16} /> Vertrag erstellen</Link>} />
      <Card pad={false} className="reveal">
        {vertraege.length ? (
          <table className="table"><thead><tr><th>Nummer</th><th>Typ</th><th>Bezug</th><th>Erstellt</th><th>Status</th><th>Unterschrieben</th></tr></thead>
            <tbody>{vertraege.map((v) => <tr key={v.id}><td><Link href={`/vertraege/${v.id}`} className="row-link">{v.nummer}</Link></td><td>{titel(v.typ)}</td><td>{v.person && <Link href={`/personen/${v.personId}`} className="hover:text-brand">{v.person.vorname} {v.person.nachname}</Link>}{v.person && v.kunde && " · "}{v.kunde && <Link href={`/kunden/${v.kundeId}`} className="hover:text-brand">{v.kunde.firmenname}</Link>}</td><td>{datum(v.erstelltAm)}</td><td>{vertragStatusBadge(v.status)}</td><td>{datum(v.unterschriebenAm)}</td></tr>)}</tbody></table>
        ) : <Empty title="Noch keine Verträge" text="Verträge werden aus Vorlagen erzeugt – die Stamm- und Einsatzdaten werden automatisch eingesetzt." action={<Link href="/vertraege/neu" className="btn btn-primary btn-sm">Vertrag erstellen</Link>} />}
      </Card>
    </>
  );
}
