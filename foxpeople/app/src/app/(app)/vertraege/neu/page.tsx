import { requireSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, Field } from "@/components/ui";
import { vertragAnlegen } from "../actions";
import { titel } from "../titel";

export default async function NeuerVertrag({ searchParams }: { searchParams: Promise<{ einsatzId?: string; personId?: string; kundeId?: string; typ?: string; fehler?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const [vorlagen, personen, kunden, einsaetze] = await Promise.all([
    db.vertragsvorlage.findMany({ where: { aktiv: true, OR: [{ kostenstelleId: null }, tenantWhere(s).kostenstelleId ? { kostenstelleId: tenantWhere(s).kostenstelleId } : {}] }, orderBy: { name: "asc" } }),
    db.person.findMany({ where: { ...tenantWhere(s), status: { in: ["SUCHT", "VERMITTELT"] } }, orderBy: { nachname: "asc" }, select: { id: true, vorname: true, nachname: true } }),
    db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, select: { id: true, firmenname: true } }),
    db.einsatz.findMany({ where: { ...tenantWhere(s), status: { in: ["GEPLANT", "AKTIV"] } }, include: { person: true, kunde: true }, orderBy: { von: "desc" } }),
  ]);
  const vorlage = vorlagen.find((v) => v.typ === sp.typ) ?? vorlagen[0];
  return (
    <>
      <PageHeader title="Vertrag erstellen" crumbs={[{ href: "/vertraege", label: "Verträge" }, { label: "Neu" }]} />
      {sp.fehler && <div className="alert alert-red mb-4">Bitte Vorlage und Bezug (Einsatz, Person oder Kunde) wählen.</div>}
      <Card className="max-w-2xl reveal">
        <form action={vertragAnlegen} className="space-y-4">
          <Field label="Vorlage" required><select name="vorlageId" required defaultValue={vorlage?.id ?? ""} className="select">{vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name} ({titel(v.typ)})</option>)}</select></Field>
          <Field label="Einsatz (empfohlen – füllt Person, Kunde und Einsatzdaten)"><select name="einsatzId" defaultValue={sp.einsatzId ?? ""} className="select"><option value="">–</option>{einsaetze.map((e) => <option key={e.id} value={e.id}>{e.person.vorname} {e.person.nachname} @ {e.kunde.firmenname} · {e.rolleImEinsatz}</option>)}</select></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="oder Person"><select name="personId" defaultValue={sp.personId ?? ""} className="select"><option value="">–</option>{personen.map((p) => <option key={p.id} value={p.id}>{p.nachname} {p.vorname}</option>)}</select></Field>
            <Field label="oder Kunde"><select name="kundeId" defaultValue={sp.kundeId ?? ""} className="select"><option value="">–</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select></Field>
          </div>
          <p className="help">Der Vertragstext wird aus der Vorlage erzeugt und kann vor dem Versand noch bearbeitet werden. Platzhalter, die nicht befüllt werden konnten, erscheinen als [platzhalter].</p>
          <button className="btn btn-primary">Vertrag erzeugen</button>
        </form>
      </Card>
    </>
  );
}
