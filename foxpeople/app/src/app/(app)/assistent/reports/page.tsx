import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolle } from "@/lib/auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireRolle("SYSTEMADMIN");
  const { id } = await searchParams;
  const r = id ? await db.monatsreport.findUnique({ where: { id } }) : null;
  if (!r) notFound();
  const html = r.inhalt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/^## (.*)$/gm, "<h3>$1</h3>").replace(/^# (.*)$/gm, "<h2>$1</h2>").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/_\(([^)]*)\)_/g, "<i>($1)</i>").replace(/\n\n/g, "<p></p>");
  return (
    <>
      <PageHeader crumbs={[{ href: "/assistent?tab=reports", label: "Wissensassistent" }, { label: `Monatsreport ${String(r.monat).padStart(2, "0")}/${r.jahr}` }]} title={`Monatsreport ${String(r.monat).padStart(2, "0")}/${r.jahr}`} sub={`erstellt ${datum(r.erstelltAm)} von ${r.erstelltVon}`} actions={<><a href={`/assistent/reports/pdf?id=${r.id}`} target="_blank" className="btn btn-secondary">PDF</a><Link href="/assistent?tab=reports" className="btn btn-secondary">Zurück</Link></>} />
      <Card className="max-w-3xl reveal"><div className="prose-contract text-[14px] [&_h2]:text-xl [&_h3]:mt-4 [&_li]:ml-5 [&_li]:list-disc" dangerouslySetInnerHTML={{ __html: html }} /></Card>
    </>
  );
}
