import { notFound } from "next/navigation";
import { requireSession, tenantWhere, darfKostenstelle, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { PageHeader } from "@/components/ui";
import { PersonForm } from "../../form";
import { personSpeichern } from "../../actions";

export default async function PersonBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const p = await db.person.findUnique({ where: { id }, include: { berufserfahrung: { orderBy: { reihenfolge: "asc" } } } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId)) notFound();
  const sensibel = darfSensibel(s);
  const svnr = sensibel ? decryptField(p.svnrEnc) : null;
  if (sensibel && p.svnrEnc) await audit(s, "VIEW_SENSITIVE", "Person", id, "SVNR im Bearbeiten-Formular angezeigt", undefined, p.kostenstelleId);
  const [kunden, kvs, empfehlung, staplerQ] = await Promise.all([
    db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, select: { id: true, firmenname: true } }),
    db.kollektivvertrag.findMany({ include: { lohntabelle: true } }),
    // „Freunde werben Freunde“: Wer hat diese Person geworben? Steht neben der Bewerbungsquelle.
    db.empfehlung.findFirst({ where: { empfohlenePersonId: id }, include: { werber: { select: { vorname: true, nachname: true } } } }),
    db.qualifikation.findFirst({ where: { personId: id, typ: { contains: "stapler", mode: "insensitive" } } }),
  ]);
  const werber = empfehlung ? `${empfehlung.werber.vorname} ${empfehlung.werber.nachname}`.trim() : null;
  const action = personSpeichern.bind(null, id);
  return (
    <>
      <PageHeader title={`${p.vorname} ${p.nachname} bearbeiten`} crumbs={[{ href: "/personen", label: "Bewerber & Mitarbeiter" }, { href: `/personen/${id}`, label: `${p.nachname} ${p.vorname}` }, { label: "Bearbeiten" }]} />
      <PersonForm p={p} kunden={kunden} kvs={kvs} kostenstellen={null} sensibel={sensibel} action={action} svnrKlartext={svnr} werdegang={p.berufserfahrung} werber={werber} stapler={Boolean(staplerQ)} />
    </>
  );
}
