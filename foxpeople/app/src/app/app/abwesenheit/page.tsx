import { Phone, Mail, AlertTriangle } from "lucide-react";
import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { abwesenheitMelden } from "../actions";
import { urlaubsstand, tage as tg } from "@/lib/urlaub";
import { appT } from "@/lib/app-sprache";
import { navLabels } from "@/lib/app-nav-labels";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/**
 * Urlaubsantrag über die App. **Krankmeldung ausdrücklich nicht** – die läuft ausschließlich telefonisch
 * (Entscheidung Matthias, 30.08.2026). Eine Meldung, die im Postfach liegt und niemand liest, ist keine
 * Meldung; deshalb steht hier nur der Weg zum Telefon, mit der E-Mail als Notnagel.
 */
export default async function AppAbwesenheit({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  const s = await requireApp();
  const sp = await searchParams;
  const jahr = new Date().getFullYear();
  const { t } = await appT(s.personId);
  const [p, abw, urlaubJahr, f] = await Promise.all([
    db.person.findUnique({ where: { id: s.personId }, select: { urlaubsanspruchTage: true, status: true, eintrittsdatum: true, austrittsdatum: true, kostenstelle: { select: { telefon: true, email: true } } } }),
    db.abwesenheit.findMany({ where: { personId: s.personId }, orderBy: { von: "desc" }, take: 12 }),
    // Saldo aus ALLEN Urlauben des Jahres – die 12er-Liste ist nur die Anzeige. Wer mehr als 12
    // Abwesenheiten hat, bekäme sonst einen zu hohen Resturlaub angezeigt.
    db.abwesenheit.findMany({ where: { personId: s.personId, typ: "URLAUB", status: { not: "ABGELEHNT" }, von: { gte: new Date(jahr, 0, 1), lt: new Date(jahr + 1, 0, 1) } }, select: { tage: true } }),
    ladeFirma(),
  ]);
  const urlaubGenommen = urlaubJahr.reduce((x, a) => x + a.tage, 0);
  const ul = urlaubsstand(p ?? { status: "SUCHT", eintrittsdatum: null, urlaubsanspruchTage: 25 }, urlaubGenommen, jahr);
  const heute = new Date().toISOString().slice(0, 10);
  const telefon = p?.kostenstelle.telefon ?? f.telefon ?? "+43 676 4574096";
  const mail = p?.kostenstelle.email ?? f.email ?? "office@foxandpeople.at";
  return (
    <AppShell navLabels={navLabels(t)}>
      <AppKopf titel={t("abw.titel")} zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        {sp.ok === "URLAUB" && <div className="alert alert-teal"><span>Urlaubsantrag eingereicht – du bekommst die Antwort im Chat.</span></div>}
        {sp.fehler === "datum" && <div className="alert alert-red"><span>„Bis“ darf nicht vor „Von“ liegen.</span></div>}

        {/* Krankmeldung: nur telefonisch */}
        <section className="card card-pad border-2 border-red/40">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={18} className="text-red" />
            <div className="section-title !text-red">{t("abw.krankTitel")}</div>
          </div>
          <p className="text-[13.5px]" dangerouslySetInnerHTML={{ __html: t("abw.krankText") }} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <a href={`tel:${telefon.replace(/\s/g, "")}`} className="btn btn-primary justify-center !h-12"><Phone size={17} /> {t("abw.anrufen")}</a>
            <a href={`mailto:${mail}?subject=${encodeURIComponent("Krankmeldung")}`} className="btn btn-secondary justify-center !h-12"><Mail size={17} /> {t("abw.mail")}</a>
          </div>
          <p className="help mt-2">Erreichst du uns nicht sofort, schreib zusätzlich eine E-Mail an {mail} – und ruf später noch einmal an. Die ärztliche Bestätigung bringst du mit oder lädst sie unter „Meine Unterlagen“ hoch.</p>
        </section>

        {/* Urlaub: Antrag über die App */}
        <form action={abwesenheitMelden} className="card card-pad space-y-3">
          <input type="hidden" name="typ" value="URLAUB" />
          <div className="section-title">{t("abw.urlaubBeantragen")}</div>
          <p className="text-[13.5px]">{t("abw.resturlaub")} {jahr}: <b>{tg(ul.rest)} Werktage</b> (je vollem Arbeitsmonat werden {tg(ul.proMonat)} Tage freigeschaltet – bisher {tg(ul.erworben)}). Bitte mindestens 2 Wochen vorher beantragen; der Urlaub gilt erst nach Genehmigung.</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="field"><label className="label">{t("abw.von")}</label><input type="date" name="von" required defaultValue={heute} className="input" /></div>
            <div className="field"><label className="label">{t("abw.bis")}</label><input type="date" name="bis" defaultValue={heute} className="input" /></div>
          </div>
          <div className="field"><label className="label">Notiz</label><input name="notiz" className="input" placeholder="z. B. Familienurlaub" /></div>
          <button className="btn btn-primary w-full justify-center !h-12">{t("abw.urlaubBeantragen")}</button>
        </form>

        <section className="card">
          <div className="px-5 pt-4 pb-1 section-title">Bisherige Meldungen</div>
          {abw.length ? (
            <ul className="divide-y divide-line">{abw.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
                <span className="flex-1">{({ URLAUB: "Urlaub", KRANKENSTAND: "Krankenstand", PFLEGEFREISTELLUNG: "Pflegefreistellung", SONSTIGES: "Sonstiges", ZEITAUSGLEICH: "Zeitausgleich" } as Record<string, string>)[a.typ] ?? a.typ}<div className="text-[12px] text-muted">{datum(a.von)} – {datum(a.bis)} · {a.tage} Tage</div></span>
                {a.status === "BEANTRAGT" ? <span className="badge badge-brand">beantragt</span> : a.status === "ABGELEHNT" ? <span className="badge badge-red">abgelehnt</span> : <span className="badge badge-teal">{a.typ === "URLAUB" ? "genehmigt" : "erfasst"}</span>}
              </li>
            ))}</ul>
          ) : <p className="text-muted text-[13px] px-5 pb-4">Noch keine Meldungen.</p>}
        </section>
      </div>
    </AppShell>
  );
}
