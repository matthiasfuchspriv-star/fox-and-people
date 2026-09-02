import { requireSession, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { KundeForm } from "../form";
import { kundeAnlegen } from "../actions";

export default async function NeuerKunde({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const s = await requireSession();
  const { fehler } = await searchParams;
  const kostenstellen = istZentrale(s) ? await db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: { isZentrale: "desc" } }) : null;
  const referenzKvs = await db.kollektivvertrag.findMany({ where: { istReferenz: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kuerzel: true, referenzzuschlagPruefen: true, gruppe: true } });
  return (
    <>
      <PageHeader title="Kunde anlegen" crumbs={[{ href: "/kunden", label: "Kunden" }, { label: "Neu" }]} />
      {fehler === "name" && <div className="alert alert-red mb-4">Bitte Firmenname angeben.</div>}
      {fehler === "pflicht" && <div className="alert alert-red mb-4">Arbeitszeitmodell, WKO-Kollektivvertrag und KV-Gültigkeit sind Pflichtfelder.</div>}
      {fehler === "stammdaten" && <div className="alert alert-red mb-4">UID, Adresse (Straße, PLZ, Ort) und Rechnungs-E-Mail sind Pflichtfelder.</div>}
      {fehler === "ansprechpartner" && <div className="alert alert-red mb-4">Der Hauptansprechpartner muss vollständig ausgefüllt sein (Name, Funktion, Telefon, E-Mail).</div>}
      <KundeForm k={{ kostenstelleId: s.aktiveKostenstelleId ?? undefined }} kostenstellen={kostenstellen} referenzKvs={referenzKvs} action={kundeAnlegen} />
    </>
  );
}
