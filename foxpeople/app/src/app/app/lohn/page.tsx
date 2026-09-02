import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { FileDown, Scale } from "lucide-react";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { zeitkonto } from "@/lib/zeitkonto";
import { appT } from "@/lib/app-sprache";
import { navLabels } from "@/lib/app-nav-labels";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/**
 * Lohn: die von der Lohnverrechnung hochgeladenen Lohnzettel und – sobald ein Monat wirklich abgerechnet ist –
 * der Stand des Zeitkontos. Bewusst keine Hochrechnung aus selbst eingetragenen Stunden: solange Beschäftiger
 * und Büro die Stunden nicht freigegeben haben, wäre jede Zahl nur eine Vermutung und stiftet Verwirrung.
 */
export default async function AppLohn() {
  const s = await requireApp();
  const { t } = await appT(s.personId);
  const [docs, abgerechnet] = await Promise.all([
    db.dokument.findMany({ where: { personId: s.personId, sichtbarImPortal: true, kategorie: "Lohnzettel" }, orderBy: { hochgeladenAm: "desc" } }),
    db.monatsabrechnung.count({ where: { personId: s.personId, status: "ABGERECHNET" } }),
  ]);
  // Zeitkonto erst zeigen, wenn mindestens ein Monat abgerechnet ist – vorher sind die Stunden noch nicht freigegeben
  const zk = abgerechnet > 0 ? await zeitkonto(s.personId) : null;
  return (
    <AppShell navLabels={navLabels(t)}>
      <AppKopf titel={t("lohn.titel")} zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        <section className="card">
          <div className="px-5 pt-4 pb-1 section-title">{t("lohn.lohnzettel")}</div>
          {docs.length ? (
            <ul className="divide-y divide-line">{docs.map((d) => (
              <li key={d.id}>
                <a href={`/dokumente/${d.id}`} target="_blank" className="flex items-center gap-3 px-5 py-3">
                  <FileDown size={18} className="text-fox shrink-0" />
                  <div className="flex-1 min-w-0"><div className="font-semibold text-[14px] truncate">{d.dateiname}</div><div className="text-[12.5px] text-muted">{datum(d.hochgeladenAm)}</div></div>
                </a>
              </li>
            ))}</ul>
          ) : <p className="text-muted text-[14px] px-5 pb-4">{t("lohn.keineLohnzettel")}</p>}
        </section>

        {zk && zk.sollGesamt > 0 && (
          <section className="card card-pad">
            <div className="section-title flex items-center gap-1.5 mb-1"><Scale size={14} /> {t("lohn.zeitkonto")}</div>
            <div className="flex items-end gap-2">
              <div className={`font-display font-extrabold text-[28px] leading-none ${zk.saldo < 0 ? "text-red" : "text-teal"}`}>{zk.saldo > 0 ? "+" : ""}{zk.saldo.toLocaleString("de-AT", { maximumFractionDigits: 1 })} h</div>
              <div className="text-[12.5px] text-muted pb-0.5">{t("lohn.abgerechnetBis")}</div>
            </div>
            <p className="help mt-2">Plus- und Minusstunden aus den bereits abgerechneten Monaten ({zk.istGesamt.toLocaleString("de-AT", { maximumFractionDigits: 1 })} h geleistet gegenüber {zk.sollGesamt.toLocaleString("de-AT", { maximumFractionDigits: 1 })} h Soll), Durchrechnungszeitraum bis {datum(zk.ende)}. Der laufende Monat ist noch nicht enthalten – er zählt erst, wenn Beschäftiger und Büro die Stunden freigegeben haben.</p>
          </section>
        )}

        <p className="text-[12.5px] text-muted">{t("lohn.fragen")}</p>
      </div>
    </AppShell>
  );
}
