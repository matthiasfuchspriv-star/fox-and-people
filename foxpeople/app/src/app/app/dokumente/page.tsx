import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { FileDown, FileCheck2, Clock } from "lucide-react";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/** Alle Unterlagen des Mitarbeiters: unterschriebene Verträge, Überlassungsmitteilungen, eigene Uploads, Nachweise. */
export default async function AppDokumente() {
  const s = await requireApp();
  const [docs, quals] = await Promise.all([
    db.dokument.findMany({ where: { personId: s.personId, sichtbarImPortal: true, kategorie: { not: "Lohnzettel" } }, orderBy: { hochgeladenAm: "desc" } }),
    db.qualifikation.findMany({ where: { personId: s.personId }, orderBy: { gultigBis: "asc" } }),
  ]);
  const gruppen: [string, string[]][] = [["Verträge & Vereinbarungen", ["Dienstvertrag", "Arbeitsvertrag", "Zusatzvereinbarung", "Überlassungsmitteilung", "Einsatzbestätigung", "AGB-Bestätigung"]], ["Meine Nachweise", ["Führerschein", "Staplerschein", "Kranschein", "Aufenthaltstitel / Arbeitserlaubnis", "Sicherheitsunterweisung", "Gesundheitszeugnis", "Qualifikationsnachweis", "Ausweis", "e-card", "Meldezettel"]], ["Stundennachweise & Meldungen", ["Stundennachweis", "Krankenstandsbestätigung", "Urlaubsantrag"]]];
  const rest = docs.filter((d) => !gruppen.some(([, k]) => k.includes(d.kategorie)) && d.kategorie !== "Foto");
  const heute = new Date();
  return (
    <AppShell>
      <AppKopf titel="Meine Unterlagen" zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        {quals.length > 0 && (
          <section className="card">
            <div className="px-5 pt-4 pb-1 section-title">Nachweise & Ablauf</div>
            <ul className="divide-y divide-line">{quals.map((q) => { const t = q.gultigBis ? (q.gultigBis.getTime() - heute.getTime()) / 86400000 : null; return <li key={q.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]"><FileCheck2 size={16} className={t != null && t < 30 ? "text-red" : "text-teal"} /><span className="flex-1">{q.typ}{q.nummer ? ` · ${q.nummer}` : ""}</span><span className={`text-[12px] ${t != null && t < 30 ? "text-red font-semibold" : "text-muted"}`}>{q.gultigBis ? (t! < 0 ? "abgelaufen" : `bis ${datum(q.gultigBis)}`) : "unbefristet"}</span></li>; })}</ul>
          </section>
        )}
        {[...gruppen, ["Sonstiges", []] as [string, string[]]].map(([titel, kats]) => { const list = titel === "Sonstiges" ? rest : docs.filter((d) => kats.includes(d.kategorie)); if (!list.length) return null; return (
          <section key={titel} className="card">
            <div className="px-5 pt-4 pb-1 section-title">{titel}</div>
            <ul className="divide-y divide-line">{list.map((d) => <li key={d.id}><a href={`/dokumente/${d.id}`} target="_blank" className="flex items-center gap-3 px-5 py-3"><FileDown size={18} className="text-fox shrink-0" /><div className="flex-1 min-w-0"><div className="font-semibold text-[13.5px] truncate">{d.dateiname}</div><div className="text-[12px] text-muted">{d.kategorie} · {datum(d.hochgeladenAm)}{!d.geprueft && <span className="inline-flex items-center gap-1 ml-2 text-amber"><Clock size={11} /> wird geprüft</span>}</div></div></a></li>)}</ul>
          </section>); })}
        {!docs.length && <section className="card card-pad text-[13.5px] text-muted">Noch keine Unterlagen freigegeben. Unterschriebene Verträge und deine Nachweise erscheinen hier, sobald sie hinterlegt sind.</section>}
        <p className="text-[12px] text-muted">Fehlt etwas? Unter „Profil“ kannst du Nachweise selbst hochladen.</p>
      </div>
    </AppShell>
  );
}
