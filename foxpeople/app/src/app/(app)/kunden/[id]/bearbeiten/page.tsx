import { notFound } from "next/navigation";
import { requireSession, darfKostenstelle } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { KundeForm } from "../../form";
import { kundeSpeichern } from "../../actions";

export default async function KundeBearbeiten({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { fehler } = await searchParams;
  const s = await requireSession();
  const { id } = await params;
  const k = await db.kunde.findUnique({ where: { id } });
  if (!k || !darfKostenstelle(s, k.kostenstelleId)) notFound();
  const referenzKvs = await db.kollektivvertrag.findMany({ where: { istReferenz: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kuerzel: true, referenzzuschlagPruefen: true, gruppe: true } });
  return (
    <>
      <PageHeader title={`${k.firmenname} bearbeiten`} crumbs={[{ href: "/kunden", label: "Kunden" }, { href: `/kunden/${id}`, label: k.firmenname }, { label: "Bearbeiten" }]} />
      {fehler === "pflicht" && <div className="alert alert-red mb-4">Arbeitszeitmodell, WKO-Kollektivvertrag und KV-Gültigkeit sind Pflichtfelder.</div>}
      {fehler === "stammdaten" && <div className="alert alert-red mb-4">UID, Adresse (Straße, PLZ, Ort) und Rechnungs-E-Mail sind Pflichtfelder.</div>}
      <KundeForm k={k} kostenstellen={null} referenzKvs={referenzKvs} action={kundeSpeichern.bind(null, id)} />
    </>
  );
}
