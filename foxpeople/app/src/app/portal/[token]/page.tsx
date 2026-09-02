import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { datum } from "@/lib/format";
import { Logo } from "@/components/login-shell";
import { FileDown } from "lucide-react";
import { kundeBewertenPortal } from "./actions";
import { BewertungFelder } from "@/components/bewertung-felder";

export const dynamic = "force-dynamic";

export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ danke?: string }> }) {
  const { token } = await params;
  const { danke } = await searchParams;
  const t = await db.portalToken.findUnique({ where: { tokenHash: sha256(token) }, include: { person: { include: { dokumente: { where: { sichtbarImPortal: true }, orderBy: { hochgeladenAm: "desc" } }, einsaetze: { where: { status: { in: ["AKTIV", "GEPLANT", "BEENDET"] } }, include: { kunde: true }, orderBy: { von: "desc" } }, kundenBewertungen: true } } } });
  // Sperre und Austritt beenden auch den Magic-Link: Ein heute gekündigter Mitarbeiter behält sonst
  // bis zu 7 Tage Zugriff auf alle freigegebenen Dokumente inklusive Lohnzettel.
  const gesperrt = t && (t.person.appGesperrtAm || t.person.status === "AUSGESCHIEDEN" || t.person.status === "GESPERRT");
  const gueltig = t && t.gultigBis > new Date() && !gesperrt;
  if (t && gueltig && !t.verwendetAm) await db.portalToken.update({ where: { id: t.id }, data: { verwendetAm: new Date() } });
  return (
    <main className="min-h-screen bg-bg">
      <header className="text-white px-6 py-4 bg-brand-ink"><div className="flex items-center gap-3"><Logo size={32} /><span className="ml-auto text-white/60 text-[12.5px]">Mitarbeiter-Portal</span></div></header>
      <div className="max-w-2xl mx-auto p-6">
        {!gueltig ? (
          <div className="card card-pad text-center"><h1 className="font-display font-extrabold text-xl mb-2">Link ungültig oder abgelaufen</h1><p className="text-muted text-[14px]">Bitte bei Fox & People einen neuen Zugangslink anfordern.</p></div>
        ) : (
          <>
            <h1 className="font-display font-extrabold text-2xl mb-1">Hallo {t.person.vorname}!</h1>
            <p className="text-muted text-[14px] mb-5">Hier findest du deine Unterlagen. Dieser Link ist bis {datum(t.gultigBis)} gültig.</p>
            {t.person.einsaetze.filter((e) => e.status !== "BEENDET").length > 0 && <div className="card card-pad mb-4"><div className="section-title mb-2">Aktueller Einsatz</div>{t.person.einsaetze.filter((e) => e.status !== "BEENDET").map((e) => <div key={e.id} className="text-[14px]"><b>{e.kunde.firmenname}</b> · {e.rolleImEinsatz} · seit {datum(e.von)}{e.einsatzort && ` · ${e.einsatzort}`}</div>)}</div>}
            {danke && <div className="alert alert-teal mb-4">Danke für deine Rückmeldung!</div>}
            {t.person.einsaetze.length > 0 && (
              <div className="card card-pad mb-4">
                <div className="section-title mb-2">Wie war es beim Kunden?</div>
                <form action={kundeBewertenPortal.bind(null, token)} className="space-y-3">
                  <select name="kundeId" className="select">{[...new Map(t.person.einsaetze.map((e) => [e.kundeId, e.kunde])).values()].map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select>
                  <BewertungFelder ziel="BESCHAEFTIGER" kompakt kommentarPlaceholder="Einschulung, Kollegen, Sicherheit, Arbeitszeiten … (optional)" />
                  <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="wieder" defaultChecked /> Ich würde dort wieder arbeiten.</label>
                  <button className="btn btn-primary w-full justify-center">Rückmeldung senden</button>
                </form>
              </div>
            )}
            <div className="card">
              <div className="px-5 pt-4 pb-2 font-display font-bold">Dokumente</div>
              {t.person.dokumente.length ? <ul className="divide-y divide-line">{t.person.dokumente.map((d) => <li key={d.id} className="px-5 py-3 flex items-center gap-3"><div className="flex-1"><div className="font-semibold text-[14px]">{d.dateiname}</div><div className="text-[12.5px] text-muted">{d.kategorie} · {datum(d.hochgeladenAm)}</div></div><a href={`/portal/${token}/dokument/${d.id}`} className="btn btn-secondary btn-sm"><FileDown size={14} /> Öffnen</a></li>)}</ul> : <p className="px-5 pb-5 text-muted text-[14px]">Noch keine Dokumente freigegeben.</p>}
            </div>
            <p className="text-[12.5px] text-muted mt-6">Fragen? office@foxandpeople.at · +43 676 4574096 · Bitte diesen Link nicht weitergeben.</p>
          </>
        )}
      </div>
    </main>
  );
}
