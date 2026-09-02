import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { isoWoche, montagDerKw } from "@/lib/wochen";
import { FEHLZEITEN, type Tageseintrag } from "@/lib/zeitaufzeichnung";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { stundenEinreichen } from "../actions";
import { SchichtVorlagen } from "./vorlagen";
import { StundenRechner } from "./rechner";
import { AbsendenKnopf } from "../absenden";
import { appT } from "@/lib/app-sprache";
import { navLabels } from "@/lib/app-nav-labels";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Wöchentlicher Stundennachweis: Stunden je Tag + Foto des vom Beschäftiger unterschriebenen Zettels. */
export default async function AppStunden({ searchParams }: { searchParams: Promise<{ jahr?: string; kw?: string; ok?: string; fehler?: string }> }) {
  const s = await requireApp();
  const sp = await searchParams;
  const { t } = await appT(s.personId);
  const heute = new Date();
  const w = sp.jahr && sp.kw ? { jahr: Number(sp.jahr), kw: Number(sp.kw) } : isoWoche(heute);
  const montag = montagDerKw(w.jahr, w.kw);
  const tage = Array.from({ length: 7 }, (_, i) => new Date(montag.getFullYear(), montag.getMonth(), montag.getDate() + i));
  const prev = isoWoche(new Date(montag.getTime() - 7 * 86400000)); const next = isoWoche(new Date(montag.getTime() + 7 * 86400000));
  const [n, letzte, einsatz, p] = await Promise.all([
    db.stundennachweis.findUnique({ where: { personId_jahr_kw: { personId: s.personId, jahr: w.jahr, kw: w.kw } } }),
    db.stundennachweis.findMany({ where: { personId: s.personId }, orderBy: [{ jahr: "desc" }, { kw: "desc" }], take: 8 }),
    db.einsatz.findFirst({ where: { personId: s.personId, status: "AKTIV", stundenerfassungApp: true }, include: { kunde: true } }),
    db.person.findUnique({ where: { id: s.personId }, select: { wochenstunden: true } }),
  ]);
  // Ohne freigeschalteten Einsatz gibt es in der App keinen Stundenzettel – der Weg bleibt wie bisher
  if (!einsatz && !n) redirect("/app?hinweis=keinestunden");
  // KEINE Vorbelegung mit 8 Stunden: die Zahl wird aus Beginn, Ende und Pause gerechnet.
  // Eine vorbefüllte 8 hatte Vorrang vor den Zeiten und führte dazu, dass 11 gearbeitete Stunden als 8 abgerechnet wurden.
  const werte = (n?.tage as number[] | null) ?? [];
  const detail = ((n?.eintraege as Tageseintrag[] | null) ?? []) as Tageseintrag[];
  const fix = n?.status === "BESTAETIGT";
  const feld = ["mo", "di", "mi", "do", "fr", "sa", "so"];
  return (
    <AppShell navLabels={navLabels(t)}>
      <AppKopf titel={t("stunden.titel")} zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <Link href={`/app/stunden?jahr=${prev.jahr}&kw=${prev.kw}`} className="btn btn-secondary btn-sm">‹ KW {prev.kw}</Link>
          <div className="text-center"><div className="font-display font-bold">KW {w.kw} / {w.jahr}</div><div className="text-[12.5px] text-muted">{datum(tage[0])} – {datum(tage[6])}</div></div>
          <Link href={`/app/stunden?jahr=${next.jahr}&kw=${next.kw}`} className="btn btn-secondary btn-sm">KW {next.kw} ›</Link>
        </div>
        {sp.ok && <div className="alert alert-teal"><span>Danke! Dein Stundennachweis ist eingereicht – die Dispo prüft ihn.</span></div>}
        {sp.fehler === "bestaetigt" && <div className="alert alert-amber"><span>Diese Woche ist schon bestätigt und kann nicht mehr geändert werden – bei Fehlern bitte im Chat melden.</span></div>}
        {sp.fehler === "gross" && <div className="alert alert-red"><span>Das Foto ist zu groß (max. 15 MB).</span></div>}
        {n?.status === "ABGELEHNT" && <div className="alert alert-red"><span><b>Bitte korrigieren:</b> {n.rueckmeldung ?? "Rückfrage der Dispo – siehe Chat."}</span></div>}
        {n?.status === "BESTAETIGT" && <div className="alert alert-teal"><span>Bestätigt am {datum(n.geprueftAm)} – {n.summe} Stunden.</span></div>}
        {n?.status === "EINGEREICHT" && <div className="alert alert-amber"><span>Eingereicht am {datum(n.eingereichtAm)} – wartet auf Prüfung. Du kannst noch ändern.</span></div>}
        <form action={stundenEinreichen} className="card card-pad space-y-3">
          <input type="hidden" name="jahr" value={w.jahr} /><input type="hidden" name="kw" value={w.kw} />
          {!fix && <StundenRechner />}
          {einsatz && <div className="text-[12.5px] text-muted">Einsatz: <b className="text-ink">{einsatz.kunde.firmenname}</b> · {einsatz.rolleImEinsatz}</div>}
          {!fix && <SchichtVorlagen label={t("stunden.vorlagen")} />}
          <div className="space-y-2">
            {TAGE.map((tag, i) => { const e = detail[i] ?? {}; return (
              <div key={tag} className={`rounded-lg border border-line p-2.5 ${i >= 5 ? "bg-surface-2" : ""}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[12.5px] font-semibold">{tag} <span className="text-muted font-normal">{tage[i].getDate()}.{tage[i].getMonth() + 1}.</span></div>
                  <select name={`${feld[i]}_fehlzeit`} defaultValue={e.fehlzeit ?? ""} disabled={fix} className="select !py-1 !px-2 !text-[12.5px] !w-auto">{FEHLZEITEN.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <label className="block"><span className="text-[11px] text-muted">{t("stunden.beginn")}</span><input name={`${feld[i]}_beginn`} defaultValue={e.beginn ?? ""} placeholder={i < 5 ? "07:00" : ""} inputMode="numeric" readOnly={fix} className="input !px-1 !py-2 text-center !text-[15px]" /></label>
                  <label className="block"><span className="text-[11px] text-muted">{t("stunden.ende")}</span><input name={`${feld[i]}_ende`} defaultValue={e.ende ?? ""} placeholder={i < 5 ? "16:00" : ""} inputMode="numeric" readOnly={fix} className="input !px-1 !py-2 text-center !text-[15px]" /></label>
                  <label className="block"><span className="text-[11px] text-muted">{t("stunden.pause")}</span><input name={`${feld[i]}_pause`} defaultValue={e.pauseMin ?? ""} placeholder={i < 5 ? "30" : ""} inputMode="numeric" readOnly={fix} className="input num !px-1 !py-2 text-center !text-[15px]" /></label>
                  <label className="block"><span className="text-[11px] text-muted">{t("stunden.stunden")}</span><input name={feld[i]} defaultValue={e.gesamt ?? werte[i] ?? ""} inputMode="decimal" placeholder="–" readOnly={fix} className="input num !px-1 !py-2 text-center !text-[15px] bg-surface-2" /></label>
                </div>
              </div>
            ); })}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[14px]">
            <span className="font-semibold">{t("stunden.wochensumme")}</span>
            <span className="num font-display font-extrabold text-[17px]"><span id="wochensumme">0</span> h</span>
          </div>
          <p className="help">{t("stunden.hilfe")}</p>
          <div className="field"><label className="label">Notiz (Überstunden, Zulagen, Besonderheiten)</label><textarea name="notiz" rows={2} defaultValue={n?.notiz ?? ""} readOnly={fix} className="textarea" /></div>
          <div className="field"><label className="label">Foto des unterschriebenen Stundenzettels {n?.fotoDokumentId ? <span className="badge badge-teal ml-1">vorhanden</span> : <span className="text-muted">(empfohlen)</span>}</label>{!fix && <input type="file" name="foto" accept="image/*,application/pdf" capture="environment" className="input" />}</div>
          {!fix && <AbsendenKnopf label={n ? t("stunden.aendern") : t("stunden.einreichen")} laueft={t("form.sendet")} />}
        </form>
        <section className="card">
          <div className="px-5 pt-4 pb-1 section-title">{t("stunden.letzteWochen")}</div>
          {letzte.length ? <ul className="divide-y divide-line">{letzte.map((x) => <li key={x.id}><Link href={`/app/stunden?jahr=${x.jahr}&kw=${x.kw}`} className="flex items-center px-5 py-2.5 text-[14px]"><span className="flex-1">KW {x.kw}/{x.jahr}</span><span className="num font-semibold mr-3">{x.summe} h{x.summeUe50 || x.summeUe100 ? <span className="text-[11px] text-muted"> (+{Math.round((x.summeUe50 + x.summeUe100) * 10) / 10} Ü)</span> : null}</span>{x.status === "BESTAETIGT" ? <span className="badge badge-teal">bestätigt</span> : x.status === "ABGELEHNT" ? <span className="badge badge-red">korrigieren</span> : <span className="badge badge-brand">eingereicht</span>}</Link></li>)}</ul> : <p className="text-muted text-[12.5px] px-5 pb-4">Noch kein Nachweis eingereicht.</p>}
        </section>
      </div>
    </AppShell>
  );
}
