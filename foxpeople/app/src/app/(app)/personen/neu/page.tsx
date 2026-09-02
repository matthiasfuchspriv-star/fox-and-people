import { requireSession, tenantWhere, istZentrale, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PersonForm } from "../form";
import { personAnlegen } from "../actions";

export default async function NeuePerson({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const [kunden, kvs, kostenstellen] = await Promise.all([
    db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, select: { id: true, firmenname: true } }),
    db.kollektivvertrag.findMany({ include: { lohntabelle: true } }),
    istZentrale(s) ? db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: { isZentrale: "desc" } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title="Person aufnehmen" sub="Bewerber oder Mitarbeiter in die Personal-Datenbank aufnehmen." crumbs={[{ href: "/personen", label: "Bewerber & Mitarbeiter" }, { label: "Neu" }]} />
      {sp.fehler === "name" && <div className="alert alert-red mb-4">Bitte Vor- und Nachname angeben.</div>}
      {sp.fehler === "staat" && <div className="alert alert-red mb-4">Bitte die Staatsangehörigkeit auswählen (Pflichtfeld).</div>}
      <PersonForm p={{ kostenstelleId: s.aktiveKostenstelleId ?? undefined }} kunden={kunden} kvs={kvs} kostenstellen={kostenstellen} sensibel={darfSensibel(s)} action={personAnlegen} />
    </>
  );
}
