import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { ONBOARDING } from "@/lib/onboarding";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/**
 * Was bis zum ersten Arbeitstag noch fehlt – dieselbe Checkliste wie im Büro, aber aus der Sicht des
 * Mitarbeiters: nur die Punkte, die er selbst beisteuern kann, mit einem direkten Weg zum Hochladen.
 */
const SELBST: Record<string, { text: string; href?: string }> = {
  ausweis: { text: "Ausweis fotografieren und hochladen (Reisepass oder Personalausweis, beide Seiten)", href: "/app/profil" },
  meldezettel: { text: "Meldezettel hochladen", href: "/app/profil" },
  ecard: { text: "e-card fotografieren und hochladen", href: "/app/profil" },
  aufenthaltstitel: { text: "Aufenthaltstitel mit Arbeitsmarktzugang hochladen (nur Nicht-EU/EWR)", href: "/app/profil" },
  iban: { text: "Bankverbindung (IBAN) bekanntgeben", href: "/app/chat" },
  zeugnisse: { text: "Zeugnisse und Nachweise hochladen (Staplerschein, Schweißpass, Lehrabschluss)", href: "/app/profil" },
  notfallkontakt: { text: "Notfallkontakt angeben (Name und Telefonnummer)", href: "/app/profil" },
  kleidergroesse: { text: "Kleider- und Schuhgröße bekanntgeben", href: "/app/chat" },
  arbeitsvertrag: { text: "Arbeitsvertrag unterschrieben zurückgeben", href: "/app/profil" },
  zusatzvereinbarung: { text: "Zusatzvereinbarung unterschrieben zurückgeben", href: "/app/profil" },
  ueberlassungsmitteilung: { text: "Überlassungsmitteilung unterschrieben zurückgeben", href: "/app/profil" },
};

export default async function AppCheckliste() {
  const s = await requireApp();
  const p = await db.person.findUnique({ where: { id: s.personId }, select: { onboarding: true, fotoDokumentId: true, profilBestaetigtAm: true, staatsangehoerigkeit: true } });
  const ob = (p?.onboarding as Record<string, string> | null) ?? {};
  const punkte = ONBOARDING.filter((o) => SELBST[o.key]).filter((o) => o.key !== "aufenthaltstitel" || !!p?.staatsangehoerigkeit);
  const offen = punkte.filter((o) => !ob[o.key]);
  const fertig = punkte.length - offen.length;
  return (
    <AppShell>
      <AppKopf titel="Was noch fehlt" zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        <section className="card card-pad">
          <div className="section-title mb-1">Dein Stand</div>
          <div className="flex items-end gap-2"><div className="font-display font-extrabold text-[28px] leading-none">{fertig} von {punkte.length}</div><div className="text-[12.5px] text-muted pb-1">erledigt</div></div>
          <div className="h-2 rounded-full bg-surface-2 mt-3 overflow-hidden"><div className="h-full bg-fox" style={{ width: `${punkte.length ? (fertig / punkte.length) * 100 : 0}%` }} /></div>
          <p className="help mt-2">Sobald alles da ist, können wir dich anmelden und du kannst starten. Wir haken die Punkte ab, sobald wir die Unterlagen geprüft haben.</p>
        </section>

        <section className="card">
          <div className="px-5 pt-4 pb-1 section-title">Offen</div>
          {offen.length ? (
            <ul className="divide-y divide-line">{offen.map((o) => { const x = SELBST[o.key]; return (
              <li key={o.key}>
                {x.href ? <Link href={x.href} className="flex items-start gap-3 px-5 py-3 text-[14px]"><Circle size={17} className="text-amber shrink-0 mt-0.5" /><span className="flex-1">{x.text}{o.hinweis && <span className="block text-[12.5px] text-muted">{o.hinweis}</span>}</span></Link>
                  : <div className="flex items-start gap-3 px-5 py-3 text-[14px]"><Circle size={17} className="text-amber shrink-0 mt-0.5" /><span className="flex-1">{x.text}</span></div>}
              </li>
            ); })}</ul>
          ) : <p className="text-[14px] px-5 pb-4">Alles erledigt – danke! Wenn noch etwas fehlt, melden wir uns im Chat.</p>}
        </section>

        {fertig > 0 && (
          <section className="card">
            <div className="px-5 pt-4 pb-1 section-title">Erledigt</div>
            <ul className="divide-y divide-line">{punkte.filter((o) => ob[o.key]).map((o) => (
              <li key={o.key} className="flex items-start gap-3 px-5 py-2.5 text-[14px] text-muted"><CheckCircle2 size={17} className="text-teal shrink-0 mt-0.5" /><span className="flex-1">{SELBST[o.key].text}</span></li>
            ))}</ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
