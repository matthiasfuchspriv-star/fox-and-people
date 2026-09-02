import { redirect } from "next/navigation";
import { requireSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, Field } from "@/components/ui";
import { angebotAnlegen } from "../actions";

export default async function NeuesAngebot({ searchParams }: { searchParams: Promise<{ kundeId?: string; fehler?: string }> }) {
  // Angebote werden immer beim Kunden erstellt (Kunden → Angebote → Neues Angebot)
  if (!(await searchParams).kundeId) redirect("/kunden?hinweis=angebot");
  const s = await requireSession();
  const sp = await searchParams;
  const kunden = await db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" } });
  return (
    <>
      <PageHeader title="Neues Angebot" crumbs={[{ href: "/angebote", label: "Angebote" }, { label: "Neu" }]} />
      {sp.fehler && <div className="alert alert-red mb-4">Bitte einen Kunden wählen.</div>}
      <Card className="max-w-xl reveal">
        <form action={angebotAnlegen} className="space-y-4">
          <Field label="Kunde" required><select name="kundeId" required defaultValue={sp.kundeId ?? ""} className="select"><option value="">– wählen –</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select></Field>
          <Field label="Betreff"><input name="betreff" defaultValue="Angebot Arbeitskräfteüberlassung" className="input" /></Field>
          <p className="help">Die Angebotsnummer wird automatisch aus dem Nummernkreis der Kostenstelle vergeben. Danach kalkulierst du die Positionen im Editor.</p>
          <button className="btn btn-primary">Angebot anlegen & kalkulieren</button>
        </form>
      </Card>
    </>
  );
}
