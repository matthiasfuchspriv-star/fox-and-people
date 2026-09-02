import Link from "next/link";
import { requireRolle } from "@/lib/auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { PageHeader, Card, Field, Empty, Badge } from "@/components/ui";
import { Chat } from "./chat";
import { wissenHochladen, wissenLoeschen, reportErzeugen } from "./actions";

export const dynamic = "force-dynamic";

export default async function AssistentPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string }> }) {
  await requireRolle("SYSTEMADMIN");
  const { tab = "chat", ok } = await searchParams;
  const [docs, reports, kostenstellen] = await Promise.all([
    db.wissenDokument.findMany({ orderBy: { erstelltAm: "desc" }, include: { _count: { select: { chunks: true } } } }),
    db.monatsreport.findMany({ orderBy: { erstelltAm: "desc" }, take: 12 }),
    db.kostenstelle.findMany({ where: { aktiv: true } }),
  ]);
  const key = !!process.env.ANTHROPIC_API_KEY;
  const heute = new Date();
  return (
    <>
      <PageHeader title="Wissensassistent" sub="Nur für den Systemadmin: Fragen zu Arbeitsrecht, AÜG, Kalkulation und Firmenwissen – mit Quellen aus den hinterlegten Unterlagen – sowie Monatsreports aus den Live-Daten." />
      <div className="tabs mb-5 reveal"><Link href="/assistent?tab=chat" className={`tab ${tab === "chat" ? "active" : ""}`}>Fragen</Link><Link href="/assistent?tab=wissen" className={`tab ${tab === "wissen" ? "active" : ""}`}>Wissensbasis ({docs.length})</Link><Link href="/assistent?tab=reports" className={`tab ${tab === "reports" ? "active" : ""}`}>Monatsreports</Link></div>
      {!key && <div className="alert alert-amber mb-4"><span><strong>Kein ANTHROPIC_API_KEY hinterlegt.</strong> Der Assistent arbeitet im extraktiven Modus (zeigt passende Textstellen). Mit API-Key (Anthropic Console) antwortet er ausformuliert und schreibt die Einschätzung im Monatsreport.</span></div>}
      {ok && <div className="alert alert-teal mb-4">{ok} Dokument(e) importiert und indexiert.</div>}

      {tab === "chat" && <Chat beispiele={["Welche Kündigungsfristen gelten im KV Arbeitskräfteüberlassung für Arbeiter?", "Was muss laut § 12 AÜG in der Überlassungsmitteilung stehen?", "Wie setzt sich der Überlassungsfaktor 1,98 nach WIFI zusammen?", "Wie läuft unser Monat bisher – wo ist der DB1 am schwächsten?", "Was gilt beim Referenzlohn (§ 10 AÜG) im Beschäftigerbetrieb?"]} />}

      {tab === "wissen" && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <Card title="Hinterlegtes Wissen" pad={false} className="reveal">
            {docs.length ? <table className="table"><thead><tr><th>Dokument</th><th>Kategorie</th><th className="r">Abschnitte</th><th className="r">Zeichen</th><th>Importiert</th><th></th></tr></thead><tbody>{docs.map((d) => <tr key={d.id}><td className="font-semibold">{d.titel}<div className="text-[12.5px] text-muted font-normal">{d.quelle}</div></td><td><Badge tone={d.kategorie === "Arbeitsrecht" ? "violet" : d.kategorie === "Kalkulation" ? "fox" : "brand"}>{d.kategorie}</Badge></td><td className="r num">{d._count.chunks}</td><td className="r num">{d.zeichen.toLocaleString("de-AT")}</td><td className="text-muted">{datum(d.erstelltAm)}</td><td className="r"><form action={wissenLoeschen.bind(null, d.id)}><button className="btn btn-ghost btn-sm text-red">Entfernen</button></form></td></tr>)}</tbody></table> : <Empty title="Noch kein Wissen hinterlegt" text="PDF, DOCX, PPTX, TXT oder Markdown hochladen – z. B. Arbeitsrecht-Unterlagen, AÜ-Seminar, WIFI-Kalkulation, Konzepte, AGB." />}
          </Card>
          <Card title="Dokumente hochladen" className="reveal reveal-2">
            <form action={wissenHochladen} className="space-y-3" encType="multipart/form-data">
              <Field label="Dateien (mehrere möglich)"><input type="file" name="dateien" multiple required accept=".pdf,.docx,.pptx,.txt,.md" className="input" /></Field>
              <Field label="Kategorie"><select name="kategorie" className="select">{["Arbeitsrecht", "Kalkulation", "Firmenwissen", "Vorlagen", "Verträge & AGB"].map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Field label="Titel (optional, bei einer Datei)"><input name="titel" className="input" /></Field>
              <button className="btn btn-primary w-full justify-center">Importieren & indexieren</button>
              <p className="help">Der Text wird extrahiert, in Abschnitte zerlegt und per Volltextsuche (Deutsch) durchsuchbar. Die Dateien selbst werden nicht an Dritte weitergegeben; bei aktivem API-Key werden nur die passenden Textstellen an Anthropic gesendet.</p>
            </form>
          </Card>
        </div>
      )}

      {tab === "reports" && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <Card title="Monatsreports" pad={false} className="reveal">
            {reports.length ? <ul className="divide-y divide-line">{reports.map((r) => <li key={r.id} className="px-5 py-3 flex items-center gap-3"><div className="flex-1"><Link href={`/assistent/reports?id=${r.id}`} className="font-semibold hover:text-brand">Monatsreport {String(r.monat).padStart(2, "0")}/{r.jahr}</Link><div className="text-[12.5px] text-muted">{r.kostenstelleId ? kostenstellen.find((k) => k.id === r.kostenstelleId)?.name : "alle Kostenstellen"} · erstellt {datum(r.erstelltAm)} von {r.erstelltVon}</div></div><Link href={`/assistent/reports?id=${r.id}`} className="btn btn-secondary btn-sm">Öffnen</Link></li>)}</ul> : <Empty title="Noch kein Report" text="Erzeuge den ersten Monatsreport – Kennzahlen, Vertrieb, Forderungen und (mit API-Key) eine Management-Einschätzung." />}
          </Card>
          <Card title="Report erzeugen" className="reveal reveal-2">
            <form action={reportErzeugen} className="space-y-3">
              <div className="grid grid-cols-2 gap-3"><Field label="Monat"><select name="monat" defaultValue={heute.getMonth() + 1} className="select">{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>)}</select></Field><Field label="Jahr"><input name="jahr" defaultValue={heute.getFullYear()} className="input num" /></Field></div>
              <Field label="Kostenstelle"><select name="kostenstelleId" className="select"><option value="">alle</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
              <button className="btn btn-primary w-full justify-center">Monatsreport erzeugen</button>
              <p className="help">Tipp: Als monatliche Routine am 1. des Folgemonats – der Report kann als PDF gespeichert werden.</p>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
