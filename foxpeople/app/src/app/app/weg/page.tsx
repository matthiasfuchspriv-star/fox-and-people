import Link from "next/link";
import { Award, Building2, Clock, GraduationCap, Gift, CalendarRange } from "lucide-react";
import { requireApp } from "@/lib/app-auth";
import { datum, eur } from "@/lib/format";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { Fuechse } from "@/components/fuechse";
import { MerkmalChips } from "@/components/bewertung-felder";
import { wegDaten } from "@/lib/weg";
import { appT } from "@/lib/app-sprache";
import { navLabels } from "@/lib/app-nav-labels";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/** „Dein Weg bei uns“ – Anerkennung sichtbar machen: Dauer, Einsätze, Stunden, Rückmeldungen, Prämien, nächster Schritt. */
export default async function AppWeg() {
  const s = await requireApp();
  const [{ t }, d] = await Promise.all([appT(s.personId), wegDaten(s.personId)]);
  if (!d) return null;
  const jahre = Math.floor(d.monateDabei / 12);
  const restMonate = d.monateDabei % 12;
  const dauer = d.eintritt ? (jahre > 0 ? `${jahre} Jahr${jahre > 1 ? "e" : ""}${restMonate ? ` ${restMonate} Mon.` : ""}` : `${d.monateDabei} Monate`) : "–";
  return (
    <AppShell navLabels={navLabels(t)}>
      <AppKopf titel={t("weg.titel")} zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        <section className="card card-pad" style={{ background: "linear-gradient(135deg, #10222a 0%, #1c3a45 100%)", color: "#fff" }}>
          <Award size={24} className="text-fox" />
          <div className="font-display font-extrabold text-[22px] mt-2">{dauer}</div>
          <div className="text-[13px] text-white/75">{t("weg.dabeiSeit")} {d.eintritt ? datum(d.eintritt) : "–"}</div>
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/15 text-center">
            <div><div className="font-display font-extrabold text-[20px] leading-none">{d.einsaetze.length}</div><div className="text-[11px] text-white/65 mt-1">{t("weg.einsaetze")}</div></div>
            <div><div className="font-display font-extrabold text-[20px] leading-none">{d.stundenGesamt.toLocaleString("de-AT")}</div><div className="text-[11px] text-white/65 mt-1">{t("weg.stunden")}</div></div>
            <div><div className="font-display font-extrabold text-[20px] leading-none">{d.betriebe}</div><div className="text-[11px] text-white/65 mt-1">{t("weg.betriebe")}</div></div>
          </div>
        </section>

        {d.bewertungen.length > 0 ? (
          <section className="card">
            <div className="px-5 pt-4 pb-1 flex items-center justify-between">
              <div className="section-title">{t("weg.bewertungen")}</div>
              {d.schnitt != null && <div className="flex items-center gap-1.5"><Fuechse n={Math.round(d.schnitt)} /><span className="text-[13px] font-bold">{d.schnitt.toLocaleString("de-AT")}</span></div>}
            </div>
            <ul className="divide-y divide-line">{d.bewertungen.slice(0, 8).map((b, i) => (
              <li key={i} className="px-5 py-3 text-[13.5px]">
                <div className="flex items-center gap-2"><Fuechse n={b.sterne} /><span className="font-semibold">{b.kunde}</span><span className="text-muted text-[12px] ml-auto">{datum(b.datum)}</span></div>
                <MerkmalChips merkmale={b.merkmale} />
                {b.kommentar && <p className="text-muted mt-1">„{b.kommentar}“</p>}
              </li>
            ))}</ul>
          </section>
        ) : (
          <section className="card card-pad text-[13.5px] text-muted">{t("weg.keineBewertungen")}</section>
        )}

        {d.naechsterSchritt && (
          <section className="card card-pad">
            <div className="section-title mb-1 flex items-center gap-1.5"><GraduationCap size={14} /> {t("weg.naechsterSchritt")}</div>
            <div className="font-display font-bold text-[16px]">{d.naechsterSchritt.titel}</div>
            <p className="text-[13.5px] text-muted mt-1">{d.naechsterSchritt.text}</p>
            <Link href="/app/chat" className="btn btn-primary btn-sm mt-3">Interesse – schreib uns</Link>
            <p className="help mt-2">Kurse, die auf der Liste des Sozial- und Weiterbildungsfonds (SWF) stehen, zahlen wir. Frag einfach im Chat nach.</p>
          </section>
        )}

        {d.einsaetze.length > 0 && (
          <section className="card">
            <div className="px-5 pt-4 pb-1 section-title flex items-center gap-1.5"><Building2 size={14} /> {t("weg.einsaetze")}</div>
            <ul className="divide-y divide-line">{d.einsaetze.map((e, i) => (
              <li key={i} className="px-5 py-2.5 text-[13.5px] flex items-center gap-3">
                <CalendarRange size={15} className="text-fox shrink-0" />
                <span className="flex-1"><b>{e.kunde}</b><div className="text-[12px] text-muted">{e.rolle} · {datum(e.von)} – {e.bis ? datum(e.bis) : "läuft"}</div></span>
                {e.aktiv && <span className="badge badge-teal">aktiv</span>}
              </li>
            ))}</ul>
          </section>
        )}

        {d.nachweise.length > 0 && (
          <section className="card">
            <div className="px-5 pt-4 pb-1 section-title flex items-center gap-1.5"><Clock size={14} /> {t("weg.nachweise")}</div>
            <ul className="divide-y divide-line">{d.nachweise.map((q, i) => (
              <li key={i} className="px-5 py-2.5 text-[13.5px] flex items-center gap-3">
                <span className="flex-1"><b>{q.typ}</b>{q.bezeichnung && <div className="text-[12px] text-muted">{q.bezeichnung}</div>}</span>
                <span className="text-[12px] text-muted">{q.gultigBis ? `bis ${datum(q.gultigBis)}` : "unbefristet"}</span>
              </li>
            ))}</ul>
          </section>
        )}

        {d.praemien.erfolgreich > 0 && (
          <Link href="/app/empfehlen" className="block card card-pad">
            <div className="section-title mb-1 flex items-center gap-1.5"><Gift size={14} /> {t("weg.praemien")}</div>
            <div className="font-display font-extrabold text-[22px] text-fox">{eur(d.praemien.gesamt, 0)}</div>
            <div className="text-[13px] text-muted">aus {d.praemien.erfolgreich} erfolgreichen Empfehlungen – danke!</div>
          </Link>
        )}
      </div>
    </AppShell>
  );
}
